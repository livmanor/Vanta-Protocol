"""List negative CANDIDATES. This script does not write flood labels.

It never sets label to 0 or 1. source is left blank, so validate_labels.py
will reject these rows if they are copied into hyderabad_events.csv unchanged.

(a) dry_day_negative
    The six hotspot coordinates on days whose Open-Meteo archive daily total
    is at or below NEAR_ZERO_MM. The millimetre cutoff only chooses which days
    to show a person. It is not a label.

(b) heavy_rain_no_report_negative
    Other GHMC cell centers on a day that already has a human-confirmed
    positive somewhere in hyderabad_events.csv. "Heavy rain" here means
    "a documented waterlogging day", not a rainfall threshold. A missing
    report is not proof the cell was dry. Reporting bias is stated in the
    notes of every such row.

Confirmed positives must already pass validate_labels.py. Chennai rows cannot
pass that check, so they cannot define an event day. Archive responses are
cached under data/labels/cache and are not labels.

    python scripts/propose_negative_candidates.py --start 2024-06-01 --end 2024-09-30
"""
import argparse
import csv
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import settings
from backend.services.grid import LAT_COUNT, LON_COUNT, grid_steps
from scripts.label_schema import (
    CANDIDATES_PATH,
    COLUMNS,
    HOTSPOTS_PATH,
    HYD_LAT_MIN,
    HYD_LON_MIN,
    LABELS_PATH,
    read_rows,
    training_gate,
)

NEAR_ZERO_MM = 0.1
MAX_DRY_PER_LOCATION = 8
CACHE_DIR = ROOT / "data" / "labels" / "cache"


def ist_today() -> date:
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def load_hotspots() -> list[dict]:
    payload = json.loads(HOTSPOTS_PATH.read_text(encoding="utf-8"))
    return payload["hotspots"]


def cell_centers() -> list[tuple[float, float, str]]:
    lat_step, lon_step = grid_steps()
    centers = []
    for row in range(LAT_COUNT):
        for col in range(LON_COUNT):
            lat = round(HYD_LAT_MIN + (row + 0.5) * lat_step, 5)
            lon = round(HYD_LON_MIN + (col + 0.5) * lon_step, 5)
            centers.append((lat, lon, f"hyd-grid-r{row:02d}-c{col:02d}"))
    return centers


def archive_daily(lat: float, lon: float, start: str, end: str) -> list[tuple[str, float | None]]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"daily_{lat:.5f}_{lon:.5f}_{start}_{end}.json"
    if cache_path.exists():
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    else:
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
            timeout=40.0,
        )
        response.raise_for_status()
        payload = response.json()
        cache_path.write_text(json.dumps(payload), encoding="utf-8")
    daily = payload.get("daily") or {}
    dates = daily.get("time") or []
    values = daily.get("precipitation_sum") or []
    rows = []
    for index, day in enumerate(dates):
        raw = values[index] if index < len(values) else None
        rows.append((day, None if raw is None else float(raw)))
    return rows


def confirmed_positives(today: date) -> list[dict]:
    if not LABELS_PATH.exists():
        return []
    summary = training_gate(read_rows(LABELS_PATH), today)
    if summary["rejected"]:
        lines = ", ".join(str(item["line"]) for item in summary["rejected"])
        raise SystemExit(f"Fix rejected label rows before proposing negatives: {lines}")
    rows = []
    for row in read_rows(LABELS_PATH):
        if str(row.get("label", "")).strip() == "1":
            rows.append(row)
    return rows


def candidate_row(**fields) -> dict:
    row = {column: "" for column in COLUMNS}
    row.update(fields)
    row["label"] = ""
    row["source"] = ""
    return row


def dry_candidates(start: str, end: str) -> list[dict]:
    rows = []
    for hotspot in load_hotspots():
        lat, lon = hotspot["centroid"]
        series = archive_daily(float(lat), float(lon), start, end)
        dry = [(day, value) for day, value in series if value is not None and value <= NEAR_ZERO_MM]
        dry.sort(key=lambda item: (item[1], item[0]))
        for day, value in dry[:MAX_DRY_PER_LOCATION]:
            rows.append(
                candidate_row(
                    event_id=f"candidate-dry-{hotspot['id']}-{day}",
                    date=day,
                    lat=lat,
                    lon=lon,
                    location_name=hotspot["name"],
                    label_type="dry_day_negative",
                    notes=(
                        "CANDIDATE ONLY, not a label. "
                        f"Archive daily total was {value:.2f} mm, at or below {NEAR_ZERO_MM:.1f} mm. "
                        "Confirm the day was checked and add a source that is not a rainfall product. "
                        "A low archive total does not prove the street was dry."
                    ),
                )
            )
    return rows


def unreported_candidates(positives: list[dict], start: str, end: str) -> list[dict]:
    """Other cells on a day a person already documented waterlogging somewhere."""
    event_days = sorted({row["date"].strip() for row in positives if start <= row["date"].strip() <= end})
    reported = {(row["date"].strip(), round(float(row["lat"]), 3), round(float(row["lon"]), 3)) for row in positives}
    rows = []
    centers = cell_centers()
    for day in event_days:
        for lat, lon, cell_id in centers:
            if (day, round(lat, 3), round(lon, 3)) in reported:
                continue
            rows.append(
                candidate_row(
                    event_id=f"candidate-unreported-{cell_id}-{day}",
                    date=day,
                    lat=lat,
                    lon=lon,
                    location_name=cell_id,
                    label_type="heavy_rain_no_report_negative",
                    notes=(
                        "CANDIDATE ONLY, not a label. "
                        f"{day} has a confirmed waterlogging report at another Hyderabad location. "
                        "This cell has no such report. A missing report is not proof the cell was dry: "
                        "many waterlogged streets are never written down. "
                        "Add a source that documents a check, not a rainfall threshold."
                    ),
                )
            )
    return rows


def write_candidates(rows: list[dict]) -> None:
    CANDIDATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CANDIDATES_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Propose negative candidates. Does not create labels.")
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD")
    args = parser.parse_args()
    datetime.strptime(args.start, "%Y-%m-%d")
    datetime.strptime(args.end, "%Y-%m-%d")
    positives = confirmed_positives(ist_today())
    rows = dry_candidates(args.start, args.end)
    unreported = unreported_candidates(positives, args.start, args.end)
    rows.extend(unreported)
    write_candidates(rows)
    print(f"Wrote {len(rows)} candidates to {CANDIDATES_PATH}")
    print(f"  dry-day candidates: {len(rows) - len(unreported)}")
    print(f"  unreported-cell candidates: {len(unreported)}")
    print(f"Confirmed positives used to choose event days: {len(positives)}")
    print("label and source are blank. These rows are not training data.")
    if not positives:
        print("No confirmed positives in range, so no unreported-cell candidates were created.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
