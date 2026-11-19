"""Shared rules for Hyderabad waterlogging labels.

V2 extensions (backwards-compatible):
  - source_url: explicit URL column; source remains free-text citation.
  - observation_confidence: high | medium | low | "" (empty treated as high).
  - observer_name, reviewed: optional provenance; not validated.
  - Uncertain rows (confidence=low or label_type=uncertain) are EXCLUDED from
    training (not rejected). They appear in the exclusion report.
  - Duplicate detection: same event_id + date + rounded lat/lon is excluded.
"""
import csv
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
LABELS_PATH = ROOT / "data" / "labels" / "hyderabad_events.csv"
CANDIDATES_PATH = ROOT / "data" / "labels" / "negative_candidates.csv"
TEMPLATE_PATH = ROOT / "data" / "labels" / "label_template.csv"
HOTSPOTS_PATH = ROOT / "data" / "hyderabad_hotspots.json"
LABELING_GUIDE_PATH = ROOT / "docs" / "LABELING_GUIDE.md"

# Same box as the GHMC grid. Chennai is outside it.
HYD_LAT_MIN = 17.30
HYD_LAT_MAX = 17.56
HYD_LON_MIN = 78.30
HYD_LON_MAX = 78.62

# Required columns (always present in the CSV header)
COLUMNS = [
    "event_id", "date", "lat", "lon", "location_name",
    "label", "label_type", "source", "notes",
]

# V2 optional columns — absent in old CSVs is fine; .get() returns None
OPTIONAL_COLUMNS = [
    "source_url",             # Explicit URL (may duplicate source for clarity)
    "observation_confidence", # high | medium | low | ""
    "observer_name",          # Free text; not validated
    "reviewed",               # yes | no | ""; not validated
]

POSITIVE_TYPE = "reported_positive"
NEGATIVE_TYPES = ("dry_day_negative", "heavy_rain_no_report_negative")
UNCERTAIN_TYPES = ("uncertain",)
LABEL_TYPES = (POSITIVE_TYPE, *NEGATIVE_TYPES, *UNCERTAIN_TYPES)

LOW_CONFIDENCE = "low"

# Training gates (overridable via arguments to training_gate())
MIN_POSITIVES = 10
MIN_NEGATIVES = 10
MIN_EVENTS_PER_CLASS = 2
# Legacy alias kept for existing callers that imported MIN_EVENTS
MIN_EVENTS = MIN_EVENTS_PER_CLASS

_URL = re.compile(r"https?://\S+")
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_RAINFALL_PRODUCT = (
    "open-meteo", "era5", "copernicus", "precipitation_sum",
    "archive-api.open-meteo",
)


def blank(value) -> bool:
    return value is None or str(value).strip() == ""


def is_seed(row: dict) -> bool:
    """A hotspot placeholder: coordinates only, nothing claimed about a day."""
    return all(blank(row.get(col)) for col in ("date", "label", "label_type", "source"))


def is_uncertain(row: dict) -> bool:
    """True for rows that are excluded from training but not rejected.

    Triggers: label_type=uncertain, or observation_confidence=low.
    These rows are valid entries; they just cannot be used as training signal.
    """
    lt = str(row.get("label_type", "")).strip()
    conf = str(row.get("observation_confidence", "")).strip().lower()
    return lt in UNCERTAIN_TYPES or conf == LOW_CONFIDENCE


def source_error(source: str) -> Optional[str]:
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


def _coordinate_errors(row: dict) -> List[str]:
    try:
        lat = float(row.get("lat"))
        lon = float(row.get("lon"))
    except (TypeError, ValueError):
        return ["lat and lon must be numbers"]
    if not (HYD_LAT_MIN <= lat <= HYD_LAT_MAX and HYD_LON_MIN <= lon <= HYD_LON_MAX):
        return [
            f"coordinates are outside the GHMC box "
            f"({HYD_LAT_MIN}–{HYD_LAT_MAX} N, {HYD_LON_MIN}–{HYD_LON_MAX} E); "
            "Chennai and other cities are excluded"
        ]
    return []


def _duplicate_key(row: dict) -> Optional[Tuple[str, str, str, str]]:
    """Deduplication key: event_id + date + rounded lat/lon (4 dp ≈ 11 m)."""
    try:
        lat_r = str(round(float(row.get("lat", 0) or 0), 4))
        lon_r = str(round(float(row.get("lon", 0) or 0), 4))
    except (TypeError, ValueError):
        return None
    return (
        str(row.get("event_id", "")).strip(),
        str(row.get("date", "")).strip(),
        lat_r,
        lon_r,
    )


