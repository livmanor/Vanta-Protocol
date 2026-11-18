"""CAP ingest, district match, status semantics, and operations floor."""
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiosqlite
import pytest
from defusedxml import EntitiesForbidden
from defusedxml import ElementTree as ET

from backend.config import settings
from backend.data_sources import cap_alerts as cap
from backend.services.operations_plan import combine_band, rain_band, refresh_operations_plan

FIXTURES = Path(__file__).parent / "fixtures" / "cap"
IST = timezone(timedelta(hours=5, minutes=30))


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture()
def cap_db(tmp_path, monkeypatch):
    db_path = tmp_path / "cap.db"
    monkeypatch.setattr(settings, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr("backend.db.DB_PATH", str(db_path))
    monkeypatch.setattr(cap, "DB_PATH", str(db_path))
    monkeypatch.setattr(settings, "CAP_HYD_DISTRICT_CODES", "507,700,518,691")
    monkeypatch.setattr(settings, "CAP_ALLOWED_HOSTS", "sachet.ndma.gov.in,cap-sources.s3.amazonaws.com")
    monkeypatch.setattr(settings, "CAP_POLL_SECONDS", 300)
    cap.reset_poll_state_for_tests()
    asyncio.run(_init(db_path))
    yield db_path


async def _init(db_path):
    async with aiosqlite.connect(db_path) as db:
        await cap.ensure_cap_table(db)
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS operations_calendar (
                id TEXT PRIMARY KEY, event_json TEXT NOT NULL, valid_from TEXT NOT NULL,
                valid_until TEXT NOT NULL, updated_at TEXT NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS units (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
                capacity INTEGER NOT NULL, status TEXT NOT NULL, station TEXT NOT NULL,
                position_updated_at TEXT NOT NULL
            )
            """
        )
        await db.commit()


async def _store(xml: str, active: int | None = None):
    alert = cap.parse_cap_xml(xml)
    if active is None:
        expires = cap._parse_dt(alert.expires)
        active = 0 if expires and expires <= cap._now_utc() else 1
    async with aiosqlite.connect(cap.DB_PATH) as db:
        await cap.ensure_cap_table(db)
        await cap._upsert_alert(db, alert, datetime.now(timezone.utc).isoformat(), active=active)
        if (alert.msg_type or "") == "Update":
            await cap._mark_superseded(db, cap.referenced_identifiers(alert.references), alert.identifier)
        if (alert.msg_type or "") == "Cancel":
            await cap._mark_superseded(db, cap.referenced_identifiers(alert.references) or [alert.identifier], alert.identifier)
            await db.execute("UPDATE cap_alerts SET active = 0 WHERE identifier = ?", (alert.identifier,))
        await db.commit()
    return alert


def test_parse_valid_message_and_colour_from_severity():
    alert = cap.parse_cap_xml(_load("alert_hyd_orange.xml"))
    assert alert.identifier == "IN-TEST-HYD-ORANGE-1"
    assert alert.severity == "Severe"
    assert alert.colour == "orange"
    assert alert.match == "matched"
    assert alert.matched_district_codes == ["507"]


def test_update_supersedes_and_cancel_removes(cap_db):
    asyncio.run(_store(_load("alert_hyd_orange.xml")))
    asyncio.run(_store(_load("update_hyd_orange.xml")))
    async def check_update():
        async with aiosqlite.connect(cap.DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT identifier, active, superseded_by FROM cap_alerts ORDER BY identifier") as cur:
                return [dict(row) for row in await cur.fetchall()]
    rows = asyncio.run(check_update())
    by_id = {row["identifier"]: row for row in rows}
    assert by_id["IN-TEST-HYD-ORANGE-1"]["active"] == 0
    assert by_id["IN-TEST-HYD-ORANGE-1"]["superseded_by"] == "IN-TEST-HYD-ORANGE-2"
    assert by_id["IN-TEST-HYD-ORANGE-2"]["active"] == 1

    asyncio.run(_store(_load("cancel_hyd_orange.xml")))
    payload = asyncio.run(cap.list_active_alerts())
    assert all(item["identifier"] != "IN-TEST-HYD-ORANGE-2" for item in payload["alerts"])


def test_non_actual_status_ignored_by_parser_contract():
    xml = _load("alert_hyd_orange.xml").replace("<cap:status>Actual</cap:status>", "<cap:status>Exercise</cap:status>")
    alert = cap.parse_cap_xml(xml)
    assert alert.status == "Exercise"


def test_expired_and_text_only(cap_db):
    asyncio.run(_store(_load("expired.xml")))
    asyncio.run(_store(_load("text_only.xml")))
    payload = asyncio.run(cap.list_active_alerts())
    assert payload["alerts"] == []
    assert len(payload["unmatched"]) == 1
    assert payload["unmatched"][0]["match"] == "unmatched_text_only"


def test_xxe_rejected():
    with pytest.raises((EntitiesForbidden, ET.ParseError, ValueError, OSError)):
        cap.parse_cap_xml(_load("xxe.xml"))


def test_host_allowlist_and_oversized_body(monkeypatch):
    monkeypatch.setattr(settings, "CAP_ALLOWED_HOSTS", "sachet.ndma.gov.in")
    assert not cap.host_allowed("https://evil.example/cap.xml")
    assert cap.host_allowed("https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=1")


def test_status_mapping_and_none_active(cap_db, monkeypatch):
    cap.reset_poll_state_for_tests()
    failed = cap.source_status_payload()
    assert failed["status"] == "failed"
    payload = asyncio.run(cap.list_active_alerts())
    assert payload["none_active"] is False

    now = datetime.now(timezone.utc).isoformat()
    cap._state.update(last_success_at=now, last_polled_at=now, poll_ok=True, items_failed=0, items_parsed=1, last_error=None)
    live = asyncio.run(cap.list_active_alerts())
    assert live["source"]["status"] == "live"
    assert live["none_active"] is True
    assert "recent" in live
    assert isinstance(live["recent"], list)

    cap._state.update(items_failed=2)
    partial = cap.source_status_payload()
    assert partial["status"] == "partial"

    stale_time = (datetime.now(timezone.utc) - timedelta(seconds=settings.CAP_POLL_SECONDS * 4)).isoformat()
    cap._state.update(last_success_at=stale_time, items_failed=0, poll_ok=True)
    stale = asyncio.run(cap.list_active_alerts())
    assert stale["source"]["status"] == "stale"
    assert stale["none_active"] is False


class _Loc:
    def __init__(self, rain, level=1, loc_id="z1", name="Zone"):
        self.id = loc_id
        self.name = name
        self.risk_level = level
        self.lat = 17.39
        self.lon = 78.47
        self.explanation = type("E", (), {"rainfall_24h_mm": rain, "rainfall_48h_mm": rain})()


def test_floor_logic():
    assert combine_band("quiet", [{"floor": "watch", "colour": "orange"}]) == "watch"
    assert combine_band("quiet", [{"floor": "heavy", "colour": "red"}]) == "heavy"
    assert combine_band("heavy", []) == "heavy"
    assert rain_band([_Loc(80.0)]) == "heavy"
    assert combine_band(rain_band([_Loc(10.0)]), [{"floor": "watch"}]) == "watch"
    assert combine_band(rain_band([_Loc(0.0)]), [{"floor": "heavy"}]) == "heavy"
    assert combine_band(rain_band([_Loc(80.0)]), []) == "heavy"


def test_plan_cache_invalidates_on_new_alert(cap_db, monkeypatch):
    async def fake_route(*args, **kwargs):
        return None

    async def fake_units():
        return []

    monkeypatch.setattr("backend.services.operations_plan.find_evacuation_route", fake_route)
    monkeypatch.setattr("backend.services.operations_plan.fetch_units", fake_units)

    async def run():
        from backend.services import operations_plan as plan
        plan._cache.update(signature=None, at=0.0, payload=None)
        first = await refresh_operations_plan([_Loc(10.0)], [], force=True)
        assert first["band"] == "quiet"
        await _store(_load("alert_hyd_orange.xml"))
        second = await refresh_operations_plan([_Loc(10.0)], [], force=False)
        assert second["band"] == "watch"
        assert second["events"]
        assert any(event.get("alert_badge") == "IMD alert" for event in second["events"])

    asyncio.run(run())


def test_approved_event_needs_review_when_trigger_changes(cap_db, monkeypatch):
    async def fake_route(*args, **kwargs):
        return None

    async def fake_units():
        return []

    monkeypatch.setattr("backend.services.operations_plan.find_evacuation_route", fake_route)
    monkeypatch.setattr("backend.services.operations_plan.fetch_units", fake_units)

    async def run():
        from backend.services import operations_plan as plan
        plan._cache.update(signature=None, at=0.0, payload=None)
        first = await refresh_operations_plan([_Loc(30.0, level=3)], [], force=True)
        event_id = first["events"][0]["id"]
        async with aiosqlite.connect(cap.DB_PATH) as db:
            async with db.execute("SELECT event_json FROM operations_calendar WHERE id = ?", (event_id,)) as cur:
                row = await cur.fetchone()
            event = __import__("json").loads(row[0])
            event["status"] = "approved"
            await db.execute(
                "UPDATE operations_calendar SET event_json = ? WHERE id = ?",
                (__import__("json").dumps(event), event_id),
            )
            await db.commit()
        await _store(_load("alert_hyd_red.xml"))
        plan._cache.update(signature=None, at=0.0, payload=None)
        second = await refresh_operations_plan([_Loc(30.0, level=3)], [], force=True)
        reviewed = next(event for event in second["events"] if event["id"] == event_id)
        assert reviewed["status"] == "needs_review"
        assert reviewed.get("review_reason")

    asyncio.run(run())
