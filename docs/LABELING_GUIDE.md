# Hyderabad waterlogging label guide

Use `data/labels/hyderabad_events.csv` only for **human-verified** labels. Do not invent rows. Location seeds (blank date / label / source) are placeholders for coordinates, not training labels.

## Columns

| Column | Required for a label? | Meaning |
|---|---|---|
| `event_id` | yes | Stable id for one dated event cluster (e.g. `evt-2024-09-01`). Same id for every location labelled on that event. |
| `date` | yes | Observation day as `YYYY-MM-DD` (IST calendar day of the report). |
| `lat` / `lon` | yes | Point inside the GHMC box used by the city grid. |
| `location_name` | yes | Human-readable place name. |
| `label` | yes | `1` = reported waterlogging; `0` = checked and not reported for that day/place. |
| `label_type` | yes | `reported_positive`, `dry_day_negative`, or `heavy_rain_no_report_negative`. |
| `source` | yes | News URL, GHMC / HYDRAA / TGSDMA notice URL, or a citation that includes a year. |
| `notes` | optional | Free text. Never put personal data here. |

## What counts as a positive

A **positive** is a dated, sourced report that waterlogging / inundation / traffic blockage from water occurred at a specific Hyderabad location on that day.

Accepted evidence:

- News article URL that names the place and day
- GHMC, HYDRAA, or TGSDMA public notice / bulletin URL
- A written citation with a year when no stable URL exists (validator requires a year and enough words)

Not accepted:

- Open-Meteo / ERA5 / rainfall-archive totals alone
- “It looks wet on the map”
- Guessed coordinates outside Greater Hyderabad
- Undated social posts without a citable day

## Negatives

Only mark `label=0` when an officer or researcher **checked** that day/place and found no report (or a dry-day check). Do not mass-generate negatives from rainfall alone. Uncertain days stay blank seeds or are omitted.

## Training gate

Before `scripts/train_model.py` will train:

- at least **30** valid positives
- across at least **3** distinct `event_id` values
- zero rejected non-seed rows

Check progress with:

```bash
python scripts/validate_labels.py
```
