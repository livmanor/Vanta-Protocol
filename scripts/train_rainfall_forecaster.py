"""Hyderabad next-day rainfall forecaster — training script.

What it predicts
----------------
Next-day rainfall in mm (regression) and whether that day will be "heavy"
rain (classification, threshold = HEAVY_MM).  It does NOT predict flooding.

Data source
-----------
Open-Meteo historical-forecast-api.open-meteo.com (ERA5-based, same
reanalysis product as the live forecast API).  Falls back to
archive-api.open-meteo.com if the first endpoint fails.

Usage
-----
    python scripts/train_rainfall_forecaster.py

Outputs (only when model beats both baselines)
----------------------------------------------
    models/rainfall/model.joblib   — full bundle
    models/rainfall/metrics.json   — test metrics
"""
from __future__ import annotations

import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# ---------------------------------------------------------------------------
# Config — shared with ml_model.py for inference
# ---------------------------------------------------------------------------
LAT: float = 17.385
LON: float = 78.4867

HEAVY_MM: float = 15.6          # heavy-rain threshold (mm/day)

TEST_START = date(2024, 1, 1)   # fixed test window — never change this
TRAIN_DATA_START = date(2015, 1, 1)

MODEL_DIR = ROOT / "models" / "rainfall"

# Daily fields we pull from Open-Meteo
DAILY: list[str] = [
    "precipitation_sum",
    "rain_sum",
    "precipitation_hours",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
]


# ---------------------------------------------------------------------------
# Feature engineering — called identically from training and inference
# ---------------------------------------------------------------------------

def build(d: pd.DataFrame, *, for_inference: bool = False) -> pd.DataFrame:
    """Add lag / rolling features and return rows with complete history.

    Parameters
    ----------
    d             : DataFrame indexed by date, containing at least
                    ``precipitation_sum``.
    for_inference : When True, omit the target columns (they are unknowable
                    for future days) and only require lag features to be
                    non-null.  When False (training), also require the target.

    No future data leaks in: all rolling windows use ``shift(1)`` so they
    look at yesterday-and-older only.
    """
    x = d.copy()
    p = x["precipitation_sum"]

    # ---- rainfall lags & rolling sums (all shifted 1 to avoid leakage) ----
    x["rain_1d"]  = p.shift(1)
    x["rain_3d"]  = p.shift(1).rolling(3,  min_periods=3).sum()
    x["rain_7d"]  = p.shift(1).rolling(7,  min_periods=7).sum()
    x["rain_14d"] = p.shift(1).rolling(14, min_periods=14).sum()
    x["rain_30d"] = p.shift(1).rolling(30, min_periods=30).sum()

    # ---- log-transforms of heavy-tailed features ----------------------------
    x["log1p_rain_1d"]  = np.log1p(x["rain_1d"].clip(lower=0))
    x["log1p_rain_7d"]  = np.log1p(x["rain_7d"].clip(lower=0))
    x["log1p_rain_30d"] = np.log1p(x["rain_30d"].clip(lower=0))

    # ---- wet streak (consecutive rain days, shifted so it's lag-safe) -------
    is_wet = (p.shift(1) >= 1.0).astype(float)
    streak, s = [], 0.0
    for w in is_wet:
        s = (s + 1.0) if w else 0.0
        streak.append(s)
    x["wet_streak"] = streak

    # ---- season signal -------------------------------------------------------
    x["month_sin"] = np.sin(2 * np.pi * x.index.month / 12)
    x["month_cos"] = np.cos(2 * np.pi * x.index.month / 12)
    x["doy_sin"]   = np.sin(2 * np.pi * x.index.dayofyear / 365)
    x["doy_cos"]   = np.cos(2 * np.pi * x.index.dayofyear / 365)

    # ---- temperature range ---------------------------------------------------
    if "temperature_2m_max" in x.columns and "temperature_2m_min" in x.columns:
        x["temp_range"] = x["temperature_2m_max"] - x["temperature_2m_min"]
    else:
        x["temp_range"] = np.nan

    # ---- pass-through meteo (may be NaN if API column missing) --------------
    for col in [
        "precipitation_hours",
        "precipitation_probability_max",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "temperature_2m_max",
        "temperature_2m_min",
        "apparent_temperature_max",
    ]:
        if col not in x.columns:
            x[col] = np.nan

    if for_inference:
        return x.dropna(subset=["rain_30d"])

    # ---- supervised target (next-day precipitation) -------------------------
    x["rain_next_mm"] = p.shift(-1)
    x["heavy_next"]   = (x["rain_next_mm"] >= HEAVY_MM).astype(float)
    x.loc[x["rain_next_mm"].isna(), "heavy_next"] = np.nan

    return x.dropna(subset=["rain_next_mm", "rain_30d"])


