"""HTP waterlogging page parse, GHMC zone coverage, and snapshot fallback."""

import asyncio
from pathlib import Path

import pytest

from backend.config import settings
from backend.data_sources import htp_waterlogging as htp
from backend import db as db_module

FIXTURE = Path(__file__).parent / "fixtures" / "htp" / "water_logging_sample.html"


@pytest.fixture(autouse=True)
def _reset_htp(monkeypatch, tmp_path):
    htp.reset_state_for_tests()
    monkeypatch.setattr(settings, "HTP_ZONE_FILTER", "all")
    monkeypatch.setattr(
        settings,
        "HTP_WATERLOGGING_URL",
        "https://echallan.tspolice.gov.in/htp/water_logging.html",
    )
    db_path = tmp_path / "htp_test.db"
    monkeypatch.setattr(settings, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr(db_module, "DB_PATH", str(db_path))
    asyncio.run(db_module.init_db())


def test_parse_all_ghmc_zones_include_golconda_and_khairatabad():
    html = FIXTURE.read_text(encoding="utf-8")
    points = htp.parse_htp_html(html, zone="all")
    assert len(points) >= 40
    zones = {p.zone for p in points}
    assert any("khairatabad" in z.lower() for z in zones)
    assert any("golconda" in z.lower() for z in zones)
    assert all(p.severity in {"major", "minor"} for p in points)
    assert all(p.lat and p.lng for p in points)


def test_parse_can_still_narrow_to_one_zone():
    html = FIXTURE.read_text(encoding="utf-8")
    points = htp.parse_htp_html(html, zone="Golconda")
    assert points
    assert all("golconda" in p.zone.lower() or "golconda" in p.area.lower() for p in points)


def test_catalog_items_expose_zone_and_severity_for_agents():
    html = FIXTURE.read_text(encoding="utf-8")
    points = htp.parse_htp_html(html, zone="all")
    htp._state["points"] = points
    htp._state["status"] = "live"
    htp._state["point_count"] = len(points)
    htp._state["using_fallback"] = False
    catalog = htp.get_hotspot_catalog()
    sample = catalog[0]
    assert sample["htp_zone"]
    assert sample["htp_severity"] in {"major", "minor"}
    assert sample["historical_flood_prone"] is True


def test_poll_success_saves_snapshot(monkeypatch):
    html = FIXTURE.read_text(encoding="utf-8")

    class FakeResponse:
        status_code = 200
        text = html

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            assert "echallan.tspolice.gov.in" in url
            return FakeResponse()

    monkeypatch.setattr(htp.httpx, "AsyncClient", FakeClient)
    payload = asyncio.run(htp.poll_htp_waterlogging(force=True))
    assert payload["status"] == "live"
    assert payload["point_count"] >= 40
    assert payload["zone_filter"] == "all"
    assert not payload["using_fallback"]

    snapshot = asyncio.run(db_module.load_htp_snapshot())
    assert snapshot is not None
    assert snapshot["point_count"] >= 40
    assert len(snapshot["points"]) >= 40
    assert snapshot["fetched_at"]


def test_poll_failure_serves_stale_snapshot(monkeypatch):
    html = FIXTURE.read_text(encoding="utf-8")

    class LiveResponse:
        status_code = 200
        text = html

    class FailClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            raise RuntimeError("network down")

    class LiveClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            return LiveResponse()

    monkeypatch.setattr(htp.httpx, "AsyncClient", LiveClient)
    live = asyncio.run(htp.poll_htp_waterlogging(force=True))
    assert live["status"] == "live"
    snapshot_at = live["snapshot_fetched_at"]
    live_count = live["point_count"]

    htp.reset_state_for_tests()
    monkeypatch.setattr(htp.httpx, "AsyncClient", FailClient)
    stale = asyncio.run(htp.poll_htp_waterlogging(force=True))
    assert stale["status"] == "stale"
    assert stale["point_count"] == live_count
    assert stale["snapshot_fetched_at"] == snapshot_at
    assert "RuntimeError" in (stale.get("error_message") or "")
    catalog = htp.get_hotspot_catalog()
    assert len(catalog) == live_count


def test_poll_failure_with_no_snapshot_returns_failed_empty(monkeypatch):
    class FailClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            raise RuntimeError("network down")

    monkeypatch.setattr(htp.httpx, "AsyncClient", FailClient)
    payload = asyncio.run(htp.poll_htp_waterlogging(force=True))
    assert payload["status"] == "failed"
    assert payload["point_count"] == 0
    assert htp.get_hotspot_catalog() == []
    assert not payload["using_fallback"]
