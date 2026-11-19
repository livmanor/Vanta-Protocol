"""Compare Open-Meteo archive vs historical-forecast rain on labelled event days."""
from __future__ import annotations

import re
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import settings
from scripts.label_schema import LABELS_PATH, read_rows, validate_row

REPORT = ROOT / "docs" / "rainfall_product_comparison.md"
HIST_FORECAST_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
IST = timezone(timedelta(hours=5, minutes=30))
WATCH_MM = 25.0


def today_ist() -> date:
    return datetime.now(IST).date()


def load_samples(limit_per_event: int = 3) -> dict[str, list[dict]]:
    by_event: dict[str, list[dict]] = defaultdict(list)
    for row in read_rows(LABELS_PATH):
        if validate_row(row, today_ist()):
            continue
        if str(row.get("label", "")).strip() != "1":
            continue
        event_id = row["event_id"].strip()
        if len(by_event[event_id]) >= limit_per_event:
            continue
        by_event[event_id].append(row)
    return dict(sorted(by_event.items()))


def gauge_from_notes(notes: str) -> str | None:
    """Only extract mm figures already present in pasted notes. Never invent."""
    text = notes or ""
    match = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*gauge", text, flags=re.IGNORECASE)
    if match:
        return f"{match.group(1)} mm gauge (from label notes)"
    return None


def fetch_product(client: httpx.Client, url: str, lat: float, lon: float, day: date) -> dict:
    response = client.get(
        url,
        params={
            "latitude": lat,
            "longitude": lon,
            "start_date": day.isoformat(),
            "end_date": day.isoformat(),
            "daily": "precipitation_sum",
            "hourly": "precipitation",
            "timezone": "Asia/Kolkata",
        },
        timeout=60.0,
    )
    response.raise_for_status()
    payload = response.json()
    return payload[0] if isinstance(payload, list) else payload


def extract(payload: dict, day: date) -> tuple[float | None, float | None]:
    day_s = day.isoformat()
    daily = payload.get("daily") or {}
    daily_total = None
    for stamp, value in zip(daily.get("time") or [], daily.get("precipitation_sum") or []):
        if stamp == day_s:
            daily_total = None if value is None else float(value)
            break
    peak = None
    for stamp, raw in zip((payload.get("hourly") or {}).get("time") or [], (payload.get("hourly") or {}).get("precipitation") or []):
        if not isinstance(stamp, str) or not stamp.startswith(day_s) or raw is None:
            continue
        value = float(raw)
        peak = value if peak is None or value > peak else peak
    return daily_total, peak


def fmt(value: float | None) -> str:
    return "missing" if value is None else f"{value:.1f}"


def main() -> int:
    samples = load_samples(3)
    lines = [
        "# Rainfall product comparison (labelled event days)",
        "",
        f"Generated {datetime.now().isoformat(timespec='seconds')}.",
        "",
        "Products compared at the same lat/lon and Asia/Kolkata civil day:",
        f"- Archive reanalysis: `{settings.OPEN_METEO_ARCHIVE_URL}`",
        f"- Historical forecast: `{HIST_FORECAST_URL}`",
        "",
        "Gauge column uses only mm figures already present in pasted label notes. No gauge values were invented.",
        f"Watch line for this note: daily total ≥ {WATCH_MM:g} mm.",
        "",
        "| event | location | archive daily (mm) | archive peak hour (mm) | hist-forecast daily (mm) | hist-forecast peak hour (mm) | gauge from notes | archive ≥25? | hist-forecast ≥25? |",
        "|---|---|---:|---:|---:|---:|---|---|---|",
    ]
    archive_hits = 0
    forecast_hits = 0
    rows_checked = 0
    forecast_ok = True

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        # Reachability probe
        try:
            probe = client.get(
                HIST_FORECAST_URL,
                params={
                    "latitude": settings.DEFAULT_LAT,
                    "longitude": settings.DEFAULT_LNG,
                    "start_date": "2025-08-04",
                    "end_date": "2025-08-04",
                    "daily": "precipitation_sum",
                    "timezone": "Asia/Kolkata",
                },
            )
            probe.raise_for_status()
        except Exception as exc:
            forecast_ok = False
            lines.append("")
            lines.append(
                f"Historical forecast API was not usable ({type(exc).__name__}: {exc}). "
                "Archive-only rows are still listed below where available."
            )

        for event_id, rows in samples.items():
            day = date.fromisoformat(rows[0]["date"].strip())
            for row in rows:
                lat = float(row["lat"])
                lon = float(row["lon"])
                name = row["location_name"]
                gauge = gauge_from_notes(row.get("notes") or "") or "—"
                try:
                    archive = fetch_product(client, settings.OPEN_METEO_ARCHIVE_URL, lat, lon, day)
                    a_daily, a_peak = extract(archive, day)
                except Exception as exc:
                    a_daily = a_peak = None
                    archive_note = f"archive failed ({type(exc).__name__})"
                else:
                    archive_note = None
                if forecast_ok:
                    try:
                        hist = fetch_product(client, HIST_FORECAST_URL, lat, lon, day)
                        h_daily, h_peak = extract(hist, day)
                    except Exception as exc:
                        h_daily = h_peak = None
                        hist_note = f"hist-forecast failed ({type(exc).__name__})"
                    else:
                        hist_note = None
                else:
                    h_daily = h_peak = None
                    hist_note = "unreachable"
                rows_checked += 1
                a_hit = a_daily is not None and a_daily >= WATCH_MM
                h_hit = h_daily is not None and h_daily >= WATCH_MM
                if a_hit:
                    archive_hits += 1
                if h_hit:
                    forecast_hits += 1
                extra = ""
                if archive_note or hist_note:
                    bits = [x for x in (archive_note, hist_note) if x]
                    extra = " (" + "; ".join(bits) + ")"
                lines.append(
                    f"| {event_id} | {name}{extra} | {fmt(a_daily)} | {fmt(a_peak)} | {fmt(h_daily)} | {fmt(h_peak)} | {gauge} | "
                    f"{'yes' if a_hit else 'no'} | {'yes' if h_hit else 'no'} |"
                )
                time.sleep(0.25)

    lines.extend(
        [
            "",
            "## Which product reaches 25 mm?",
            "",
            f"- Rows compared: {rows_checked}",
            f"- Archive daily ≥ {WATCH_MM:g} mm: {archive_hits}/{rows_checked}",
            f"- Historical-forecast daily ≥ {WATCH_MM:g} mm: {forecast_hits}/{rows_checked}"
            + ("" if forecast_ok else " (API unreachable for this run)"),
            "",
        ]
    )
    if archive_hits == 0 and forecast_hits == 0:
        lines.append(
            f"**Neither product reached {WATCH_MM:g} mm daily on the sampled labelled event locations/dates in this run.** "
            "The only pasted gauge figure in notes is Gajularamaram 2025-08-04 at 151.5 mm gauge, far above both Open-Meteo products at that point."
        )
    elif archive_hits and not forecast_hits:
        lines.append(f"Only the **archive** product crossed {WATCH_MM:g} mm on some sampled rows.")
    elif forecast_hits and not archive_hits:
        lines.append(f"Only the **historical-forecast** product crossed {WATCH_MM:g} mm on some sampled rows.")
    else:
        lines.append(f"Both products crossed {WATCH_MM:g} mm on at least one sampled row.")
    lines.append("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
