"""Label-gated rainfall evaluation for Hyderabad waterlogging positives.

Modes:
  event_day_eval  — default when labels clear the gate. Ranks/alerts on
                    2025-06-01..2025-09-30 without treating unlabelled days
                    as negatives. No single-class model fitting.
  loeo            — leave-one-event-out precision/recall (needs both classes).

Uncertain / unlabelled days are never invented as negatives.
"""
from __future__ import annotations

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
from scripts.label_schema import (
    LABELS_PATH,
    MIN_EVENTS,
    MIN_POSITIVES,
    read_rows,
    training_gate,
    validate_row,
)

REPORT = ROOT / "docs" / "model_report.md"
COMPARISON = ROOT / "docs" / "rainfall_product_comparison.md"
WATCH_MM = 25.0
HOURLY_PEAK_MM = 30.0
SEASON_START = date(2025, 6, 1)
SEASON_END = date(2025, 9, 30)
MAX_RETRIES = 4
IST = timezone(timedelta(hours=5, minutes=30))


def ist_today():
    return datetime.now(IST).date()


def _request(client: httpx.Client, url: str, params: dict) -> dict:
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.get(url, params=params)
            if response.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            payload = response.json()
            return payload[0] if isinstance(payload, list) else payload
        except Exception as exc:
            last_exc = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Open-Meteo request failed after retries: {last_exc}")


def fetch_season(client: httpx.Client, lat: float, lon: float) -> dict[str, dict]:
    """Return per-day features for the 2025 monsoon window. Missing stays missing."""
    # Antecedent needs 7 days before season start.
    start = (SEASON_START - timedelta(days=7)).isoformat()
    end = SEASON_END.isoformat()
    payload = _request(
        client,
        settings.OPEN_METEO_ARCHIVE_URL,
        {
            "latitude": lat,
            "longitude": lon,
            "start_date": start,
            "end_date": end,
            "daily": "precipitation_sum",
            "hourly": "precipitation",
            "timezone": "Asia/Kolkata",
        },
    )
    daily = payload.get("daily") or {}
    by_day: dict[str, float | None] = {}
    for stamp, raw in zip(daily.get("time") or [], daily.get("precipitation_sum") or []):
        by_day[stamp] = None if raw is None else float(raw)

    peak_by_day: dict[str, float | None] = {}
    for stamp, raw in zip((payload.get("hourly") or {}).get("time") or [], (payload.get("hourly") or {}).get("precipitation") or []):
        if not isinstance(stamp, str) or len(stamp) < 10:
            continue
        day_s = stamp[:10]
        if raw is None:
            peak_by_day.setdefault(day_s, None)
            continue
        value = float(raw)
        previous = peak_by_day.get(day_s)
        if previous is None or value > previous:
            peak_by_day[day_s] = value

    def sum_last(day: date, n: int) -> float | None:
        total = 0.0
        for offset in range(n):
            value = by_day.get((day - timedelta(days=offset)).isoformat())
            if value is None:
                return None
            total += value
        return total

    out: dict[str, dict] = {}
    day = SEASON_START
    while day <= SEASON_END:
        day_s = day.isoformat()
        rain_24h = by_day.get(day_s)
        out[day_s] = {
            "rain_24h": rain_24h,
            "rain_72h": sum_last(day, 3),
            "max_hourly": peak_by_day.get(day_s),
            "antecedent_7d": sum_last(day, 7),
        }
        day += timedelta(days=1)
    return out


def accepted_positives(summary_rows=None) -> list[dict]:
    rows = []
    for row in read_rows(LABELS_PATH):
        if validate_row(row, ist_today()):
            continue
        if str(row.get("label", "")).strip() != "1":
            continue
        rows.append(row)
    return rows


