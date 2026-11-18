"""SQLite-backed officer accounts and opaque session tokens."""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import aiosqlite

from backend.auth.passwords import hash_password, verify_password
from backend.auth.settings import bootstrap_configured
from backend.config import settings
from backend.db import DB_PATH

logger = logging.getLogger("vanta.auth")

SESSION_COOKIE = "vanta_session"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def ensure_auth_tables(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS officers (
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
        CREATE TABLE IF NOT EXISTS officer_sessions (
            token_hash TEXT PRIMARY KEY,
            officer_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (officer_id) REFERENCES officers(id)
        )
        """
    )


async def ensure_bootstrap_officer() -> None:
    """Create the first officer from env if the username is not already present."""
    if not bootstrap_configured():
        return
    username = settings.BOOTSTRAP_OFFICER_USERNAME.strip()
    password = settings.BOOTSTRAP_OFFICER_PASSWORD.get_secret_value()
    display = settings.BOOTSTRAP_OFFICER_DISPLAY_NAME.strip() or username
    async with aiosqlite.connect(DB_PATH) as db:
        await ensure_auth_tables(db)
        async with db.execute("SELECT id FROM officers WHERE username = ?", (username,)) as cur:
            existing = await cur.fetchone()
        if existing:
            await db.commit()
            return
        officer_id = f"officer-{uuid.uuid4().hex[:10]}"
        await db.execute(
            """
            INSERT INTO officers (id, username, display_name, password_hash, created_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, NULL)
            """,
            (officer_id, username, display, hash_password(password), _iso(_now())),
        )
        await db.commit()
        logger.info("Bootstrap officer account created for username %s", username)


async def authenticate(username: str, password: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_auth_tables(db)
        async with db.execute(
            "SELECT id, username, display_name, password_hash FROM officers WHERE username = ?",
            (username.strip(),),
        ) as cur:
            row = await cur.fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            return None
        token = secrets.token_urlsafe(32)
        expires = _now() + timedelta(hours=max(1, int(settings.SESSION_TTL_HOURS)))
        await db.execute(
            """
            INSERT INTO officer_sessions (token_hash, officer_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (_token_digest(token), row["id"], _iso(_now()), _iso(expires)),
        )
        await db.execute(
            "UPDATE officers SET last_login_at = ? WHERE id = ?",
            (_iso(_now()), row["id"]),
        )
        await db.commit()
        return {
            "token": token,
            "expires_at": _iso(expires),
            "officer": {
                "id": row["id"],
                "username": row["username"],
                "display_name": row["display_name"],
                "officer_id": row["display_name"] or row["username"],
            },
        }


async def officer_for_token(token: str | None) -> Optional[dict]:
    if not token or not token.strip():
        return None
    digest = _token_digest(token.strip())
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_auth_tables(db)
        async with db.execute(
            """
            SELECT s.expires_at, o.id, o.username, o.display_name
            FROM officer_sessions s
            JOIN officers o ON o.id = s.officer_id
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
        if expires <= _now():
            await db.execute("DELETE FROM officer_sessions WHERE token_hash = ?", (digest,))
            await db.commit()
            return None
        return {
            "id": row["id"],
            "username": row["username"],
            "display_name": row["display_name"],
            "officer_id": row["display_name"] or row["username"],
        }


async def revoke_token(token: str | None) -> None:
    if not token:
        return
    async with aiosqlite.connect(DB_PATH) as db:
        await ensure_auth_tables(db)
        await db.execute(
            "DELETE FROM officer_sessions WHERE token_hash = ?",
            (_token_digest(token.strip()),),
        )
        await db.commit()


async def officer_count() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        await ensure_auth_tables(db)
        async with db.execute("SELECT COUNT(*) FROM officers") as cur:
            row = await cur.fetchone()
        return int(row[0] if row else 0)
