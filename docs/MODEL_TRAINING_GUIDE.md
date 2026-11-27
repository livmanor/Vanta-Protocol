# Vanta Protocol — Model Training & Validation Guide

## 1. Scientific Principles & Honesty Standard

> [!IMPORTANT]
> **No Fake Negatives or Synthetic ML:**
> A binary classifier cannot be mathematically or ethically trained without verified negative labels (non-flood observations during rainfall events). Unreported locations, absence of news, or lack of citizen tweets cannot be treated as verified negatives.

When data contains only positive labels, the system **honestly refuses** to fit a supervised machine learning model. Instead, it operates on a transparent rule-based heuristic and logs an honest audit trail.

---

## 2. Current Label Status (Audit Facts)

- **Dataset Path:** [`data/hyderabad_events.csv`](file:///d:/Hackathons/Hackathons/Vanta-Protocol/venda/data/hyderabad_events.csv)
- **Total Rows:** 38 (6 template seeds + 32 real historical flood points)
- **Positive Labels (`label=1`):** 32
- **Negative Labels (`label=0`):** **0**
- **Distinct Rainfall Events:** 5
- **Outcome:** **Training Refused.** Logistic Regression, Random Forest, and XGBoost cannot compute class boundaries with $y \in \{1\}$ only. In previous training attempts, `StratifiedGroupKFold` raised:
  ```
  ValueError: training fold has a single class (1)
  ```

---

## 3. Label Schema & Validation Gate

All training data is strictly validated against `scripts/label_schema.py`:

```python
from scripts.label_schema import read_rows, training_gate, validate_row

rows, seeds = read_rows("data/hyderabad_events.csv")
gate_report = training_gate(rows)
```

### Validation Requirements:
1. **Both Classes Required:** $\ge 10$ verified negatives and $\ge 10$ verified positives.
2. **Distinct Events:** At least 2 distinct meteorologically independent events per class.
3. **Bounding Box Check:** All coordinates must fall within the GHMC administrative bounding box ($17.15^\circ\text{N} \le \text{lat} \le 17.50^\circ\text{N}$, $78.30^\circ\text{E} \le \text{lon} \le 78.57^\circ\text{E}$). Chennai or outside points are rejected.
4. **Valid Provenance:** Valid `event_id`, historical date, and verified citation `source` (e.g. municipal report, press release with URL). Rainfall products cannot be cited as ground-truth proof of ground flooding.
5. **Exclusion of Uncertain Rows:** Labels with `uncertain=True` or `observation_confidence < 0.5` are rejected from training.

---

## 4. How to Generate & Verify Negatives

Humans or field officers must verify locations that received $\ge 50\text{ mm}$ of rainfall during an event but experienced **zero standing waterlogging or inundation**:

1. Run candidate negative generator:
   ```bash
   python scripts/propose_negative_candidates.py --event-id hyd-oct2020-01 --min-rain 50
   ```
2. Ground-truth check by local police beat officers or municipal ward engineers.
3. Append verified negatives to `data/hyderabad_events.csv` using the schema:
   ```csv
   event_id,date,lat,lon,label_type,label,source,source_url,observation_confidence
   hyd-oct2020-01,2020-10-14,17.4421,78.3812,flood,0,Ward Engineer Ground Report,https://ghmc.gov.in/reports/ward42,1.0
   ```

---

## 5. Training Pipeline Execution

Once $\ge 10$ verified negatives across $\ge 2$ events are present:

```bash
python scripts/train_model.py --data data/hyderabad_events.csv --out models/flood/
```

### Required Training & Evaluation Pipeline:
1. **Cross-Validation:** `StratifiedGroupKFold(n_splits=5)` grouped strictly by `event_id` to prevent spatial-temporal leakage across events.
2. **Baselines:**
   - Heuristic rule-based baseline (current engine)
   - L2-regularized Logistic Regression baseline
   - Random Forest & XGBoost classifiers (with calibrated Platt scaling / isotonic regression)
3. **Mandatory Reporting Metrics:**
   - Precision, Recall, $F_1$-score
   - Precision-Recall AUC (PR-AUC)
   - Receiver Operating Characteristic AUC (ROC-AUC)
   - Brier Score (calibration quality)
   - Expected Calibration Error (ECE)
   - Confusion Matrix
4. **Model Gating:** The model is saved to `models/flood/` only if PR-AUC exceeds the rule-based baseline on the holdout fold.

---

## 6. Next-Day Rainfall Forecaster (Independent of Flood Classification)

While the binary **flood** classifier remains gated on $\ge 10$ verified non-flood negatives, Vanta includes a separate **next-day rainfall forecaster** (`scripts/train_rainfall_forecaster.py`, served via `backend/services/ml_model.py` and `GET /api/predict/rain`).

### 6.1 What it predicts

Next-day daily precipitation (`rain_next_mm`, via `GradientBoostingRegressor` on `log1p(mm)`) and the probability of heavy rain $\ge 15.6\text{ mm/day}$ (`p_heavy`, via `GradientBoostingClassifier`).  
**It does NOT predict flooding, waterlogging, or any other hazard.** Earthquakes also remain observation-only.

### 6.2 Data and training setup

| Item | Value |
|:--|:--|
| Source (primary) | `archive-api.open-meteo.com/v1/archive` (ERA5 reanalysis) |
| Source (attempted) | `historical-forecast-api.open-meteo.com` → HTTP 400 for 2015 start; works from 2022 onward in 1-year chunks |
| Location | Hyderabad, India — lat `17.385`, lon `78.4867` |
| Raw date range | `2015-01-01` → `2026-11-22` (4,344 days) |
| After lag engineering | 4,313 rows |
| Train split | `< 2024-01-01` → 3,257 days, 127 heavy days |
| Test split | `≥ 2024-01-01` → 1,056 days, 38 heavy days |
| Heavy-rain threshold | `HEAVY_MM = 15.6 mm/day` |
| Target leakage prevention | All lag features use `shift(1)`; target is tomorrow's value via `shift(-1)` |

> [!IMPORTANT]
> The saved `model.joblib` is **refit on all available data** after the test-set evaluation passes the gate. The metrics in `metrics.json` (and reported below) come from the **pre-2024 model only** (`"test_metrics_source": "pre_2024_model_only"`, `"refit_on_all_data": true`). Never report refit-model performance as test performance.

### 6.3 Test-set metrics vs. baselines

All metrics are computed on the **2024-01-01 onward** test split using the model trained exclusively on data before 2024-01-01.

#### Regression (next-day mm)

| Metric | Model | Persistence baseline | Climatology baseline |
|:--|:--|:--|:--|
| MAE (all days) | **1.921 mm** ✓ | 2.790 mm | 2.593 mm |
| MAE (heavy-rain days only, ≥ 15.6 mm) | 19.325 mm ✗ | — | 18.914 mm |

> [!NOTE]
> Heavy-day MAE being slightly worse than climatology is **expected and honest**: the classifier identifies the event, but the regressor under-estimates peak rainfall amounts on the heaviest individual days. Average MAE (all days) hides this, so both are reported.

#### Classification (heavy-rain flag)

| Metric | Model | Climatology baseline |
|:--|:--|:--|
| PR-AUC | **0.1389** (95% CI: 0.079–0.230) | 0.0595 |
| Brier score | **0.0351** | 0.0368 |
| ROC-AUC | **0.8376** (95% CI: 0.774–0.906) | — |

The 95% CI lower bound for PR-AUC (0.079) exceeds climatology (0.060), so the model's advantage is statistically meaningful even with only 38 heavy-rain days. CIs are computed with 1000 month-block bootstrap resamples.

#### Threshold table (classifier, test set)

| Threshold | Precision | Recall | F1 | Warnings | TP | FP | Missed |
|:--|:--|:--|:--|:--|:--|:--|:--|
| 0.05 | 0.134 | 0.474 | 0.209 | 134 | 18 | 116 | 20 |
| 0.10 | 0.192 | 0.368 | 0.252 | 73 | 14 | 59 | 24 |
| 0.20 | 0.282 | 0.289 | 0.286 | 38 | 11 | 27 | 27 |
| 0.30 | 0.333 | 0.132 | 0.189 | 15 | 5 | 10 | 33 |
| 0.50 | 0.333 | 0.053 | 0.091 | 6 | 2 | 4 | 36 |

Threshold 0.20 gives the best F1 (0.286) on this test set; threshold 0.10 gives the best recall (0.368, misses 24/38 events) with manageable false alarms.

#### 5-fold expanding-window time-series cross-validation (full history)

| Metric | Mean | Std |
|:--|:--|:--|
| MAE | 2.020 mm | ± 0.386 |
| PR-AUC | 0.186 | ± 0.067 |
| ROC-AUC | 0.849 | ± 0.021 |

CV results are stable (ROC-AUC std ≈ 0.02), suggesting the 2024+ test result is not an outlier.

### 6.4 Saving gate

The model is saved **only if** all three conditions are met on the test set:
1. Model MAE < persistence MAE (2.790 mm)  
2. Model MAE < climatology MAE (2.593 mm)  
3. Model PR-AUC > climatology PR-AUC (0.0595)

Otherwise the script prints `"did NOT beat baselines"` and writes nothing.

### 6.5 10 mm threshold variant (experiment — not production)

A second run with `HEAVY_MM = 10.0` was evaluated but **not saved** to production. It has more positive labels (84 heavy days in test vs. 38), which makes PR-AUC CIs narrower and all threshold metrics more reliable. It is not directly comparable to the 15.6 mm model because the target definition differs. Switch only on explicit request.

| Metric | 15.6 mm model (production) | 10.0 mm variant |
|:--|:--|:--|
| Test heavy days | 38 | 84 |
| PR-AUC | 0.1389 (CI: 0.079–0.230) | 0.2943 (CI: 0.205–0.393) |
| ROC-AUC | 0.8376 | 0.8485 |
| Heavy-day MAE | 19.325 mm | 13.209 mm |
| Clim heavy-day MAE | 18.914 mm | 12.624 mm |

### 6.6 Known limitations and train/serve mismatch

| Issue | Detail |
|:--|:--|
| Source mismatch | Training uses ERA5 archive; live inference uses `api.open-meteo.com/v1/forecast` for recent days |
| `precipitation_probability_max` | NaN in archive API (filled as 0.0 during training), populated (~25% mean) in live forecast API — the only significant feature mismatch identified by `scripts/check_train_serve_consistency.py` |
| Heavy-day regression | Regressor under-estimates peak amounts on the heaviest days (heavy-day MAE > climatology) |
| Spatial resolution | Daily grid totals; localized sub-daily urban cloudbursts are not resolvable |
| `historical-forecast-api` | Only available from ~2022 onward; using it alone gives worse metrics (less training history) |

> [!WARNING]
> `precipitation_probability_max` is a known train/serve mismatch. To eliminate it, either remove the feature from `FEATURES` in `train_rainfall_forecaster.py` or accept the 0.0 baseline during training. Do **not** change this silently — it alters the model; get explicit approval first.

### 6.7 Commands

```bash
# Retrain (saves model only if gate passes)
python scripts/train_rainfall_forecaster.py

# Evaluate without touching the saved model (leak-free)
python -m scripts.evaluate_rainfall

# Fill actual rainfall into the forecast log and print held-out MAE (once ≥14 days available)
python scripts/fill_actuals.py

# Check train/serve feature consistency
python scripts/check_train_serve_consistency.py
```

### 6.8 API endpoints

| Endpoint | Description |
|:--|:--|
| `GET /api/predict/rain` | Live next-day forecast: `rain_next_mm`, `p_heavy`, `for_date`, Open-Meteo's own forecast, model metadata (`trained_at`, `data_start`, `data_end`, `data_source`, `test_roc_auc`). Cached ~1 hour. |
| `GET /api/predict/rain/scorecard` | Comparison vs. Open-Meteo forecast; requires ≥ 30 logged days. Returns "insufficient data" until enough rows are in `rain_forecast_log`. |

### 6.9 Forecast log and actuals tracking

Each call to `predict_live()` inserts or updates one row in the SQLite `rain_forecast_log` table (columns: `for_date`, `created_at`, `ml_rain_mm`, `ml_p_heavy`, `open_meteo_rain_mm`, `open_meteo_precip_prob_pct`, `actual_rain_mm`, `actual_filled_at`). Run `scripts/fill_actuals.py` daily (or via cron) to back-fill `actual_rain_mm` from Open-Meteo archive once a day's observations are finalized.

### 6.10 UI

The AI Briefing panel displays:
- An **ML forecast pill**: "ML model v`{version}`, trained `{date}`, 2024+ test ROC-AUC `{value}`" alongside the predicted mm and heavy-rain %.
- An **Open-Meteo pill**: Open-Meteo's own forecast for the same date, so both are visible side-by-side.
- A **Live / Replay** segmented button: Live polls every 5 minutes (visibility-aware); Replay steps one day every 3 seconds with play/pause and an AbortController for clean cancellation.