def validate_row(row: dict, today: date) -> List[str]:
    """Return validation errors. An all-blank seed returns [] and is not a label."""
    if is_seed(row):
        errors: List[str] = []
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
        errors.append("label_type must be: " + ", ".join(LABEL_TYPES))
    if label == "1" and label_type and label_type not in (POSITIVE_TYPE, *UNCERTAIN_TYPES):
        errors.append(
            f"a positive label must use label_type {POSITIVE_TYPE} or uncertain"
        )
    if label == "0" and label_type == POSITIVE_TYPE:
        errors.append("a negative label cannot use label_type reported_positive")
    se = source_error(row.get("source"))
    if se:
        errors.append(se)
    return errors


def read_rows(path: Path) -> List[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [col for col in COLUMNS if col not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path} is missing columns: {', '.join(missing)}")
        return list(reader)


def training_gate(
    rows: List[dict],
    today: date,
    min_positives: int = MIN_POSITIVES,
    min_negatives: int = MIN_NEGATIVES,
    min_events_per_class: int = MIN_EVENTS_PER_CLASS,
) -> dict:
    """Full validation gate with duplicate detection, uncertain exclusion.

    Returns:
      seeds, accepted, rejected, excluded, duplicates,
      positives, negatives,
      events (alias for events_positive, legacy compat),
      events_positive, events_negative,
      positives_per_event,
      both_classes, only_positives, only_negatives,
      ready, date_min, date_max
    """
    seen_keys: Dict[Tuple, int] = {}
    duplicates: List[dict] = []
    accepted: List[dict] = []
    rejected: List[dict] = []
    excluded: List[dict] = []
    seeds = 0

    for index, row in enumerate(rows, start=2):
        if is_seed(row):
            seeds += 1
            continue
        errors = validate_row(row, today)
        if errors:
            rejected.append({
                "line": index,
                "errors": errors,
                "location_name": row.get("location_name"),
            })
            continue
        # Duplicate detection (after validation so coords are parseable)
        dup_key = _duplicate_key(row)
        if dup_key is not None:
            if dup_key in seen_keys:
                duplicates.append({
                    "line": index,
                    "first_seen_line": seen_keys[dup_key],
                    "event_id": row.get("event_id"),
                    "date": row.get("date"),
                })
                continue
            seen_keys[dup_key] = index
        # Uncertain / low-confidence exclusion (not rejection)
        if is_uncertain(row):
            excluded.append({"line": index, "row": row})
            continue
        accepted.append(row)

    positives = [r for r in accepted if str(r.get("label", "")).strip() == "1"]
    negatives = [r for r in accepted if str(r.get("label", "")).strip() == "0"]
    events_pos = sorted({r["event_id"].strip() for r in positives})
    events_neg = sorted({r["event_id"].strip() for r in negatives})
    dates = sorted(r["date"].strip() for r in accepted)

    per_event_pos: Dict[str, int] = defaultdict(int)
    for r in positives:
        per_event_pos[r["event_id"].strip()] += 1

    has_enough_pos = len(positives) >= min_positives
    has_enough_neg = len(negatives) >= min_negatives
    has_enough_events_pos = len(events_pos) >= min_events_per_class
    has_enough_events_neg = len(events_neg) >= min_events_per_class

    both_classes = len(positives) > 0 and len(negatives) > 0
    only_positives = len(positives) > 0 and len(negatives) == 0
    only_negatives = len(negatives) > 0 and len(positives) == 0

    ready = (
        not rejected
        and has_enough_pos
        and has_enough_neg
        and has_enough_events_pos
        and has_enough_events_neg
    )

    return {
        "seeds": seeds,
        "accepted": len(accepted),
        "rejected": rejected,
        "excluded": excluded,
        "duplicates": duplicates,
        "positives": len(positives),
        "negatives": len(negatives),
        "events": events_pos,          # legacy alias
        "events_positive": events_pos,
        "events_negative": events_neg,
        "positives_per_event": dict(per_event_pos),
        "both_classes": both_classes,
        "only_positives": only_positives,
        "only_negatives": only_negatives,
        "ready": ready,
        "date_min": dates[0] if dates else None,
        "date_max": dates[-1] if dates else None,
    }