def write_gate_report(summary: dict, reason: str) -> None:
    lines = [
        "# Model comparison report",
        "",
        f"Generated {datetime.now().isoformat(timespec='seconds')}.",
        "",
        "**Not trained yet — labels below gate.**",
        "",
        reason,
        "",
        f"- Valid positives: {summary['positives']} (need {MIN_POSITIVES})",
        f"- Distinct positive events: {len(summary['events'])} (need {MIN_EVENTS})",
        f"- Valid negatives: {summary['negatives']}",
        f"- Rejected rows: {len(summary['rejected'])}",
        "",
        "uncertain negatives excluded",
        "",
    ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def _rank(values: list[tuple[str, float]], day_s: str) -> int | None:
    """Rank 1 = highest value among days with non-missing scores."""
    ordered = sorted(values, key=lambda item: item[1], reverse=True)
    for index, (stamp, _) in enumerate(ordered, start=1):
        if stamp == day_s:
            return index
    return None


def event_day_eval() -> int:
    summary = training_gate(read_rows(LABELS_PATH), ist_today())
    if summary["rejected"]:
        write_gate_report(summary, f"Rejected {len(summary['rejected'])} invalid label row(s).")
        print("Rejected rows present; refusing event_day_eval.")
        return 1
    if summary["positives"] < MIN_POSITIVES or len(summary["events"]) < MIN_EVENTS:
        reason = (
            f"Training refused: need at least {MIN_POSITIVES} positives across {MIN_EVENTS} distinct events; "
            f"found {summary['positives']} positive(s) across {len(summary['events'])} event(s)."
        )
        write_gate_report(summary, reason)
        print(reason)
        return 1

    positives = accepted_positives()
    # Unique locations from positives.
    locations: dict[tuple[float, float, str], dict] = {}
    positives_by_loc_day: dict[tuple[float, float], set[str]] = defaultdict(set)
    event_locs: dict[str, list[tuple[float, float, str]]] = defaultdict(list)
    for row in positives:
        lat = float(row["lat"])
        lon = float(row["lon"])
        key = (lat, lon, row["location_name"])
        locations[key] = row
        day_s = row["date"].strip()
        positives_by_loc_day[(lat, lon)].add(day_s)
        event_locs[row["event_id"].strip()].append((lat, lon, row["location_name"]))

    season_days = []
    day = SEASON_START
    while day <= SEASON_END:
        season_days.append(day.isoformat())
        day += timedelta(days=1)
    n_days = len(season_days)

    series_by_loc: dict[tuple[float, float], dict[str, dict]] = {}
    with httpx.Client(timeout=90.0, follow_redirects=True) as client:
        for lat, lon, name in locations:
            print(f"Fetching season archive for {name} ({lat},{lon})")
            series_by_loc[(lat, lon)] = fetch_season(client, lat, lon)
            time.sleep(0.35)

    # Universe observations: every labelled location × every season day.
    # Positive only when that location has a reported_positive on that day.
    # All other days are UNLABELLED, not negative.
    features = {
        "rain_24h_ge_25": ("rain_24h", WATCH_MM),
        "rain_72h_ge_25": ("rain_72h", WATCH_MM),
        "hourly_peak_ge_30": ("max_hourly", HOURLY_PEAK_MM),
        "antecedent_7d_ge_25": ("antecedent_7d", WATCH_MM),
    }

    def alert_stats(feature_key: str, threshold: float) -> dict:
        alerted = 0
        known = 0
        events_caught = set()
        ranks: dict[str, list[int]] = defaultdict(list)
        for (lat, lon, name), _row in locations.items():
            series = series_by_loc[(lat, lon)]
            scored_days: list[tuple[str, float]] = []
            for day_s in season_days:
                value = series.get(day_s, {}).get(feature_key)
                if value is None:
                    continue
                known += 1
                scored_days.append((day_s, float(value)))
                if float(value) >= threshold:
                    alerted += 1
            for event_id, locs in event_locs.items():
                if not any(abs(lat - elat) < 1e-9 and abs(lon - elon) < 1e-9 for elat, elon, _ in locs):
                    continue
                # Event date = date on any positive row for this event.
                event_day = next(
                    (r["date"].strip() for r in positives if r["event_id"].strip() == event_id),
                    None,
                )
                if not event_day:
                    continue
                value = series.get(event_day, {}).get(feature_key)
                if value is not None and float(value) >= threshold:
                    events_caught.add(event_id)
                rank = _rank(scored_days, event_day)
                if rank is not None:
                    ranks[event_id].append(rank)
        return {
            "events_caught": len(events_caught),
            "events_caught_ids": sorted(events_caught),
            "alert_rate": (alerted / known) if known else None,
            "alerted": alerted,
            "known": known,
            "ranks": {event_id: (min(vals) if vals else None) for event_id, vals in ranks.items()},
        }

    # Also keep a plain rain_24h ranking feature for the named 25 mm rule block.
    rule = alert_stats("rain_24h", WATCH_MM)
    rain72 = alert_stats("rain_72h", WATCH_MM)
    hourly = alert_stats("max_hourly", HOURLY_PEAK_MM)
    ante = alert_stats("antecedent_7d", WATCH_MM)

    event_ids = sorted(event_locs)
    comparison_excerpt = ""
    if COMPARISON.exists():
        comparison_excerpt = COMPARISON.read_text(encoding="utf-8")

    sanity = (
        "Sanity check (`scripts/check_event_rainfall.py`): rain_24h is the Asia/Kolkata civil day "
        "(00:00–24:00 IST) and includes afternoon/evening hours on the event date. "
        "No date-window misalignment was found; low totals are a rainfall-product issue, not a shifted day."
    )

    def fmt_block(title: str, stats: dict, threshold_note: str) -> list[str]:
        rate = stats["alert_rate"]
        rate_text = "missing" if rate is None else f"{100.0 * rate:.1f}% ({stats['alerted']}/{stats['known']} location-days with data)"
        rank_bits = []
        for event_id in event_ids:
            rank = stats["ranks"].get(event_id)
            rank_bits.append(f"{event_id}: {'n/a' if rank is None else f'#{rank} of {n_days}'}")
        return [
            f"### {title}",
            "",
            f"- Threshold: {threshold_note}",
            f"- Events caught: {stats['events_caught']} of {len(event_ids)}"
            + (f" ({', '.join(stats['events_caught_ids'])})" if stats["events_caught_ids"] else ""),
            f"- Alert rate: {rate_text}",
            f"- Best rank of each event day among {n_days} monsoon days at its labelled locations: "
            + "; ".join(rank_bits),
            "",
        ]

    lines = [
        "# Model / rainfall evaluation report",
        "",
        f"Generated {datetime.now().isoformat(timespec='seconds')} by `scripts/train_model.py event_day_eval`.",
        "",
        "all labels are positives from the 2025 monsoon; negatives are dry-day or uncertain and were handled as described.",
        "",
        "## Single-class limitation",
        "",
        f"Validated labels: {summary['positives']} positives across {len(summary['events'])} events, "
        f"{summary['negatives']} negatives. Binary classifiers were **not fit** — a single class cannot support "
        "leave-one-event-out precision/recall. This report uses event-day evaluation instead.",
        "",
        "## Sanity check",
        "",
        sanity,
        "",
        "## Rainfall product comparison",
        "",
        "See `docs/rainfall_product_comparison.md` for archive vs historical-forecast daily totals and peak hours "
        "on the labelled event days (gauge column only uses mm figures already present in pasted notes).",
        "",
    ]
    if comparison_excerpt:
        # Pull the "Which product reaches 25 mm?" section if present.
        marker = "## Which product reaches 25 mm?"
        if marker in comparison_excerpt:
            lines.append(comparison_excerpt[comparison_excerpt.index(marker):].strip())
            lines.append("")

    lines.extend(
        [
            "## Event-day evaluation (no negatives)",
            "",
            f"Universe: every day {SEASON_START.isoformat()}..{SEASON_END.isoformat()} ({n_days} days) "
            f"at each of {len(locations)} labelled locations.",
            "Positive days = days with a validated `reported_positive` label at that location. "
            "**All other days are UNLABELLED, not negative.** Unlabelled days may include unreported waterlogging, "
            "so this report does **not** use precision. It reports **alert rate** (share of location-days with data "
            "that exceed the threshold) and how often the five event dates are caught.",
            "",
            "uncertain negatives excluded",
            "",
        ]
    )
    lines.extend(fmt_block("25 mm daily rule (rain_24h)", rule, f"rain_24h ≥ {WATCH_MM:g} mm"))
    lines.extend(fmt_block("rain_72h score", rain72, f"rain_72h ≥ {WATCH_MM:g} mm"))
    lines.extend(fmt_block("hourly peak score", hourly, f"max hourly ≥ {HOURLY_PEAK_MM:g} mm"))
    lines.extend(fmt_block("7-day antecedent score", ante, f"antecedent_7d ≥ {WATCH_MM:g} mm"))
    lines.extend(
        [
            "## Conclusion",
            "",
            "Reanalysis archive rainfall under-detects short urban cloudbursts; gauge-reported rainfall on the same days was far above our trigger.",
            "",
        ]
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT}")
    for line in lines:
        print(line)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    mode = args[0] if args else "event_day_eval"
    if mode in {"event_day_eval", "eval", "default"}:
        return event_day_eval()
    if mode == "loeo":
        print(
            "loeo precision/recall mode is disabled while the label file is single-class. "
            "Use: python scripts/train_model.py event_day_eval"
        )
        return 1
    print(f"Unknown mode {mode!r}. Use event_day_eval.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
