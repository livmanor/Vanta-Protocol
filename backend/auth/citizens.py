"""Citizen accounts (username/password) and field-report photo uploads."""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import aiosqlite

from backend.auth.passwords import hash_password, verify_password
from backend.config import settings
from backend.db import DB_PATH

logger = logging.getLogger("vanta.citizen")

CITIZEN_SESSION_COOKIE = "vanta_citizen_session"
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "data" / "citizen_uploads"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
# Fixed demo/local citizen credentials (always seeded on startup).
BOOTSTRAP_CITIZEN_USERNAME = "citizen123"
BOOTSTRAP_CITIZEN_PASSWORD = "citizen"
BOOTSTRAP_CITIZEN_DISPLAY_NAME = "Citizen Reporter"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None = None) -> str:
    return (value or _now()).astimezone(timezone.utc).isoformat()


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def ensure_citizen_tables(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS citizens (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_login_at TEXT
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS citizen_sessions (
            token_hash TEXT PRIMARY KEY,
            citizen_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (citizen_id) REFERENCES citizens(id)
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS citizen_reports (
            id TEXT PRIMARY KEY,
            citizen_id TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            area TEXT,
            phase TEXT NOT NULL,
            message TEXT NOT NULL,
            photo_path TEXT NOT NULL,
            photo_content_type TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            reviewed_at TEXT,
            reviewed_by TEXT,
            linked_incident_id TEXT,
            FOREIGN KEY (citizen_id) REFERENCES citizens(id)
        )
        """
    )
    try:
        await db.execute("ALTER TABLE citizen_reports ADD COLUMN area TEXT")
    except Exception:
        pass


def ensure_upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


async def ensure_bootstrap_citizen() -> None:
    """Ensure the constant citizen123 / citizen account exists and matches those credentials."""
    username = BOOTSTRAP_CITIZEN_USERNAME
    password = BOOTSTRAP_CITIZEN_PASSWORD
    display = BOOTSTRAP_CITIZEN_DISPLAY_NAME
    async with aiosqlite.connect(DB_PATH) as db:
        await ensure_citizen_tables(db)
        async with db.execute("SELECT id FROM citizens WHERE username = ?", (username,)) as cur:
            existing = await cur.fetchone()
        if existing:
            await db.execute(
                "UPDATE citizens SET password_hash = ?, display_name = ? WHERE username = ?",
                (hash_password(password), display, username),
            )
            await db.commit()
            return
        citizen_id = f"citizen-{uuid.uuid4().hex[:10]}"
        await db.execute(
            """
            INSERT INTO citizens (id, username, display_name, password_hash, created_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, NULL)
            """,
            (citizen_id, username, display, hash_password(password), _iso()),
        )
        await db.commit()
        logger.info("Bootstrap citizen account created for username %s", username)


async def register_citizen(username: str, password: str, display_name: str = "") -> dict[str, Any]:
    clean_user = username.strip().lower()
    if len(clean_user) < 3 or len(clean_user) > 40:
        raise ValueError("Username must be 3–40 characters.")
    if any(ch.isspace() for ch in clean_user):
        raise ValueError("Username cannot contain spaces.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    display = (display_name or clean_user).strip()[:80] or clean_user
    citizen_id = f"citizen-{uuid.uuid4().hex[:10]}"
    async with aiosqlite.connect(DB_PATH) as db:
        await ensure_citizen_tables(db)
        try:
            await db.execute(
                """
                INSERT INTO citizens (id, username, display_name, password_hash, created_at, last_login_at)
                VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (citizen_id, clean_user, display, hash_password(password), _iso()),
            )
            await db.commit()
        except aiosqlite.IntegrityError as exc:
            raise ValueError("That username is already taken.") from exc
    return await authenticate_citizen(clean_user, password)  # type: ignore[return-value]


async def authenticate_citizen(username: str, password: str) -> Optional[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        async with db.execute(
            "SELECT id, username, display_name, password_hash FROM citizens WHERE username = ?",
            (username.strip().lower(),),
        ) as cur:
            row = await cur.fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            return None
        token = secrets.token_urlsafe(32)
        expires = _now() + timedelta(hours=max(1, int(settings.SESSION_TTL_HOURS)))
        await db.execute(
            """
            INSERT INTO citizen_sessions (token_hash, citizen_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (_token_digest(token), row["id"], _iso(), _iso(expires)),
        )
        await db.execute(
            "UPDATE citizens SET last_login_at = ? WHERE id = ?",
            (_iso(), row["id"]),
        )
        await db.commit()
        return {
            "token": token,
            "expires_at": _iso(expires),
            "citizen": {
                "id": row["id"],
                "username": row["username"],
                "display_name": row["display_name"],
                "role": "citizen",
            },
        }


async def citizen_for_token(token: str | None) -> Optional[dict[str, Any]]:
    if not token:
        return None
    digest = _token_digest(token)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        async with db.execute(
            """
            SELECT c.id, c.username, c.display_name, s.expires_at
            FROM citizen_sessions s
            JOIN citizens c ON c.id = s.citizen_id
            WHERE s.token_hash = ?
            """,
            (digest,),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < _now():
            await db.execute("DELETE FROM citizen_sessions WHERE token_hash = ?", (digest,))
            await db.commit()
            return None
        return {
            "id": row["id"],
            "username": row["username"],
            "display_name": row["display_name"],
            "role": "citizen",
        }


async def logout_citizen(token: str | None) -> None:
    if not token:
        return
    async with aiosqlite.connect(DB_PATH) as db:
        await ensure_citizen_tables(db)
        await db.execute(
            "DELETE FROM citizen_sessions WHERE token_hash = ?",
            (_token_digest(token),),
        )
        await db.commit()


def _row_to_report(row: aiosqlite.Row) -> dict[str, Any]:
    keys = row.keys()
    return {
        "id": row["id"],
        "citizen_id": row["citizen_id"],
        "citizen_username": row["username"] if "username" in keys else None,
        "citizen_display_name": row["display_name"] if "display_name" in keys else None,
        "lat": row["lat"],
        "lng": row["lng"],
        "area": row["area"] if "area" in keys else None,
        "phase": row["phase"],
        "message": row["message"],
        "photo_content_type": row["photo_content_type"],
        "status": row["status"],
        "created_at": row["created_at"],
        "reviewed_at": row["reviewed_at"],
        "reviewed_by": row["reviewed_by"],
        "linked_incident_id": row["linked_incident_id"],
        "photo_url": f"/api/citizen-reports/{row['id']}/photo",
    }


async def create_report(
    *,
    citizen_id: str,
    lat: float,
    lng: float,
    area: str,
    phase: str,
    message: str,
    photo_bytes: bytes,
    content_type: str,
) -> dict[str, Any]:
    if phase not in ("before", "during", "after"):
        raise ValueError("phase must be before, during, or after.")
    clean_area = (area or "").strip()
    if len(clean_area) < 2:
        raise ValueError("Enter the area or landmark where the issue is.")
    clean_message = (message or "").strip()
    if len(clean_message) < 3:
        raise ValueError("Add a short description of what you see.")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Photo must be JPEG, PNG, or WebP.")
    if not photo_bytes:
        raise ValueError("Photo is required.")
    if len(photo_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("Photo must be 5 MB or smaller.")

    ensure_upload_dir()
    report_id = f"crep-{uuid.uuid4().hex[:10]}"
    filename = f"{report_id}{ALLOWED_CONTENT_TYPES[content_type]}"
    dest = UPLOAD_DIR / filename
    dest.write_bytes(photo_bytes)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        await db.execute(
            """
            INSERT INTO citizen_reports (
                id, citizen_id, lat, lng, area, phase, message, photo_path, photo_content_type,
                status, created_at, reviewed_at, reviewed_by, linked_incident_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, NULL)
            """,
            (
                report_id, citizen_id, float(lat), float(lng), clean_area[:120], phase,
                clean_message[:500], str(dest), content_type, _iso(),
            ),
        )
        await db.commit()
        async with db.execute(
            """
            SELECT r.*, c.username, c.display_name
            FROM citizen_reports r
            JOIN citizens c ON c.id = r.citizen_id
            WHERE r.id = ?
            """,
            (report_id,),
        ) as cur:
            row = await cur.fetchone()
    return _row_to_report(row)


async def list_reports_for_citizen(citizen_id: str) -> list[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        async with db.execute(
            """
            SELECT r.*, c.username, c.display_name
            FROM citizen_reports r
            JOIN citizens c ON c.id = r.citizen_id
            WHERE r.citizen_id = ?
            ORDER BY r.created_at DESC
            """,
            (citizen_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_report(row) for row in rows]


async def list_reports_for_officers(status: str | None = None) -> list[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        if status:
            query = """
                SELECT r.*, c.username, c.display_name
                FROM citizen_reports r
                JOIN citizens c ON c.id = r.citizen_id
                WHERE r.status = ?
                ORDER BY r.created_at DESC
            """
            params: tuple[Any, ...] = (status,)
        else:
            query = """
                SELECT r.*, c.username, c.display_name
                FROM citizen_reports r
                JOIN citizens c ON c.id = r.citizen_id
                ORDER BY r.created_at DESC
            """
            params = ()
        async with db.execute(query, params) as cur:
            rows = await cur.fetchall()
    return [_row_to_report(row) for row in rows]


async def get_report(report_id: str) -> Optional[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        async with db.execute(
            """
            SELECT r.*, c.username, c.display_name
            FROM citizen_reports r
            JOIN citizens c ON c.id = r.citizen_id
            WHERE r.id = ?
            """,
            (report_id,),
        ) as cur:
            row = await cur.fetchone()
    return _row_to_report(row) if row else None


async def get_report_photo(report_id: str) -> Optional[tuple[Path, str]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        async with db.execute(
            "SELECT photo_path, photo_content_type FROM citizen_reports WHERE id = ?",
            (report_id,),
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    path = Path(row["photo_path"])
    if not path.is_file():
        return None
    return path, row["photo_content_type"]


async def review_report(
    report_id: str,
    *,
    decision: str,
    officer_id: str,
    linked_incident_id: str | None = None,
) -> dict[str, Any]:
    if decision not in ("accepted", "rejected"):
        raise ValueError("decision must be accepted or rejected.")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_citizen_tables(db)
        async with db.execute("SELECT * FROM citizen_reports WHERE id = ?", (report_id,)) as cur:
            existing = await cur.fetchone()
        if not existing:
            raise KeyError("Report not found")
        await db.execute(
            """
            UPDATE citizen_reports
            SET status = ?, reviewed_at = ?, reviewed_by = ?, linked_incident_id = ?
            WHERE id = ?
            """,
            (decision, _iso(), officer_id, linked_incident_id, report_id),
        )
        await db.commit()
    report = await get_report(report_id)
    assert report is not None
    return report
