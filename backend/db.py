import aiosqlite
import json
from datetime import datetime, timezone
from backend.config import settings
from backend.models import Incident, Unit, BlockedRoad

DB_PATH = settings.DATABASE_PATH

async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        # Incidents table (starts empty, filled only via real officer input)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                type TEXT NOT NULL,
                urgency INTEGER NOT NULL,
                people INTEGER NOT NULL,
                vulnerable INTEGER NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                source TEXT NOT NULL
            );
        """)
        
        # Units table (starts empty, registered only via real officer input)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS units (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                capacity INTEGER NOT NULL,
                status TEXT NOT NULL,
                station TEXT NOT NULL,
                position_updated_at TEXT NOT NULL
            );
        """)

        # Blocked roads table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS blocked_roads (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                geometry TEXT NOT NULL,
                reason TEXT NOT NULL,
                reported_by TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
        """)

        # Officer decisions audit log (human-in-the-loop tracking)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS officer_decisions (
                id TEXT PRIMARY KEY,
                decision_type TEXT NOT NULL,
                details TEXT NOT NULL,
                officer_id TEXT NOT NULL,
                approved_at TEXT NOT NULL
            );
        """)
        await db.execute("""CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
            area TEXT NOT NULL, group_name TEXT NOT NULL, created_at TEXT NOT NULL
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS operations_calendar (
            id TEXT PRIMARY KEY, event_json TEXT NOT NULL, valid_from TEXT NOT NULL,
            valid_until TEXT NOT NULL, updated_at TEXT NOT NULL
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS sos_send_logs (
            id TEXT PRIMARY KEY, sent_at TEXT NOT NULL, officer_id TEXT NOT NULL,
            message TEXT NOT NULL, recipients_json TEXT NOT NULL, status TEXT NOT NULL,
            test_mode INTEGER NOT NULL
        )""")
        await db.commit()

# --- Incidents CRUD ---
async def fetch_incidents():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM incidents ORDER BY timestamp DESC") as cursor:
            rows = await cursor.fetchall()
            return [
                Incident(
                    id=row["id"],
                    lat=row["lat"],
                    lng=row["lng"],
                    type=row["type"],
                    urgency=row["urgency"],
                    people=row["people"],
                    vulnerable=bool(row["vulnerable"]),
                    message=row["message"],
                    timestamp=row["timestamp"],
                    status=row["status"],
                    source=row["source"]
                )
                for row in rows
            ]

async def insert_incident(incident: Incident):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO incidents (id, lat, lng, type, urgency, people, vulnerable, message, timestamp, status, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                incident.id, incident.lat, incident.lng, incident.type, incident.urgency,
                incident.people, 1 if incident.vulnerable else 0, incident.message,
                incident.timestamp, incident.status, incident.source
            )
        )
        await db.commit()

async def update_incident_status(incident_id: str, status: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE incidents SET status = ? WHERE id = ?", (status, incident_id))
        await db.commit()

# --- Units CRUD ---
async def fetch_units():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM units ORDER BY position_updated_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [
                Unit(
                    id=row["id"],
                    kind=row["kind"],
                    lat=row["lat"],
                    lng=row["lng"],
                    capacity=row["capacity"],
                    status=row["status"],
                    station=row["station"],
                    position_updated_at=row["position_updated_at"]
                )
                for row in rows
            ]

async def insert_unit(unit: Unit):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO units (id, kind, lat, lng, capacity, status, station, position_updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                unit.id, unit.kind, unit.lat, unit.lng, unit.capacity, unit.status, unit.station, unit.position_updated_at
            )
        )
        await db.commit()

async def update_unit_status(unit_id: str, status: str):
    async with aiosqlite.connect(DB_PATH) as db:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.execute("UPDATE units SET status = ?, position_updated_at = ? WHERE id = ?", (status, now_iso, unit_id))
        await db.commit()

# --- Blocked Roads CRUD ---
async def fetch_blocked_roads():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM blocked_roads ORDER BY timestamp DESC") as cursor:
            rows = await cursor.fetchall()
            return [
                BlockedRoad(
                    id=row["id"],
                    name=row["name"],
                    geometry=json.loads(row["geometry"]),
                    reason=row["reason"],
                    reported_by=row["reported_by"],
                    timestamp=row["timestamp"]
                )
                for row in rows
            ]

async def insert_blocked_road(blocked_road: BlockedRoad):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO blocked_roads (id, name, geometry, reason, reported_by, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                blocked_road.id, blocked_road.name, json.dumps(blocked_road.geometry),
                blocked_road.reason, blocked_road.reported_by, blocked_road.timestamp
            )
        )
        await db.commit()

# --- Officer Decisions (Human-in-the-loop Log) ---
async def log_officer_decision(decision_id: str, decision_type: str, details: dict, officer_id: str = "Officer-ControlRoom"):
    async with aiosqlite.connect(DB_PATH) as db:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """
            INSERT INTO officer_decisions (id, decision_type, details, officer_id, approved_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (decision_id, decision_type, json.dumps(details), officer_id, now_iso)
        )
        await db.commit()

