"""Reject waterlogging rows that are missing a day or a citable source.

Location seeds (blank date, label, and source) are reported and ignored.
They are not labels. Rainfall-archive text is not an acceptable source.
Exit 1 when any non-seed row is invalid.

    python scripts/validate_labels.py
    python scripts/validate_labels.py path/to.csv
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.label_schema import LABELS_PATH, MIN_EVENTS, MIN_POSITIVES, read_rows, training_gate


def ist_today():
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def main(path: Path | None = None) -> int:
    target = path or LABELS_PATH
    if not target.exists():
        print(f"No label file at {target}")
        return 1
    summary = training_gate(read_rows(target), ist_today())
    print(f"File: {target}")
    print(f"Location seeds (not labels): {summary['seeds']}")
    print(f"Accepted labels: {summary['accepted']}")
    print(f"Positives: {summary['positives']}")
    print(f"Negatives: {summary['negatives']}")
    print(f"Date range: {summary['date_min'] or '—'} to {summary['date_max'] or '—'}")
    print(f"Distinct positive events: {len(summary['events'])}")
    if summary["positives_per_event"]:
        for event_id, count in summary["positives_per_event"].items():
            print(f"  {event_id}: {count} positive(s)")
    else:
        print("  none")
    if summary["negatives"] or summary["positives"]:
        total = summary["positives"] + summary["negatives"]
        print(f"Positive rate among accepted labels: {summary['positives']}/{total}")
    for item in summary["rejected"]:
        print(f"Line {item['line']} ({item['location_name'] or 'unnamed'}): {'; '.join(item['errors'])}")
    if summary["rejected"]:
        print(f"Rejected {len(summary['rejected'])} row(s).")
        return 1
    if summary["positives"] < MIN_POSITIVES or len(summary["events"]) < MIN_EVENTS:
        print(
            f"STOP. Training needs at least {MIN_POSITIVES} sourced positives "
            f"and {MIN_EVENTS} distinct events. "
            f"This file has {summary['positives']} positive(s) and {len(summary['events'])} event(s)."
        )
        return 0
    print("Label count clears the training gate. Features and a time split are still required.")
    return 0


if __name__ == "__main__":
    argument = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    sys.exit(main(argument))
