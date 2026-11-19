"""Replay returns archive-backed plan data and never writes the database."""

import asyncio
from datetime import date

import aiosqlite
import pytest
from fastapi.testclient import TestClient

from backend import db as db_module
from backend.config import settings
from backend.data_sources import htp_waterlogging as htp
from backend.main import app
from backend.services import replay as replay_service


@pytest.fixture
def replay_env(monkeypatch, tmp_path):
    db_path = tmp_path / "replay.db"
    monkeypatch.setattr(settings, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr(db_module, "DB_PATH", str(db_path))
    monkeypatch.setattr(settings, "AUTH_REQUIRED", False)
    htp.reset_state_for_tests()
    asyncio.run(db_module.init_db())

    # Minimal real-coordinate HTP points so archive scoring has somewhere to land.
    points = [
        htp.HtpPoint("1", "Abids", "Khairatabad", "Nampally Metro Underpass", "major", 17.39144, 78.470213),
        htp.HtpPoint("2", "Banjara Hills", "Khairatabad", "Banjara Hills Road No. 12", "major", 17.41148, 78.435294),
    ]
    htp._state.update(
        {
            "points": points,
            "point_count": len(points),
            "status": "live",
            "last_success_at": "2024-09-01T00:00:00+00:00",
            "error_message": None,
            "using_fallback": False,
        }
    )

    async def fake_archive(cells, day):
        assert day == date(2024, 9, 1)
        return {
            cell["id"]: {
                "forecast_24h": 80.0,
                "rain_48h": 95.0,
                "status": "live",
                "temperature_max_c": 28.0,
                "apparent_temperature_max_c": 30.0,
            }
            for cell in cells
        }

    async def no_catalog_poll(*args, **kwargs):
        return [p.as_catalog_item() for p in points]

    async def fake_elevations(cells):
        return {cell["id"]: None for cell in cells}

    monkeypatch.setattr(replay_service, "_fetch_archive_weather", fake_archive)
    monkeypatch.setattr("backend.services.grid._fetch_archive_weather", fake_archive)
    monkeypatch.setattr("backend.services.grid._elevations_for", fake_elevations)
    monkeypatch.setattr(replay_service, "ensure_catalog", no_catalog_poll)
    # Avoid live OSRM during the unit test.
    async def fake_route(*args, **kwargs):
        return None

    monkeypatch.setattr("backend.services.operations_plan.find_evacuation_route", fake_route)
    return db_path


def _table_counts(db_path) -> dict:
    async def _run():
        async with aiosqlite.connect(db_path) as db:
            counts = {}
            for table in ("incidents", "units", "operations_calendar", "sos_send_logs", "contacts"):
                async with db.execute(f"SELECT COUNT(*) FROM {table}") as cursor:
                    row = await cursor.fetchone()
                    counts[table] = row[0]
            return counts

    return asyncio.run(_run())


def test_replay_returns_heavy_band_and_writes_nothing(replay_env):
    before = _table_counts(replay_env)
    client = TestClient(app)
    response = client.get("/api/replay", params={"date": "2024-09-01"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "replay"
    assert payload["date"] == "2024-09-01"
    assert payload["banner"] == "REPLAY — historical data, not live"
    assert payload["writes"] is False
    assert payload["operations_plan"]["band"] == "heavy"
    assert payload["operations_plan"]["persisted"] is False
    assert any(event["category"] == "evacuation" for event in payload["operations_plan"]["events"])
    assert payload["grid"]["cell_count"] == 120
    assert len(payload["zones"]) == 2
    after = _table_counts(replay_env)
    assert after == before