# Feature list (must be identical between train and serve)
FEATURES: list[str] = [
    "rain_1d", "rain_3d", "rain_7d", "rain_14d", "rain_30d",
    "log1p_rain_1d", "log1p_rain_7d", "log1p_rain_30d",
    "wet_streak",
    "month_sin", "month_cos", "doy_sin", "doy_cos",
    "temp_range",
    "precipitation_hours",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
]


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------

def _fetch(start: date, end: date) -> tuple[pd.DataFrame, str]:
    """Fetch daily data from Open-Meteo. Returns (df, source_url)."""
    daily_param = ",".join(DAILY)
    endpoints = [
        "https://historical-forecast-api.open-meteo.com/v1/forecast",
        "https://archive-api.open-meteo.com/v1/archive",
    ]
    last_exc = None
    for url in endpoints:
        for attempt in range(3):
            try:
                with httpx.Client(timeout=90.0, follow_redirects=True) as c:
                    r = c.get(url, params={
                        "latitude":   LAT,
                        "longitude":  LON,
                        "start_date": start.isoformat(),
                        "end_date":   end.isoformat(),
                        "daily":      daily_param,
                        "timezone":   "Asia/Kolkata",
                    })
                    r.raise_for_status()
                    payload = r.json()
                    if isinstance(payload, list):
                        payload = payload[0]
                daily = payload.get("daily", {})
                if not daily.get("time"):
                    raise ValueError("API returned empty daily block.")
                df = pd.DataFrame(daily).rename(columns={"time": "date"})
                df["date"] = pd.to_datetime(df["date"])
                df = df.set_index("date").sort_index()
                return df, url
            except Exception as exc:
                last_exc = exc
                wait = 2 ** attempt
                print(f"  Attempt {attempt+1} on {url} failed: {exc}. Waiting {wait}s …")
                time.sleep(wait)
    raise RuntimeError(
        f"All endpoints failed. Last error: {last_exc}\n"
        "Network may be blocked — not faking data."
    )


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------

def _persistence_mae(test_df: pd.DataFrame) -> float:
    """Tomorrow = today (rain_1d is yesterday's rain, which is today's lag).
    For persistence we predict rain_next_mm = rain_1d (the most-recent known).
    """
    mask = test_df["rain_1d"].notna() & test_df["rain_next_mm"].notna()
    return float(np.mean(np.abs(test_df.loc[mask, "rain_next_mm"].values
                                - test_df.loc[mask, "rain_1d"].values)))


def _climatology_per_doy(train_df: pd.DataFrame, test_df: pd.DataFrame) -> np.ndarray:
    """Day-of-year climatology: mean rain per calendar day computed on training data."""
    doy_mean = (
        train_df.groupby(train_df.index.dayofyear)["rain_next_mm"].mean()
    )
    test_doys = test_df.index.dayofyear
    return np.array([doy_mean.get(d, doy_mean.mean()) for d in test_doys])


