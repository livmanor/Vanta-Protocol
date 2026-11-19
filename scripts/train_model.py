"""Train logistic regression and gradient boosting only when labels clear the gate.

Features come from the Open-Meteo archive for each labelled (lat, lon, date).
Validation is leave-one-event-out. Uncertain / unlabelled days are never treated
as negatives. Missing rainfall stays missing and drops that row from training.
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
)

REPORT = ROOT / "docs" / "model_report.md"
WATCH_MM = 25.0
MAX_RETRIES = 4


def ist_today():
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def _request(client: httpx.Client, params: dict) -> dict:
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.get(settings.OPEN_METEO_ARCHIVE_URL, params=params)
            if response.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            payload = response.json()
            return payload[0] if isinstance(payload, list) else payload
        except Exception as exc:
            last_exc = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"archive fetch failed: {last_exc}")


def fetch_window(client: httpx.Client, lat: float, lon: float, day: date) -> dict | None:
    start = (day - timedelta(days=7)).isoformat()
    end = day.isoformat()
    payload = _request(
        client,
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
    dates = list(daily.get("time") or [])
    values = list(daily.get("precipitation_sum") or [])
    by_day: dict[str, float | None] = {}
    for stamp, raw in zip(dates, values):
        by_day[stamp] = None if raw is None else float(raw)

    hourly = payload.get("hourly") or {}
    peak: float | None = None
    for stamp, raw in zip(hourly.get("time") or [], hourly.get("precipitation") or []):
        if not isinstance(stamp, str) or not stamp.startswith(day.isoformat()):
            continue
        if raw is None:
            continue
        value = float(raw)
        peak = value if peak is None or value > peak else peak

    def sum_last(n: int) -> float | None:
        total = 0.0
        seen = 0
        for offset in range(n):
            key = (day - timedelta(days=offset)).isoformat()
            value = by_day.get(key)
            if value is None:
                return None
            total += value
            seen += 1
        return total if seen == n else None

    rain_24h = by_day.get(day.isoformat())
    rain_48h = sum_last(2)
    rain_72h = sum_last(3)
    antecedent_7d = sum_last(7)
    if rain_24h is None:
        return None
    return {
        "rain_24h": rain_24h,
        "rain_48h": rain_48h,
        "rain_72h": rain_72h,
        "max_hourly": peak,
        "antecedent_7d": antecedent_7d,
    }


def metrics(y_true: list[int], y_pred: list[int]) -> dict[str, float]:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


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


def main() -> int:
    if not LABELS_PATH.exists():
        print(f"No label file at {LABELS_PATH}")
        return 1
    summary = training_gate(read_rows(LABELS_PATH), ist_today())
    if summary["rejected"]:
        reason = f"Rejected {len(summary['rejected'])} invalid label row(s). Fix them before training."
        write_gate_report(summary, reason)
        print(reason)
        return 1
    if summary["positives"] < MIN_POSITIVES or len(summary["events"]) < MIN_EVENTS:
        reason = (
            f"Training refused: need at least {MIN_POSITIVES} positives across {MIN_EVENTS} distinct events; "
            f"found {summary['positives']} positive(s) across {len(summary['events'])} event(s)."
        )
        write_gate_report(summary, reason)
        print(reason)
        print(f"Wrote {REPORT}")
        return 1

    try:
        from sklearn.ensemble import GradientBoostingClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
    except ImportError:
        print("scikit-learn is required for training. Install with: pip install scikit-learn")
        return 1

    rows = []
    for row in read_rows(LABELS_PATH):
        if str(row.get("label", "")).strip() not in {"0", "1"}:
            continue
        # Seeds already excluded by training_gate acceptance path; re-read accepted only.
        errors = []
        from scripts.label_schema import validate_row

        errors = validate_row(row, ist_today())
        if errors:
            continue
        rows.append(row)

    feature_rows = []
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        for row in rows:
            day = datetime.strptime(row["date"].strip(), "%Y-%m-%d").date()
            lat = float(row["lat"])
            lon = float(row["lon"])
            try:
                feats = fetch_window(client, lat, lon, day)
            except Exception as exc:
                print(f"Skipping {row.get('location_name')} {row.get('date')}: {type(exc).__name__}")
                continue
            if not feats or feats.get("rain_48h") is None or feats.get("rain_72h") is None:
                print(f"Skipping {row.get('location_name')} {row.get('date')}: incomplete archive features")
                continue
            if feats.get("max_hourly") is None or feats.get("antecedent_7d") is None:
                print(f"Skipping {row.get('location_name')} {row.get('date')}: incomplete hourly/antecedent features")
                continue
            feature_rows.append(
                {
                    "event_id": row["event_id"].strip(),
                    "y": int(row["label"].strip()),
                    "x": [
                        feats["rain_24h"],
                        feats["rain_48h"],
                        feats["rain_72h"],
                        feats["max_hourly"],
                        feats["antecedent_7d"],
                    ],
                    "rain_24h": feats["rain_24h"],
                }
            )
            time.sleep(0.2)

    if len(feature_rows) < MIN_POSITIVES:
        print("Not enough rows with complete Open-Meteo features to train.")
        return 1

    by_event = defaultdict(list)
    for item in feature_rows:
        by_event[item["event_id"]].append(item)
    event_ids = sorted(by_event)

    def loeo(predict_fn) -> dict[str, float] | dict[str, str]:
        y_true: list[int] = []
        y_pred: list[int] = []
        fold_errors: list[str] = []
        for held in event_ids:
            train = [item for eid, items in by_event.items() if eid != held for item in items]
            test = by_event[held]
            if not train or not test:
                continue
            try:
                preds = predict_fn(train, test)
            except Exception as exc:
                fold_errors.append(f"{held}: {type(exc).__name__}: {exc}")
                continue
            y_true.extend(item["y"] for item in test)
            y_pred.extend(preds)
        if fold_errors and not y_pred:
            return {"error": "; ".join(fold_errors)}
        scores = metrics(y_true, y_pred)
        if fold_errors:
            scores["fold_errors"] = "; ".join(fold_errors)
        return scores

    def baseline_predict(train, test):
        return [1 if item["rain_24h"] >= WATCH_MM else 0 for item in test]

    def model_predict(factory):
        def _predict(train, test):
            labels = {item["y"] for item in train}
            if len(labels) < 2:
                raise ValueError(
                    "training fold has a single class "
                    f"({next(iter(labels))}); binary classifier not fit"
                )
            model = factory()
            model.fit([item["x"] for item in train], [item["y"] for item in train])
            return list(model.predict([item["x"] for item in test]))

        return _predict

    classes_present = sorted({item["y"] for item in feature_rows})
    baseline_scores = loeo(baseline_predict)
    logreg_scores = loeo(
        model_predict(
            lambda: Pipeline(
                [
                    ("scale", StandardScaler()),
                    ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
                ]
            )
        )
    )
    gb_scores = loeo(
        model_predict(
            lambda: GradientBoostingClassifier(random_state=42)
        )
    )

    def fmt(name: str, scores: dict) -> str:
        if "error" in scores:
            return f"- **{name}**: not scored — {scores['error']}"
        line = (
            f"- **{name}**: precision={scores['precision']:.3f}, "
            f"recall={scores['recall']:.3f}, F1={scores['f1']:.3f} "
            f"(tp={scores['tp']}, fp={scores['fp']}, fn={scores['fn']})"
        )
        if scores.get("fold_errors"):
            line += f" [partial folds skipped: {scores['fold_errors']}]"
        return line

    lines = [
        "# Model comparison report",
        "",
        f"Generated {datetime.now().isoformat(timespec='seconds')}.",
        "",
        "all labels are positives from the 2025 monsoon; negatives are dry-day or uncertain and were handled as described.",
        "",
        f"Trained on {len(feature_rows)} labelled rows with complete Open-Meteo features "
        f"({summary['positives']} positives, {summary['negatives']} negatives, "
        f"{len(event_ids)} events / leave-one-event-out folds). "
        f"Classes present in feature rows: {classes_present}.",
        "",
        "Features: rain_24h, rain_48h, rain_72h, max hourly intensity, 7-day antecedent rain.",
        "Baseline: daily rain_24h ≥ 25 mm.",
        "",
        fmt("Baseline (≥25 mm)", baseline_scores),
        fmt("Logistic regression", logreg_scores),
        fmt("Gradient boosting", gb_scores),
        "",
        "uncertain negatives excluded",
        "",
    ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT}")
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
