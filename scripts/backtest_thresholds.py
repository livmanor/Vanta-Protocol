"""Count rainfall-window triggers on unique Open-Meteo cells covering all HTP points.

Loads every geocoded Hyderabad Traffic Police waterlogging point, rounds each
coordinate to the Open-Meteo ~0.1° archive grid, and fetches archive daily +
hourly precipitation once per unique cell. Missing days stay missing (never 0).

This measures trigger frequency. It is not a labelled accuracy test.
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import settings
from backend.data_sources.htp_waterlogging import parse_htp_html

REPORT = ROOT / "docs" / "backtest_report.md"
WATCH_MM = 25.0
HEAVY_MM = 64.5
HOURLY_PEAK_MM = 30.0
START = "2023-06-01"
END = "2026-09-30"
GRID_DEG = 0.1
BATCH_SIZE = 8
MAX_RETRIES = 4
RETRY_BASE_SECONDS = 2.0


def round_grid(lat: float, lon: float) -> tuple[float, float]:
    """Snap to Open-Meteo archive-style ~0.1° cells."""
    return (round(lat / GRID_DEG) * GRID_DEG, round(lon / GRID_DEG) * GRID_DEG)


def cell_key(lat: float, lon: float) -> str:
    glat, glon = round_grid(lat, lon)
    return f"{glat:.1f}N,{glon:.1f}E"


def load_htp_points() -> list[dict[str, Any]]:
    """All geocoded HTP points from the live page, else the latest SQLite snapshot."""
    url = (settings.HTP_WATERLOGGING_URL or "").strip()
    try:
        response = httpx.get(
            url,
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "VantaProtocol/1.0 (backtest)"},
        )
        response.raise_for_status()
        points = parse_htp_html(response.text, zone="all")
        if points:
            return [
                {
                    "id": p.id,
                    "name": p.name,
                    "lat": p.lat,
                    "lon": p.lng,
                    "zone": p.zone,
                    "severity": p.severity,
                    "source": "live_htp",
                }
                for p in points
            ]
    except Exception as exc:
        print(f"Live HTP fetch failed ({type(exc).__name__}); trying SQLite snapshot.")

    db_path = ROOT / settings.DATABASE_PATH
    if db_path.exists():
        try:
            with sqlite3.connect(db_path) as db:
                row = db.execute(
                    "SELECT points_json FROM htp_snapshot ORDER BY fetched_at DESC LIMIT 1"
                ).fetchone()
            if row and row[0]:
                payload = json.loads(row[0])
                out = []
                for item in payload:
                    centroid = item.get("centroid") or [None, None]
                    lat = float(centroid[0] if isinstance(centroid, (list, tuple)) else item.get("lat"))
                    lon = float(centroid[1] if isinstance(centroid, (list, tuple)) else item.get("lon") or item.get("lng"))
                    out.append(
                        {
                            "id": item.get("id"),
                            "name": item.get("name"),
                            "lat": lat,
                            "lon": lon,
                            "zone": item.get("htp_zone") or item.get("zone"),
                            "severity": item.get("htp_severity") or item.get("severity"),
                            "source": "htp_snapshot",
                        }
                    )
                if out:
                    return out
        except Exception as exc:
            print(f"Snapshot load failed ({type(exc).__name__}).")

    raise SystemExit(
        "No geocoded HTP points available. Refresh the HTP feed (or save a snapshot) and retry."
    )


def _request_with_retry(client: httpx.Client, params: dict) -> dict | list:
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.get(settings.OPEN_METEO_ARCHIVE_URL, params=params)
            if response.status_code == 429:
                raise httpx.HTTPStatusError("rate limited", request=response.request, response=response)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            last_exc = exc
            sleep_for = RETRY_BASE_SECONDS * (2**attempt)
            print(f"  archive retry {attempt + 1}/{MAX_RETRIES} after {type(exc).__name__}; sleep {sleep_for:.1f}s")
            time.sleep(sleep_for)
    raise RuntimeError(f"Open-Meteo archive failed after retries: {last_exc}")


def fetch_cell_archive(client: httpx.Client, lat: float, lon: float) -> dict[str, Any]:
    params = {
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "start_date": START,
        "end_date": END,
        "daily": "precipitation_sum",
        "hourly": "precipitation",
        "timezone": "Asia/Kolkata",
    }
    payload = _request_with_retry(client, params)
    if isinstance(payload, list):
        payload = payload[0] if payload else {}
    return payload if isinstance(payload, dict) else {}


def summarize_cell(payload: dict[str, Any]) -> dict[str, Any]:
    daily = payload.get("daily") or {}
    dates = list(daily.get("time") or [])
    values = list(daily.get("precipitation_sum") or [])
    present_days: list[tuple[str, float]] = []
    missing_days = 0
    for index, day in enumerate(dates):
        value = values[index] if index < len(values) else None
        if value is None:
            missing_days += 1
            continue
        present_days.append((day, float(value)))

    watch = [day for day, value in present_days if value >= WATCH_MM]
    heavy = [day for day, value in present_days if value >= HEAVY_MM]
    daily_by_day = {day: value for day, value in present_days}

    hourly = payload.get("hourly") or {}
    h_times = list(hourly.get("time") or [])
    h_values = list(hourly.get("precipitation") or [])
    peak_by_day: dict[str, float | None] = {}
    for stamp, raw in zip(h_times, h_values):
        if not isinstance(stamp, str) or len(stamp) < 10:
            continue
        day = stamp[:10]
        if raw is None:
            # Do not invent 0 for a missing hour; leave peak unknown until a real sample appears.
            peak_by_day.setdefault(day, None)
            continue
        value = float(raw)
        previous = peak_by_day.get(day)
        if previous is None or value > previous:
            peak_by_day[day] = value

    hourly_peak_misses = []
    for day, peak in sorted(peak_by_day.items()):
        if peak is None:
            continue
        daily_total = daily_by_day.get(day)
        if peak >= HOURLY_PEAK_MM and (daily_total is None or daily_total < WATCH_MM):
            hourly_peak_misses.append((day, peak, daily_total))

    return {
        "days_with_total": len(present_days),
        "missing_days": missing_days,
        "watch_days": watch,
        "heavy_days": heavy,
        "hourly_peak_misses": hourly_peak_misses,
        "peak_by_day": peak_by_day,
    }


def local_incidents() -> list[dict]:
    path = ROOT / settings.DATABASE_PATH
    if not path.exists():
        return []
    try:
        with sqlite3.connect(path) as db:
            db.row_factory = sqlite3.Row
            found = db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='incidents'"
            ).fetchone()
            if not found:
                return []
            return [dict(row) for row in db.execute("SELECT id, type, status, timestamp FROM incidents")]
    except sqlite3.Error:
        return []


def incident_day(timestamp: str) -> str | None:
    try:
        return datetime.fromisoformat(timestamp).date().isoformat()
    except (TypeError, ValueError):
        return None


def main() -> None:
    points = load_htp_points()
    cells: dict[str, dict[str, Any]] = {}
    for point in points:
        key = cell_key(point["lat"], point["lon"])
        glat, glon = round_grid(point["lat"], point["lon"])
        bucket = cells.setdefault(
            key,
            {"lat": glat, "lon": glon, "points": [], "summary": None, "error": None},
        )
        bucket["points"].append(point)

    generated = datetime.now().isoformat(timespec="seconds")
    n_points = len(points)
    m_cells = len(cells)
    lines = [
        "# Rainfall-window trigger frequency (HTP → unique weather cells)",
        "",
        f"**{n_points} points -> {m_cells} unique weather cells**",
        "",
        f"Generated {generated} by `scripts/backtest_thresholds.py` from `{settings.OPEN_METEO_ARCHIVE_URL}`.",
        f"Window: {START} to {END}. Watch ≥ {WATCH_MM:g} mm/day. Heavy ≥ {HEAVY_MM:g} mm/day. "
        f"Hourly-peak miss: max hour ≥ {HOURLY_PEAK_MM:g} mm while daily total is missing or < {WATCH_MM:g} mm.",
        "Coordinates are snapped to a ~0.1° Open-Meteo archive grid before fetch so co-located HTP points share one archive series.",
        "A missing archive day or hour is counted as missing. It is never treated as 0 mm.",
        "This report measures trigger frequency only. It is not a labelled precision/recall result.",
        "",
        "## Unique weather cells",
        "",
    ]

    with httpx.Client(timeout=90.0, follow_redirects=True) as client:
        for index, (key, bucket) in enumerate(sorted(cells.items()), start=1):
            print(f"[{index}/{m_cells}] cell {key} ({len(bucket['points'])} HTP points)")
            try:
                payload = fetch_cell_archive(client, bucket["lat"], bucket["lon"])
                bucket["summary"] = summarize_cell(payload)
            except Exception as exc:
                bucket["error"] = f"{type(exc).__name__}: {exc}"
                print(f"  FAILED: {bucket['error']}")
            # Be polite to the public archive.
            time.sleep(0.4)

    all_watch: set[str] = set()
    all_heavy: set[str] = set()
    all_hourly_misses: set[str] = set()

    for key, bucket in sorted(cells.items()):
        point_names = ", ".join(p["name"] for p in bucket["points"][:8])
        if len(bucket["points"]) > 8:
            point_names += f", … (+{len(bucket['points']) - 8} more)"
        lines.append(f"### Cell {key}")
        lines.append("")
        lines.append(f"- Grid center used for fetch: {bucket['lat']:.1f}, {bucket['lon']:.1f}")
        lines.append(f"- HTP points in this cell ({len(bucket['points'])}): {point_names}")
        if bucket["error"]:
            lines.append(f"- Archive request failed: {bucket['error']}. No days were invented.")
            lines.append("")
            continue
        summary = bucket["summary"] or {}
        watch = summary.get("watch_days") or []
        heavy = summary.get("heavy_days") or []
        misses = summary.get("hourly_peak_misses") or []
        all_watch.update(watch)
        all_heavy.update(heavy)
        all_hourly_misses.update(day for day, _, _ in misses)
        lines.append(
            f"- Days with a rainfall total: {summary.get('days_with_total', 0)}; "
            f"missing days: {summary.get('missing_days', 0)}."
        )
        lines.append(f"- Watch days (≥ {WATCH_MM:g} mm): {len(watch)}")
        if watch:
            lines.append(f"  - {', '.join(watch)}")
        lines.append(f"- Heavy days (≥ {HEAVY_MM:g} mm): {len(heavy)}")
        if heavy:
            lines.append(f"  - {', '.join(heavy)}")
        lines.append(
            f"- Hourly-peak misses (peak hour ≥ {HOURLY_PEAK_MM:g} mm, daily < {WATCH_MM:g} mm or missing): {len(misses)}"
        )
        if misses:
            formatted = [
                f"{day} (peak {peak:.1f} mm"
                + (f", daily {daily:.1f} mm)" if daily is not None else ", daily missing)")
                for day, peak, daily in misses
            ]
            lines.append(f"  - {'; '.join(formatted)}")
        lines.append("")

    lines.append("## Across all unique cells")
    lines.append("")
    lines.append(f"- Distinct watch days: {len(all_watch)}")
    lines.append(f"- Distinct heavy days: {len(all_heavy)}")
    lines.append(f"- Distinct hourly-peak miss days: {len(all_hourly_misses)}")
    if all_heavy:
        lines.append(f"- Heavy dates: {', '.join(sorted(all_heavy))}")
    lines.append("")

    incidents = local_incidents()
    lines.append("## Logged incidents")
    lines.append("")
    if not incidents:
        lines.append("The local database has no incident rows. Nothing was compared.")
    else:
        lines.append(
            f"{len(incidents)} incident row(s) are stored. Only the date and type are compared."
        )
        incident_days: dict[str, list[str]] = {}
        for incident in incidents:
            day = incident_day(incident.get("timestamp"))
            if day:
                incident_days.setdefault(day, []).append(incident.get("type") or "unknown")
        matched = 0
        for day, types in sorted(incident_days.items()):
            watch = day in all_watch
            heavy = day in all_heavy
            if watch or heavy:
                matched += 1
            band = "heavy window" if heavy else "watch window" if watch else "no archive window on unique cells"
            lines.append(f"- {day}: {len(types)} incident(s) ({', '.join(sorted(set(types)))}) on a {band}.")
        lines.append(
            f"{matched} incident date(s) fall on a watch or heavy day. This overlap is not an accuracy score."
        )
    lines.append("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT}")
    print(f"{n_points} points -> {m_cells} unique weather cells")


if __name__ == "__main__":
    main()
