"""Live Hyderabad Traffic Police waterlogging points.

Source: https://echallan.tspolice.gov.in/htp/water_logging.html
Default scope: all GHMC / Hyderabad-city divisions on that page (Khairatabad,
Golconda, Charminar, Secunderabad, …). `HTP_ZONE_FILTER` can narrow to one or
more named divisions. Each point keeps zone + Major/Minor severity. This is a
vulnerability list, not a live flood report. Rain risk is still scored from
Open-Meteo at these coordinates.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

from backend.config import settings

logger = logging.getLogger("vanta.htp_waterlogging")

HTP_HOST = "echallan.tspolice.gov.in"
STATIC_FALLBACK = Path(__file__).resolve().parents[2] / "data" / "hyderabad_hotspots.json"

_state: dict[str, Any] = {
    "status": "failed",
    "last_polled_at": None,
    "last_success_at": None,
    "error_message": "HTP waterlogging feed has not been polled yet.",
    "points": [],
    "point_count": 0,
    "zone_filter": None,
    "using_fallback": False,
}
_poll_task: Optional[asyncio.Task] = None
_lock = asyncio.Lock()


@dataclass
class HtpPoint:
    sno: str
    area: str
    zone: str
    name: str
    severity: str
    lat: float
    lng: float

    @property
    def id(self) -> str:
        return f"htp-{self.sno}"

    def as_catalog_item(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "centroid": (self.lat, self.lng),
            "historical_flood_prone": True,
            "source_severity": self.severity.title(),
            "htp_sno": self.sno,
            "htp_area": self.area,
            "htp_zone": self.zone,
            "htp_severity": self.severity.lower(),
            "list_label": "Hyderabad Traffic Police live waterlogging list",
            "list_as_of": _state.get("last_success_at"),
            "list_source": "Hyderabad Traffic Police waterlogging points",
            "list_source_url": settings.HTP_WATERLOGGING_URL,
        }


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.current_row: list[str] = []
        self.current_cell: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        name = tag.lower()
        if name == "table":
            self.in_table = True
        elif self.in_table and name == "tr":
            self.in_row = True
            self.current_row = []
        elif self.in_row and name in {"td", "th"}:
            self.in_cell = True
            self.current_cell = []

    def handle_endtag(self, tag: str) -> None:
        name = tag.lower()
        if name == "table":
            self.in_table = False
        elif name == "tr" and self.in_row:
            self.in_row = False
            cells = [re.sub(r"\s+", " ", c).strip() for c in self.current_row if re.sub(r"\s+", " ", c).strip()]
            if cells:
                self.rows.append(cells)
        elif name in {"td", "th"} and self.in_cell:
            self.in_cell = False
            self.current_row.append("".join(self.current_cell))

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.current_cell.append(data)


def _host_allowed(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host == HTP_HOST or host.endswith("." + HTP_HOST)


def zone_filter() -> str:
    return (settings.HTP_ZONE_FILTER or "all").strip()


def _wanted_zones(zone: str | None = None) -> set[str] | None:
    """None means all GHMC/city divisions. Otherwise a set of lowercased zone names."""
    raw = (zone if zone is not None else zone_filter()).strip()
    if not raw or raw.lower() in {"all", "*", "ghmc", "hyderabad"}:
        return None
    parts = {part.strip().lower() for part in raw.split(",") if part.strip()}
    return parts or None


def parse_htp_html(html: str, zone: str | None = None) -> list[HtpPoint]:
    """Parse HTP table rows. Rows without numeric lat/lng are skipped (honest empty)."""
    wanted = _wanted_zones(zone)
    parser = _TableParser()
    parser.feed(html)
    points: list[HtpPoint] = []
    seen: set[str] = set()
    for cells in parser.rows:
        joined = " | ".join(cells).lower()
        if "major" not in joined and "minor" not in joined:
            continue
        if "location" in joined and "severity" in joined:
            continue
        severity = next((c for c in cells if c.lower() in {"major", "minor"}), None)
        if not severity:
            continue
        coords = [c for c in cells if re.fullmatch(r"-?\d+\.\d+", c)]
        if len(coords) < 2:
            continue
        lat, lng = float(coords[0]), float(coords[1])
        sno = next((c for c in cells if re.fullmatch(r"\d+", c)), None)
        if not sno:
            continue
        # Typical row: sno, area, zone/division, point name, severity, lat, lng, View
        non_meta = [
            c
            for c in cells
            if c.lower() not in {"major", "minor", "view", "view location"}
            and not re.fullmatch(r"\d+", c)
            and not re.fullmatch(r"-?\d+\.\d+", c)
        ]
        if len(non_meta) < 2:
            continue
        area = non_meta[0]
        division = non_meta[1]
        name = non_meta[2] if len(non_meta) >= 3 else non_meta[1]
        if wanted is not None:
            division_l = division.strip().lower()
            area_l = area.strip().lower()
            if not any(token in division_l or token in area_l for token in wanted):
                continue
        if sno in seen:
            continue
        seen.add(sno)
        points.append(
            HtpPoint(
                sno=sno,
                area=area,
                zone=division,
                name=name,
                severity=severity.lower(),
                lat=lat,
                lng=lng,
            )
        )
    points.sort(
        key=lambda p: (
            p.zone.lower(),
            0 if p.severity == "major" else 1,
            int(p.sno) if p.sno.isdigit() else 0,
        )
    )
    return points


def _load_static_fallback() -> list[dict[str, Any]]:
    import json

    if not STATIC_FALLBACK.exists():
        return []
    catalog = json.loads(STATIC_FALLBACK.read_text(encoding="utf-8"))
    zones = []
    for item in catalog.get("hotspots", []):
        lat, lon = item["centroid"]
        zones.append(
            {
                **item,
                "centroid": (lat, lon),
                "htp_area": item.get("htp_area") or "fallback",
                "htp_zone": item.get("htp_zone") or "GHMC",
                "htp_severity": (item.get("source_severity") or "major").lower(),
                "list_label": catalog.get("label") or "static fallback",
                "list_as_of": catalog.get("as_of"),
                "list_source": catalog.get("source"),
                "list_source_url": catalog.get("source_url"),
            }
        )
    return zones


def get_hotspot_catalog() -> list[dict[str, Any]]:
    """Current HTP catalog (live cache or static fallback). Safe for sync callers."""
    points: list[HtpPoint] = list(_state.get("points") or [])
    if points:
        return [p.as_catalog_item() for p in points]
    return _load_static_fallback()


def source_status_payload() -> dict[str, Any]:
    return {
        "name": "Hyderabad Traffic Police waterlogging points",
        "endpoint": settings.HTP_WATERLOGGING_URL,
        "status": _state["status"],
        "last_updated": _state.get("last_success_at") or _state.get("last_polled_at"),
        "last_polled_at": _state.get("last_polled_at"),
        "error_message": _state.get("error_message"),
        "point_count": _state.get("point_count") or 0,
        "zone_filter": _state.get("zone_filter") or zone_filter(),
        "using_fallback": bool(_state.get("using_fallback")),
    }


def catalog_by_id() -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in get_hotspot_catalog()}


async def poll_htp_waterlogging(force: bool = False) -> dict[str, Any]:
    """Fetch and parse the HTP page. Updates the in-memory catalog used by risk + agents."""
    async with _lock:
        now = datetime.now(timezone.utc).isoformat()
        _state["last_polled_at"] = now
        _state["zone_filter"] = zone_filter()
        url = (settings.HTP_WATERLOGGING_URL or "").strip()
        if not url or not _host_allowed(url):
            _state["status"] = "failed"
            _state["error_message"] = "HTP waterlogging URL host is not allowed."
            if not _state["points"]:
                _state["using_fallback"] = True
            return source_status_payload()

        try:
            async with httpx.AsyncClient(
                timeout=float(settings.HTP_HTTP_TIMEOUT_SECONDS),
                follow_redirects=True,
                headers={"User-Agent": "VantaProtocol/1.0 (police control-room research)"},
            ) as client:
                response = await client.get(url)
            if response.status_code >= 400:
                raise RuntimeError(f"HTTP {response.status_code}")
            body = response.text
            max_bytes = int(settings.HTP_MAX_BODY_BYTES)
            if len(body.encode("utf-8", errors="replace")) > max_bytes:
                raise RuntimeError("HTP response exceeded size limit")
            parsed = parse_htp_html(body, zone_filter())
            if not parsed:
                raise RuntimeError(f"No geocoded points found for zone filter {zone_filter()!r}")
            _state["points"] = parsed
            _state["point_count"] = len(parsed)
            _state["status"] = "live"
            _state["last_success_at"] = now
            _state["error_message"] = None
            _state["using_fallback"] = False
            zones = sorted({p.zone for p in parsed})
            logger.info(
                "HTP waterlogging refreshed: %s points across %s GHMC zones (%s)",
                len(parsed),
                len(zones),
                zone_filter(),
            )
        except Exception as exc:
            logger.warning("HTP waterlogging poll failed: %s", type(exc).__name__)
            if _state["points"]:
                _state["status"] = "stale"
                _state["error_message"] = f"{type(exc).__name__}: {str(exc)[:120]}"
                _state["using_fallback"] = False
            else:
                fallback = _load_static_fallback()
                _state["status"] = "failed"
                _state["error_message"] = f"{type(exc).__name__}: {str(exc)[:120]}"
                _state["using_fallback"] = bool(fallback)
                _state["point_count"] = len(fallback)
        return source_status_payload()


async def ensure_catalog(force: bool = False) -> list[dict[str, Any]]:
    """Refresh when empty or forced so agents see website updates."""
    if force or not _state.get("points") or _state.get("status") in {"failed", None}:
        await poll_htp_waterlogging(force=force)
    elif _state.get("status") == "stale":
        await poll_htp_waterlogging(force=True)
    return get_hotspot_catalog()


async def _poll_loop() -> None:
    while True:
        try:
            await poll_htp_waterlogging()
        except Exception as exc:
            logger.error("HTP poll loop crashed: %s", type(exc).__name__)
        await asyncio.sleep(max(60, int(settings.HTP_POLL_SECONDS)))


def start_htp_poller() -> None:
    global _poll_task
    if _poll_task and not _poll_task.done():
        return
    _poll_task = asyncio.create_task(_poll_loop(), name="htp-waterlogging-poller")


def stop_htp_poller() -> None:
    global _poll_task
    if _poll_task and not _poll_task.done():
        _poll_task.cancel()
    _poll_task = None


def reset_state_for_tests() -> None:
    _state.update(
        {
            "status": "failed",
            "last_polled_at": None,
            "last_success_at": None,
            "error_message": "reset",
            "points": [],
            "point_count": 0,
            "zone_filter": None,
            "using_fallback": False,
        }
    )
