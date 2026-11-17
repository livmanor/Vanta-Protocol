"""Count how often the rainfall window rules would have opened.

This measures trigger frequency from the Open-Meteo archive. It is not a
prediction-accuracy test: no labelled flood dataset is connected, so this
script does not print precision, recall, or accuracy.
"""
import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

import httpx

from backend.config import settings

ROOT = Path(__file__).resolve().parents[1]
HOTSPOTS = ROOT / "data" / "hyderabad_hotspots.json"
REPORT = ROOT / "docs" / "backtest_report.md"
WATCH_MM = 25.0
HEAVY_MM = 64.5
SEASONS = (2023, 2024, 2025, 2026)


def season_bounds(year: int) -> tuple[str, str]:
    return f"{year}-06-01", f"{year}-09-30"


def fetch_daily(lat: float, lon: float, start: str, end: str) -> dict:
    response = httpx.get(
        settings.OPEN_METEO_ARCHIVE_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "start_date": start,
            "end_date": end,
            "daily": "precipitation_sum",
            "timezone": "Asia/Kolkata",
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


def season_rows(payload: dict) -> list[tuple[str, float | None]]:
    daily = payload.get("daily") or {}
    dates = daily.get("time") or []
    values = daily.get("precipitation_sum") or []
    rows = []
    for index, day in enumerate(dates):
        value = values[index] if index < len(values) else None
        rows.append((day, None if value is None else float(value)))
    return rows


def local_incidents() -> list[dict]:
    path = ROOT / settings.DATABASE_PATH
    if not path.exists():
        return []
    try:
        with sqlite3.connect(path) as db:
            db.row_factory = sqlite3.Row
            found = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='incidents'").fetchone()
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
    catalog = json.loads(HOTSPOTS.read_text(encoding="utf-8"))
    generated = datetime.now().isoformat(timespec="seconds")
    lines = [
        "# Rainfall-window trigger frequency",
        "",
        f"Generated {generated} by `scripts/backtest_thresholds.py` from `{settings.OPEN_METEO_ARCHIVE_URL}`.",
        "",
        "This report counts how often a daily archive total would have opened a watch window "
        f"(at least {WATCH_MM:g} mm) or a heavy window (at least {HEAVY_MM:g} mm) at the six published hotspots.",
        "It measures trigger frequency. It is not a prediction-accuracy result. No labelled flood dataset is connected, "
        "so precision, recall, and accuracy are not calculated.",
        "A missing archive day is counted as missing. It is not treated as 0 mm.",
        "",
    ]
    incidents = local_incidents()
    incident_days = {}
    for incident in incidents:
        day = incident_day(incident.get("timestamp"))
        if day:
            incident_days.setdefault(day, []).append(incident.get("type") or "unknown")

    all_watch = {}
    all_heavy = {}
    for year in SEASONS:
        start, end = season_bounds(year)
        lines.append(f"## {year} monsoon ({start} to {end})")
        lines.append("")
        season_watch_days = set()
        season_heavy_days = set()
        for hotspot in catalog["hotspots"]:
            lat, lon = hotspot["centroid"]
            try:
                rows = season_rows(fetch_daily(lat, lon, start, end))
            except Exception as exc:
                lines.append(f"- {hotspot['name']}: archive request failed ({exc}). No days were invented.")
                continue
            present = [(day, value) for day, value in rows if value is not None]
            missing = len(rows) - len(present)
            watch = [day for day, value in present if value >= WATCH_MM]
            heavy = [day for day, value in present if value >= HEAVY_MM]
            season_watch_days.update(watch)
            season_heavy_days.update(heavy)
            lines.append(
                f"- {hotspot['name']}: {len(present)} days with a rainfall total, {missing} missing, "
                f"{len(watch)} watch days, {len(heavy)} heavy days."
            )
            if watch:
                lines.append(f"  - Watch dates: {', '.join(watch)}")
            if heavy:
                lines.append(f"  - Heavy dates: {', '.join(heavy)}")
        lines.append(
            f"- Across the six hotspots: {len(season_watch_days)} distinct watch days and "
            f"{len(season_heavy_days)} distinct heavy days."
        )
        lines.append("")
        all_watch[year] = season_watch_days
        all_heavy[year] = season_heavy_days

    lines.append("## Logged incidents")
    lines.append("")
    if not incidents:
        lines.append("The local database has no incident rows. Nothing was compared.")
    else:
        lines.append(
            f"{len(incidents)} incident row(s) are stored. Only the date and type are compared. "
            "Message text and coordinates are not written here."
        )
        matched = 0
        for day, types in sorted(incident_days.items()):
            year = date.fromisoformat(day).year
            watch = day in all_watch.get(year, set())
            heavy = day in all_heavy.get(year, set())
            if watch or heavy:
                matched += 1
            band = "heavy window" if heavy else "watch window" if watch else "no archive window at the six hotspots"
            lines.append(f"- {day}: {len(types)} incident(s) ({', '.join(sorted(set(types)))}) on a {band}.")
        lines.append(f"{matched} incident date(s) fall on a watch or heavy day. This overlap is not an accuracy score.")
    lines.append("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT}")


if __name__ == "__main__":
    main()