def _brier(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    return float(np.mean((y_prob - y_true) ** 2))


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(heavy_mm: float = HEAVY_MM) -> int:
    from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
    from sklearn.metrics import (
        average_precision_score, mean_absolute_error, roc_auc_score
    )

    train_end = date.today() - timedelta(days=5)   # ERA5 lags ~5 days

    print("=" * 60)
    print(f"Fetching Open-Meteo daily data for Hyderabad ({LAT}, {LON})")
    print(f"Period requested: {TRAIN_DATA_START} → {train_end}")
    raw, source_url = _fetch(TRAIN_DATA_START, train_end)

    actual_start = raw.index[0].date()
    actual_end   = raw.index[-1].date()
    print(f"Source: {source_url}")
    print(f"Date range received: {actual_start} → {actual_end}  ({len(raw)} rows)")

    print("\nBuilding features …")
    df = build(raw)
    print(f"Rows after feature engineering: {len(df)}")

    # Ensure all feature cols exist (fill missing API columns with 0)
    for col in FEATURES:
        if col not in df.columns:
            print(f"  Warning: feature '{col}' missing from API response — filling 0")
            df[col] = 0.0

    # ---- Train / test split -------------------------------------------------
    split_ts = pd.Timestamp(TEST_START)
    train_df = df[df.index < split_ts]
    test_df  = df[df.index >= split_ts]

    if len(train_df) < 100:
        print(f"ERROR: only {len(train_df)} training rows. Need at least 100.")
        return 1
    if len(test_df) < 30:
        print(f"ERROR: only {len(test_df)} test rows. Need at least 30.")
        return 1

    X_tr = train_df[FEATURES].fillna(0.0)
    X_te = test_df[FEATURES].fillna(0.0)
    yr_tr = np.log1p(train_df["rain_next_mm"].clip(lower=0))
    yr_te = np.log1p(test_df["rain_next_mm"].clip(lower=0))

    # Heavy-rain labels for classifier (may have fewer rows if some NaN)
    cls_mask_tr = train_df["heavy_next"].notna()
    cls_mask_te = test_df["heavy_next"].notna()
    Xc_tr = X_tr.loc[cls_mask_tr]
    yc_tr = train_df.loc[cls_mask_tr, "heavy_next"]
    Xc_te = X_te.loc[cls_mask_te]
    yc_te = test_df.loc[cls_mask_te, "heavy_next"]

    pos_tr = int(yc_tr.sum())
    neg_tr = int((yc_tr == 0).sum())
    pos_te = int(yc_te.sum())
    neg_te = int((yc_te == 0).sum())
    print(f"\nHeavy-rain days (≥ {heavy_mm} mm):")
    print(f"  Train: {pos_tr} heavy / {neg_tr} not-heavy  ({len(X_tr)} total train days)")
    print(f"  Test:  {pos_te} heavy / {neg_te} not-heavy  ({len(X_te)} total test days)")

    if pos_tr < 5:
        print(f"ERROR: only {pos_tr} heavy-rain training days. Cannot train a meaningful classifier.")
        return 1

    # ---- Baselines ----------------------------------------------------------
    pct_mae = _persistence_mae(test_df)
    clim_pred = _climatology_per_doy(train_df, test_df)
    clim_mae = float(mean_absolute_error(test_df["rain_next_mm"], clim_pred))

    # Climatology heavy-rain probability = fraction of heavy days per DOY in train
    doy_pheavy = (
        train_df.groupby(train_df.index.dayofyear)["heavy_next"]
        .mean()
        .fillna(0.0)
    )
    overall_pheavy = float(yc_tr.mean())
    clim_prob_te = np.array([
        doy_pheavy.get(d, overall_pheavy)
        for d in test_df.loc[cls_mask_te].index.dayofyear
    ])
    clim_brier  = _brier(yc_te.values, clim_prob_te)
    clim_prauc  = average_precision_score(yc_te, clim_prob_te) if pos_te > 0 else float("nan")

    print(f"\nBaselines (test set {TEST_START} onward):")
    print(f"  Persistence MAE : {pct_mae:.3f} mm")
    print(f"  Climatology MAE : {clim_mae:.3f} mm")
    print(f"  Climatology Brier: {clim_brier:.4f}")
    print(f"  Climatology PR-AUC: {clim_prauc:.4f}" if not np.isnan(clim_prauc) else "  Climatology PR-AUC: n/a")

    # ---- Regressor ----------------------------------------------------------
    print(f"\nTraining regressor on {len(X_tr)} days …")
    reg = GradientBoostingRegressor(
        n_estimators=400, max_depth=4, learning_rate=0.04,
        subsample=0.8, min_samples_leaf=10, random_state=42
    )
    reg.fit(X_tr, yr_tr)
    pred_mm = np.expm1(reg.predict(X_te)).clip(min=0)
    model_mae = float(mean_absolute_error(test_df["rain_next_mm"], pred_mm))

    # ---- Classifier ----------------------------------------------------------
    print(f"Training classifier on {len(Xc_tr)} days …")
    cls = GradientBoostingClassifier(
        n_estimators=400, max_depth=4, learning_rate=0.04,
        subsample=0.8, min_samples_leaf=10, random_state=42
    )
    cls.fit(Xc_tr, yc_tr)
    prob_te = cls.predict_proba(Xc_te)[:, 1]
    model_brier = _brier(yc_te.values, prob_te)
    model_prauc = average_precision_score(yc_te, prob_te) if pos_te > 0 else float("nan")
    model_rocauc = roc_auc_score(yc_te, prob_te) if len(yc_te.unique()) > 1 else float("nan")

    # ---- Print metrics ------------------------------------------------------
    print("\n" + "=" * 60)
    print("TEST SET METRICS")
    print(f"  Model MAE         : {model_mae:.3f} mm")
    print(f"  Persistence MAE   : {pct_mae:.3f} mm   {'✓ model better' if model_mae < pct_mae else '✗ model worse'}")
    print(f"  Climatology MAE   : {clim_mae:.3f} mm  {'✓ model better' if model_mae < clim_mae else '✗ model worse'}")
    print(f"  Model PR-AUC      : {model_prauc:.4f}" if not np.isnan(model_prauc) else "  Model PR-AUC      : n/a")
    print(f"  Climatology PR-AUC: {clim_prauc:.4f}" if not np.isnan(clim_prauc) else "  Climatology PR-AUC: n/a")
    print(f"  Model Brier       : {model_brier:.4f}  {'✓ model better' if model_brier < clim_brier else '✗ model worse'}")
    print(f"  Climatology Brier : {clim_brier:.4f}")
    print(f"  Model ROC-AUC     : {model_rocauc:.4f}" if not np.isnan(model_rocauc) else "  Model ROC-AUC     : n/a")
    print("=" * 60)

    # ---- Baseline check -----------------------------------------------------
    beats_persistence = model_mae < pct_mae
    beats_climatology = model_mae < clim_mae

    if not (beats_persistence and beats_climatology):
        print("\ndid NOT beat baselines — model NOT saved.")
        print(f"  Beats persistence ({pct_mae:.3f} mm): {beats_persistence}")
        print(f"  Beats climatology ({clim_mae:.3f} mm): {beats_climatology}")
        return 2    # special exit code: ran fine, failed baselines

    print("\nModel beats both baselines — saving …")

    # ---- Save ---------------------------------------------------------------
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    metrics = {
        "model_mae_mm":        round(model_mae, 4),
        "persistence_mae_mm":  round(pct_mae, 4),
        "climatology_mae_mm":  round(clim_mae, 4),
        "model_pr_auc":        round(model_prauc, 4) if not np.isnan(model_prauc) else None,
        "climatology_pr_auc":  round(clim_prauc, 4) if not np.isnan(clim_prauc) else None,
        "model_brier":         round(model_brier, 4),
        "climatology_brier":   round(clim_brier, 4),
        "model_roc_auc":       round(model_rocauc, 4) if not np.isnan(model_rocauc) else None,
        "test_start":          TEST_START.isoformat(),
        "train_heavy_days":    pos_tr,
        "train_not_heavy_days":neg_tr,
        "test_heavy_days":     pos_te,
        "test_not_heavy_days": neg_te,
        "heavy_mm":            heavy_mm,
        "train_rows":          len(X_tr),
        "test_rows":           len(X_te),
        "data_source":         source_url,
        "actual_data_start":   str(actual_start),
        "actual_data_end":     str(actual_end),
    }

    bundle = {
        "regressor":    reg,
        "classifier":   cls,
        "features":     FEATURES,
        "heavy_mm":     heavy_mm,
        "version":      date.today().isoformat(),
        "trained_at":   datetime.now(timezone.utc).isoformat(),
        "metrics":      metrics,
        "location":     {"lat": LAT, "lon": LON, "city": "Hyderabad"},
    }

    joblib.dump(bundle, MODEL_DIR / "model.joblib")
    (MODEL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved → {MODEL_DIR / 'model.joblib'}")
    print(f"Saved → {MODEL_DIR / 'metrics.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(train())
