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

- **What it predicts:** Next-day daily precipitation (`rain_next_mm`, via `GradientBoostingRegressor` on `log1p(mm)`) and the probability of heavy rain $\ge 15.6\text{ mm/day}$ (`p_heavy`, via `GradientBoostingClassifier`). **It does NOT predict flooding or waterlogging.** Earthquakes also remain observation-only.
- **Training data & period:** Real daily weather from Open-Meteo ERA5 archive (`https://archive-api.open-meteo.com/v1/archive`, fallback from `historical-forecast-api.open-meteo.com`) for Hyderabad (`17.385, 78.4867`), covering `2015-01-01` to `2026-11-22` (4,344 raw days; 4,313 rows after lag feature engineering).
- **Time-based split:** Train on data before `2024-01-01` (3,257 days; 127 heavy days), test on `2024-01-01` onward (1,056 days; 38 heavy days). Lag features use `shift(1)` so no future data leaks.
- **Test metrics vs. baselines:**
  - **MAE:** `1.921 mm` (model) vs. `2.790 mm` (persistence) and `2.593 mm` (day-of-year climatology)
  - **Heavy-rain PR-AUC:** `0.1389` (model) vs. `0.0595` (climatology)
  - **Heavy-rain Brier score:** `0.0351` (model) vs. `0.0368` (climatology)
  - **Heavy-rain ROC-AUC:** `0.8376`
- **Limitations:** Trained on ERA5 reanalysis (`archive-api.open-meteo.com`) because `historical-forecast-api.open-meteo.com` rejected the full 2015–2026 range (HTTP 400), whereas live inference fetches recent days from `api.open-meteo.com/v1/forecast`—so minor train/serve source differences apply. Daily grid totals also under-detect localized short urban cloudbursts.
- **Retrain command:**
  ```bash
  python scripts/train_rainfall_forecaster.py
  ```
  The bundle (`models/rainfall/model.joblib`) and `models/rainfall/metrics.json` are written only if the model beats both persistence and climatology MAE on the test set.
