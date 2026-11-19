"""Sanity-check Open-Meteo archive rain windows for labelled event days.

For each distinct event date, sample up to 3 labelled locations and print
daily precipitation_sum, max hourly precipitation, and the exact Asia/Kolkata
calendar-day window used as rain_24h.
"""
from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import settings
from scripts.label_schema import LABELS_PATH, read_rows, validate_row

IST = timezone(timedelta(hours=5, minutes=30))


def today_ist() -> date:
    return datetime.now(IST).date()


def load_event_samples(limit_per_event: int = 3) -> dict[str, list[dict]]:
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


def fetch_archive(client: httpx.Client, lat: float, lon: float, day: date) -> dict:
    # Pull day-1 and day so evening continuity is visible next to the label day.
    response = client.get(
        settings.OPEN_METEO_ARCHIVE_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "start_date": (day - timedelta(days=1)).isoformat(),
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


def summarize(payload: dict, day: date) -> dict:
    day_s = day.isoformat()
    daily = payload.get("daily") or {}
    daily_pairs = list(zip(daily.get("time") or [], daily.get("precipitation_sum") or []))
    daily_on_day = None
    for stamp, value in daily_pairs:
        if stamp == day_s:
            daily_on_day = None if value is None else float(value)
            break

    hourly = payload.get("hourly") or {}
    hours = []
    peak = None
    peak_stamp = None
    evening_sum = 0.0
    evening_seen = 0
    for stamp, raw in zip(hourly.get("time") or [], hourly.get("precipitation") or []):
        if not isinstance(stamp, str) or not stamp.startswith(day_s):
            continue
        hours.append(stamp)
        if raw is None:
            continue
        value = float(raw)
        if peak is None or value > peak:
            peak, peak_stamp = value, stamp
        # Afternoon/evening block 12:00–23:00 IST on the event calendar day.
        hour = int(stamp[11:13]) if len(stamp) >= 13 else -1
        if 12 <= hour <= 23:
            evening_sum += value
            evening_seen += 1

    window_start = f"{day_s}T00:00 Asia/Kolkata"
    window_end = f"{day_s}T23:59 Asia/Kolkata"
    # Open-Meteo daily with timezone=Asia/Kolkata is the local civil day.
    covers_evening = bool(hours) and hours[0].endswith("00:00") and (
        hours[-1].endswith("23:00") or hours[-1].endswith("23:00:00")
    )
    return {
        "daily_pairs": daily_pairs,
        "daily_on_day": daily_on_day,
        "peak_hourly": peak,
        "peak_stamp": peak_stamp,
        "hour_count": len(hours),
        "first_hour": hours[0] if hours else None,
        "last_hour": hours[-1] if hours else None,
        "evening_sum_12_23": evening_sum if evening_seen else None,
        "window_start": window_start,
        "window_end": window_end,
        "covers_evening": covers_evening,
        "misaligned": not covers_evening,
    }


def main() -> int:
    samples = load_event_samples(3)
    if not samples:
        print("No validated positive event rows found.")
        return 1

    any_misaligned = False
    print(f"Archive URL: {settings.OPEN_METEO_ARCHIVE_URL}")
    print("rain_24h definition: Open-Meteo daily precipitation_sum for the Asia/Kolkata civil day")
    print("  = local midnight→midnight window that includes the afternoon/evening of that date.")
    print()

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        for event_id, rows in samples.items():
            day = date.fromisoformat(rows[0]["date"].strip())
            print(f"=== {event_id} ({day.isoformat()}) ===")
            for row in rows:
                lat = float(row["lat"])
                lon = float(row["lon"])
                name = row["location_name"]
                try:
                    payload = fetch_archive(client, lat, lon, day)
                    summary = summarize(payload, day)
                except Exception as exc:
                    print(f"- {name} ({lat},{lon}): FETCH FAILED {type(exc).__name__}: {exc}")
                    any_misaligned = True
                    continue
                if summary["misaligned"]:
                    any_misaligned = True
                print(
                    f"- {name} ({lat},{lon})\n"
                    f"  rain_24h window: {summary['window_start']} → {summary['window_end']}\n"
                    f"  hourly span on day: {summary['first_hour']} → {summary['last_hour']} "
                    f"({summary['hour_count']} hours); covers_evening={summary['covers_evening']}\n"
                    f"  daily precipitation_sum (day-1, day): {summary['daily_pairs']}\n"
                    f"  rain_24h (daily on event date): {summary['daily_on_day']}\n"
                    f"  max hourly on event date: {summary['peak_hourly']} at {summary['peak_stamp']}\n"
                    f"  afternoon/evening sum 12:00–23:00 IST: {summary['evening_sum_12_23']}"
                )
            print()

    if any_misaligned:
        print("RESULT: misalignment detected (missing evening hours or fetch failure). Fix the window before TASK 4.")
        return 2
    print(
        "RESULT: window is aligned. rain_24h is the Asia/Kolkata civil day "
        "(00:00–24:00 IST), which includes afternoon/night rain on the event date. "
        "No date-window bug found; low archive totals are a product/value issue, not a shifted day."
    )
    return 0


if __name__ == "__main__":
    # Clean import without the broken annotation above.
    sys.exit(main())
