"""Shared rules for Hyderabad waterlogging labels.

A row is a label only when a person has supplied the day and a source that is
not a rainfall product. Location seeds and rainfall screens are not labels.
"""
import csv
import re
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LABELS_PATH = ROOT / "data" / "labels" / "hyderabad_events.csv"
CANDIDATES_PATH = ROOT / "data" / "labels" / "negative_candidates.csv"
HOTSPOTS_PATH = ROOT / "data" / "hyderabad_hotspots.json"

# Same box as the GHMC grid in backend/services/grid.py. Chennai is outside it.
HYD_LAT_MIN = 17.30
HYD_LAT_MAX = 17.56
HYD_LON_MIN = 78.30
HYD_LON_MAX = 78.62

COLUMNS = [
    "event_id",
    "date",
    "lat",
    "lon",
    "location_name",
    "label",
    "label_type",
    "source",
    "notes",
]

POSITIVE_TYPE = "reported_positive"
NEGATIVE_TYPES = ("dry_day_negative", "heavy_rain_no_report_negative")
LABEL_TYPES = (POSITIVE_TYPE, *NEGATIVE_TYPES)

# Training stops below these counts. They are not a quality claim.
MIN_POSITIVES = 30
MIN_EVENTS = 3

_URL = re.compile(r"https?://\S+")
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_RAINFALL_PRODUCT = (
    "open-meteo",
    "era5",
    "copernicus",
    "precipitation_sum",
    "archive-api.open-meteo",
)


def blank(value) -> bool:
    return value is None or str(value).strip() == ""


def is_seed(row: dict) -> bool:
    """A hotspot placeholder: coordinates only, nothing claimed about a day."""
    return all(blank(row.get(column)) for column in ("date", "label", "label_type", "source"))


def source_error(source: str) -> str | None:
    text = (source or "").strip()
    if not text:
        return "source is missing"
    lowered = text.lower()
    if any(token in lowered for token in _RAINFALL_PRODUCT):
        return "source is a rainfall product; a rainfall threshold cannot be a flood label"
    has_url = _URL.search(text) is not None
    has_citation = _YEAR.search(text) is not None and len(text.split()) >= 4
    if not has_url and not has_citation:
        return "source needs a URL or a citation that includes a year"
    return None


def validate_row(row: dict, today: date) -> list[str]:
    """Return errors. An all-blank seed has no errors and is not a label."""
    if is_seed(row):
        errors = []
        if blank(row.get("lat")) or blank(row.get("lon")) or blank(row.get("location_name")):
            errors.append("a seed still needs lat, lon, and location_name")
        else:
            errors.extend(_coordinate_errors(row))
        return errors

    errors = []
    if blank(row.get("event_id")):
        errors.append("event_id is missing")
    if blank(row.get("location_name")):
        errors.append("location_name is missing")
    if blank(row.get("date")):
        errors.append("date is missing")
    else:
        try:
            observed = datetime.strptime(str(row["date"]).strip(), "%Y-%m-%d").date()
        except ValueError:
            errors.append("date must be YYYY-MM-DD")
        else:
            if observed > today:
                errors.append("date is in the future")
    errors.extend(_coordinate_errors(row))

    label = str(row.get("label", "")).strip()
    label_type = str(row.get("label_type", "")).strip()
    if label not in {"0", "1"}:
        errors.append("label must be 1 (reported) or 0 (checked and not reported)")
    if label_type not in LABEL_TYPES:
        errors.append("label_type must be " + ", ".join(LABEL_TYPES))
    if label == "1" and label_type and label_type != POSITIVE_TYPE:
        errors.append("a positive label must use label_type reported_positive")
    if label == "0" and label_type == POSITIVE_TYPE:
        errors.append("a negative label cannot use label_type reported_positive")
    errors.append(source_error(row.get("source"))) if source_error(row.get("source")) else None
    return errors


def _coordinate_errors(row: dict) -> list[str]:
    try:
        lat = float(row.get("lat"))
        lon = float(row.get("lon"))
    except (TypeError, ValueError):
        return ["lat and lon must be numbers"]
    if not (HYD_LAT_MIN <= lat <= HYD_LAT_MAX and HYD_LON_MIN <= lon <= HYD_LON_MAX):
        return [
            "coordinates are outside the GHMC box "
            f"({HYD_LAT_MIN}–{HYD_LAT_MAX} N, {HYD_LON_MIN}–{HYD_LON_MAX} E); "
            "Chennai and other cities are excluded"
        ]
    return []


def read_rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [column for column in COLUMNS if column not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path} is missing columns: {', '.join(missing)}")
        return list(reader)


def training_gate(rows: list[dict], today: date) -> dict:
    """Count accepted labels. This does not create any."""
    accepted = []
    rejected = []
    seeds = 0
    for index, row in enumerate(rows, start=2):
        if is_seed(row):
            seeds += 1
            continue
        errors = validate_row(row, today)
        if errors:
            rejected.append({"line": index, "errors": errors, "location_name": row.get("location_name")})
        else:
            accepted.append(row)
    positives = [row for row in accepted if row["label"].strip() == "1"]
    negatives = [row for row in accepted if row["label"].strip() == "0"]
    events = sorted({row["event_id"].strip() for row in positives})
    dates = sorted(row["date"].strip() for row in accepted)
    per_event = {}
    for row in positives:
        per_event[row["event_id"].strip()] = per_event.get(row["event_id"].strip(), 0) + 1
    return {
        "seeds": seeds,
        "accepted": len(accepted),
        "positives": len(positives),
        "negatives": len(negatives),
        "rejected": rejected,
        "events": events,
        "positives_per_event": per_event,
        "date_min": dates[0] if dates else None,
        "date_max": dates[-1] if dates else None,
        "ready": len(positives) >= MIN_POSITIVES and len(events) >= MIN_EVENTS and not rejected,
    }
