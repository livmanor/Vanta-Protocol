# Model / rainfall evaluation report

Generated 2026-11-19T13:37:22 by `scripts/train_model.py event_day_eval`.

all labels are positives from the 2025 monsoon; negatives are dry-day or uncertain and were handled as described.

## Single-class limitation

Validated labels: 32 positives across 5 events, 0 negatives. Binary classifiers were **not fit** — a single class cannot support leave-one-event-out precision/recall. This report uses event-day evaluation instead.

## Sanity check

Sanity check (`scripts/check_event_rainfall.py`): rain_24h is the Asia/Kolkata civil day (00:00–24:00 IST) and includes afternoon/evening hours on the event date. No date-window misalignment was found; low totals are a rainfall-product issue, not a shifted day.

## Rainfall product comparison

See `docs/rainfall_product_comparison.md` for archive vs historical-forecast daily totals and peak hours on the labelled event days (gauge column only uses mm figures already present in pasted notes).

## Which product reaches 25 mm?

- Rows compared: 14
- Archive daily ≥ 25 mm: 0/14
- Historical-forecast daily ≥ 25 mm: 0/14

**Neither product reached 25 mm daily on the sampled labelled event locations/dates in this run.** The only pasted gauge figure in notes is Gajularamaram 2025-08-04 at 151.5 mm gauge, far above both Open-Meteo products at that point.

## Event-day evaluation (no negatives)

Universe: every day 2025-06-01..2025-09-30 (122 days) at each of 26 labelled locations.
Positive days = days with a validated `reported_positive` label at that location. **All other days are UNLABELLED, not negative.** Unlabelled days may include unreported waterlogging, so this report does **not** use precision. It reports **alert rate** (share of location-days with data that exceed the threshold) and how often the five event dates are caught.

uncertain negatives excluded

### 25 mm daily rule (rain_24h)

- Threshold: rain_24h ≥ 25 mm
- Events caught: 0 of 5
- Alert rate: 1.5% (46/3172 location-days with data)
- Best rank of each event day among 122 monsoon days at its labelled locations: evt-2025-07-18: #12 of 122; evt-2025-08-04: #18 of 122; evt-2025-08-07: #2 of 122; evt-2025-08-09: #11 of 122; evt-2025-09-18: #35 of 122

### rain_72h score

- Threshold: rain_72h ≥ 25 mm
- Events caught: 2 of 5 (evt-2025-08-07, evt-2025-08-09)
- Alert rate: 23.6% (748/3172 location-days with data)
- Best rank of each event day among 122 monsoon days at its labelled locations: evt-2025-07-18: #31 of 122; evt-2025-08-04: #66 of 122; evt-2025-08-07: #6 of 122; evt-2025-08-09: #9 of 122; evt-2025-09-18: #55 of 122

### hourly peak score

- Threshold: max hourly ≥ 30 mm
- Events caught: 0 of 5
- Alert rate: 0.0% (0/3172 location-days with data)
- Best rank of each event day among 122 monsoon days at its labelled locations: evt-2025-07-18: #4 of 122; evt-2025-08-04: #9 of 122; evt-2025-08-07: #10 of 122; evt-2025-08-09: #25 of 122; evt-2025-09-18: #17 of 122

### 7-day antecedent score

- Threshold: antecedent_7d ≥ 25 mm
- Events caught: 4 of 5 (evt-2025-07-18, evt-2025-08-07, evt-2025-08-09, evt-2025-09-18)
- Alert rate: 63.9% (2028/3172 location-days with data)
- Best rank of each event day among 122 monsoon days at its labelled locations: evt-2025-07-18: #67 of 122; evt-2025-08-04: #92 of 122; evt-2025-08-07: #41 of 122; evt-2025-08-09: #18 of 122; evt-2025-09-18: #45 of 122

## Conclusion

Reanalysis archive rainfall under-detects short urban cloudbursts; gauge-reported rainfall on the same days was far above our trigger.
