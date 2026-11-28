"""Hyderabad next-day rainfall forecaster — training and honest evaluation.

What it predicts
----------------
Next-day rainfall in mm (regression on log1p) and whether that day will be
"heavy" rain (classification, threshold = HEAVY_MM). It does NOT predict
flooding or waterlogging.

Data source
-----------
Open-Meteo historical-forecast-api.open-meteo.com first, falling back to
Open-Meteo archive data (archive-api.open-meteo.com).

Usage
-----
    python scripts/train_rainfall_forecaster.py

Outputs (only when model beats persistence MAE, climatology MAE, AND climatology PR-AUC)
-----------------------------------------------------------------------------------------
    models/rainfall/model.joblib   — full bundle (refit on all data after pre-2024 eval)
    models/rainfall/metrics.json   — held-out pre-2024->2024+ test metrics & diagnostics
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
THRESHOLDS: list[float] = [0.05, 0.1, 0.2, 0.3, 0.5]

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

def build(d: pd.DataFrame, *, for_inference: bool = False, heavy_mm: float = HEAVY_MM) -> pd.DataFrame:
    """Add lag / rolling features and return rows with complete history.

    No future data leaks in: all rolling windows use ``shift(1)`` so they
    look at yesterday-and-older only.
    """
    x = d.copy()
    p = x["precipitation_sum"]

    # ---- rainfall lags & rolling sums ----
    # rain_0d is the most recent observed day (day t). The target is day t+1,
    # so day t is known at prediction time and is the strongest short-term signal.
    # (Earlier versions shifted every feature by 1 and silently dropped it.)
    x["rain_0d"]  = p
    x["log1p_rain_0d"] = np.log1p(p.clip(lower=0))
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
    x["heavy_next"]   = (x["rain_next_mm"] >= heavy_mm).astype(float)
    x.loc[x["rain_next_mm"].isna(), "heavy_next"] = np.nan

    return x.dropna(subset=["rain_next_mm", "rain_30d"])


FEATURES: list[str] = [
    "rain_0d", "log1p_rain_0d",
    "rain_1d", "rain_3d", "rain_7d", "rain_14d", "rain_30d",
    "log1p_rain_1d", "log1p_rain_7d", "log1p_rain_30d",
    "wet_streak",
    "month_sin", "month_cos", "doy_sin", "doy_cos",
    "temp_range",
    "precipitation_hours",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
]


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------

def _fetch(start: date, end: date) -> tuple[pd.DataFrame, str, str]:
    """Fetch daily data from Open-Meteo. Returns (df, source_url, data_source_label)."""
    daily_param = ",".join(DAILY)
    endpoints = [
        ("https://historical-forecast-api.open-meteo.com/v1/forecast", "historical-forecast"),
        ("https://archive-api.open-meteo.com/v1/archive", "archive"),
    ]
    last_exc = None
    for url, label in endpoints:
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
                return df, url, label
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
# Baselines & evaluation helpers
# ---------------------------------------------------------------------------

def _make_models():
    from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
    reg = GradientBoostingRegressor(
        n_estimators=400, max_depth=4, learning_rate=0.04,
        subsample=0.8, min_samples_leaf=10, random_state=42
    )
    cls = GradientBoostingClassifier(
        n_estimators=400, max_depth=4, learning_rate=0.04,
        subsample=0.8, min_samples_leaf=10, random_state=42
    )
    return reg, cls


def _persistence_mae(test_df: pd.DataFrame) -> float:
    # True persistence: tomorrow's rain = today's rain (rain_0d), not the day before.
    mask = test_df["rain_0d"].notna() & test_df["rain_next_mm"].notna()
    return float(np.mean(np.abs(test_df.loc[mask, "rain_next_mm"].values
                                - test_df.loc[mask, "rain_0d"].values)))


def _climatology_per_doy(train_df: pd.DataFrame, test_df: pd.DataFrame) -> np.ndarray:
    doy_mean = train_df.groupby(train_df.index.dayofyear)["rain_next_mm"].mean()
    return np.array([doy_mean.get(d, doy_mean.mean()) for d in test_df.index.dayofyear])


def _brier(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    return float(np.mean((y_prob - y_true) ** 2))


def _threshold_table(y_true: np.ndarray, y_prob: np.ndarray, thresholds: list[float]) -> list[dict]:
    from sklearn.metrics import precision_recall_fscore_support

    rows = []
    for th in thresholds:
        y_pred = (y_prob >= th).astype(int)
        prec, rec, f1, _ = precision_recall_fscore_support(
            y_true, y_pred, pos_label=1, average="binary", zero_division=0
        )
        tp = int(((y_pred == 1) & (y_true == 1)).sum())
        fp = int(((y_pred == 1) & (y_true == 0)).sum())
        fn = int(((y_pred == 0) & (y_true == 1)).sum())
        rows.append({
            "threshold": th,
            "precision": round(float(prec), 4),
            "recall": round(float(rec), 4),
            "f1": round(float(f1), 4),
            "warnings_issued": int(y_pred.sum()),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        })
    return rows


def _block_bootstrap_ci(
    dates: pd.DatetimeIndex,
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_resamples: int = 1000,
    seed: int = 42,
) -> dict:
    """1000-resample 95% CI by month blocks for PR-AUC and ROC-AUC."""
    from sklearn.metrics import average_precision_score, roc_auc_score

    rng = np.random.default_rng(seed)
    month_periods = dates.to_period("M")
    unique_months = month_periods.unique()
    month_indices = [np.where(month_periods == m)[0] for m in unique_months]
    n_months = len(month_indices)

    pr_scores: list[float] = []
    roc_scores: list[float] = []

    for _ in range(n_resamples):
        chosen = rng.integers(0, n_months, size=n_months)
        idx = np.concatenate([month_indices[i] for i in chosen])
        yb = y_true[idx]
        pb = y_prob[idx]
        if yb.sum() == 0 or len(np.unique(yb)) < 2:
            continue
        pr_scores.append(float(average_precision_score(yb, pb)))
        roc_scores.append(float(roc_auc_score(yb, pb)))

    def _ci(vals: list[float]) -> list[float] | None:
        if len(vals) < 10:
            return None
        lo, hi = np.percentile(vals, [2.5, 97.5])
        return [round(float(lo), 4), round(float(hi), 4)]

    return {
        "n_resamples": n_resamples,
        "valid_resamples": len(pr_scores),
        "pr_auc_ci95": _ci(pr_scores),
        "roc_auc_ci95": _ci(roc_scores),
    }


def _expanding_cv(df: pd.DataFrame, n_splits: int = 5) -> dict:
    """5-fold expanding-window TimeSeriesSplit CV on the full history."""
    from sklearn.metrics import average_precision_score, mean_absolute_error, roc_auc_score
    from sklearn.model_selection import TimeSeriesSplit

    X = df[FEATURES].fillna(0.0).infer_objects(copy=False)
    yr = np.log1p(df["rain_next_mm"].clip(lower=0))
    yc = df["heavy_next"]

    tscv = TimeSeriesSplit(n_splits=n_splits)
    folds = []
    for fold_idx, (tr_idx, te_idx) in enumerate(tscv.split(X), start=1):
        X_tr, X_te = X.iloc[tr_idx], X.iloc[te_idx]
        yr_tr = yr.iloc[tr_idx]
        yc_tr, yc_te = yc.iloc[tr_idx], yc.iloc[te_idx]

        reg, cls = _make_models()
        reg.fit(X_tr, yr_tr)
        pred_mm = np.expm1(reg.predict(X_te)).clip(min=0)
        mae = float(mean_absolute_error(df["rain_next_mm"].iloc[te_idx], pred_mm))

        if yc_tr.sum() >= 2 and len(yc_te.unique()) > 1:
            cls.fit(X_tr, yc_tr)
            prob_te = cls.predict_proba(X_te)[:, 1]
            pr_auc = float(average_precision_score(yc_te, prob_te))
            roc_auc = float(roc_auc_score(yc_te, prob_te))
        else:
            pr_auc = float("nan")
            roc_auc = float("nan")

        folds.append({
            "fold": fold_idx,
            "train_end": str(df.index[tr_idx[-1]].date()),
            "test_start": str(df.index[te_idx[0]].date()),
            "test_end": str(df.index[te_idx[-1]].date()),
            "test_heavy_days": int(yc_te.sum()),
            "mae_mm": round(mae, 4),
            "pr_auc": round(pr_auc, 4) if not np.isnan(pr_auc) else None,
            "roc_auc": round(roc_auc, 4) if not np.isnan(roc_auc) else None,
        })

    maes = [f["mae_mm"] for f in folds]
    prs = [f["pr_auc"] for f in folds if f["pr_auc"] is not None]
    rocs = [f["roc_auc"] for f in folds if f["roc_auc"] is not None]

    return {
        "n_splits": n_splits,
        "folds": folds,
        "mae_mean": round(float(np.mean(maes)), 4),
        "mae_std": round(float(np.std(maes)), 4),
        "pr_auc_mean": round(float(np.mean(prs)), 4) if prs else None,
        "pr_auc_std": round(float(np.std(prs)), 4) if prs else None,
        "roc_auc_mean": round(float(np.mean(rocs)), 4) if rocs else None,
        "roc_auc_std": round(float(np.std(rocs)), 4) if rocs else None,
    }


def evaluate_and_optionally_save(
    *,
    heavy_mm: float = HEAVY_MM,
    save: bool = True,
    raw_df: pd.DataFrame | None = None,
    source_url: str | None = None,
    data_source_label: str | None = None,
) -> tuple[int, dict]:
    """Run honest pre-2024 -> 2024+ evaluation, CV, CI, and optionally save bundle."""
    from sklearn.metrics import average_precision_score, mean_absolute_error, roc_auc_score

    train_end = date.today() - timedelta(days=5)

    print("=" * 70)
    print(f"Rainfall Forecaster Evaluation (heavy threshold = {heavy_mm} mm)")
    if raw_df is None:
        print(f"Fetching Open-Meteo daily data for Hyderabad ({LAT}, {LON})")
        print(f"Period requested: {TRAIN_DATA_START} -> {train_end}")
        raw, source_url, data_source_label = _fetch(TRAIN_DATA_START, train_end)
    else:
        raw = raw_df

    actual_start = raw.index[0].date()
    actual_end   = raw.index[-1].date()
    print(f"Source: {source_url} ({data_source_label})")
    print(f"Date range received: {actual_start} -> {actual_end}  ({len(raw)} rows)")

    df = build(raw, heavy_mm=heavy_mm)
    print(f"Rows after feature engineering: {len(df)}")

    for col in FEATURES:
        if col not in df.columns:
            df[col] = 0.0

    split_ts = pd.Timestamp(TEST_START)
    train_df = df[df.index < split_ts]
    test_df  = df[df.index >= split_ts]

    if len(train_df) < 100 or len(test_df) < 30:
        print(f"ERROR: insufficient rows (train={len(train_df)}, test={len(test_df)}).")
        return 1, {}

    X_tr = train_df[FEATURES].fillna(0.0).infer_objects(copy=False)
    X_te = test_df[FEATURES].fillna(0.0).infer_objects(copy=False)
    yr_tr = np.log1p(train_df["rain_next_mm"].clip(lower=0))

    yc_tr = train_df["heavy_next"]
    yc_te = test_df["heavy_next"]

    pos_tr = int(yc_tr.sum())
    neg_tr = int((yc_tr == 0).sum())
    pos_te = int(yc_te.sum())
    neg_te = int((yc_te == 0).sum())
    print(f"\nHeavy-rain days (>= {heavy_mm} mm):")
    print(f"  Train (< {TEST_START}): {pos_tr} heavy / {neg_tr} not-heavy ({len(X_tr)} days)")
    print(f"  Test  (>= {TEST_START}): {pos_te} heavy / {neg_te} not-heavy ({len(X_te)} days)")

    if pos_tr < 5:
        print(f"ERROR: only {pos_tr} heavy-rain training days.")
        return 1, {}

    # ---- Baselines ----------------------------------------------------------
    pct_mae = _persistence_mae(test_df)
    clim_pred = _climatology_per_doy(train_df, test_df)
    clim_mae = float(mean_absolute_error(test_df["rain_next_mm"], clim_pred))

    doy_pheavy = train_df.groupby(train_df.index.dayofyear)["heavy_next"].mean().fillna(0.0)
    overall_pheavy = float(yc_tr.mean())
    clim_prob_te = np.array([doy_pheavy.get(d, overall_pheavy) for d in test_df.index.dayofyear])
    clim_brier = _brier(yc_te.values, clim_prob_te)
    clim_prauc = average_precision_score(yc_te, clim_prob_te) if pos_te > 0 else float("nan")

    # ---- Train pre-2024 model ONLY ------------------------------------------
    reg, cls = _make_models()
    reg.fit(X_tr, yr_tr)
    pred_mm = np.expm1(reg.predict(X_te)).clip(min=0)
    model_mae = float(mean_absolute_error(test_df["rain_next_mm"], pred_mm))

    # Heavy-rain days only MAE
    heavy_mask = yc_te.values == 1
    if heavy_mask.any():
        model_heavy_mae = float(mean_absolute_error(test_df["rain_next_mm"].values[heavy_mask], pred_mm[heavy_mask]))
        clim_heavy_mae = float(mean_absolute_error(test_df["rain_next_mm"].values[heavy_mask], clim_pred[heavy_mask]))
    else:
        model_heavy_mae = float("nan")
        clim_heavy_mae = float("nan")

    cls.fit(X_tr, yc_tr)
    prob_te = cls.predict_proba(X_te)[:, 1]
    model_brier = _brier(yc_te.values, prob_te)
    model_prauc = average_precision_score(yc_te, prob_te) if pos_te > 0 else float("nan")
    model_rocauc = roc_auc_score(yc_te, prob_te) if len(yc_te.unique()) > 1 else float("nan")

    # ---- Threshold table, Month-block Bootstrap CI, Expanding CV ------------
    th_table = _threshold_table(yc_te.values.astype(int), prob_te, THRESHOLDS)
    ci = _block_bootstrap_ci(test_df.index, yc_te.values.astype(int), prob_te, n_resamples=1000, seed=42)
    cv = _expanding_cv(df, n_splits=5)

    # ---- Print results ------------------------------------------------------
    print("\n" + "=" * 70)
    print(f"TEST SET METRICS (pre-2024 model evaluated on {TEST_START} onward)")
    print(f"  Model MAE             : {model_mae:.3f} mm")
    print(f"  Persistence MAE       : {pct_mae:.3f} mm   {'[BETTER]' if model_mae < pct_mae else '[WORSE]'}")
    print(f"  Climatology MAE       : {clim_mae:.3f} mm   {'[BETTER]' if model_mae < clim_mae else '[WORSE]'}")
    print(f"  Heavy-day Model MAE   : {model_heavy_mae:.3f} mm")
    print(f"  Heavy-day Clim. MAE   : {clim_heavy_mae:.3f} mm")
    print(f"  Model PR-AUC          : {model_prauc:.4f}  (95% month-block CI: {ci['pr_auc_ci95']})")
    print(f"  Climatology PR-AUC    : {clim_prauc:.4f}   {'[BETTER]' if model_prauc > clim_prauc else '[WORSE]'}")
    print(f"  Model Brier           : {model_brier:.4f}   {'[BETTER]' if model_brier < clim_brier else '[WORSE]'}")
    print(f"  Climatology Brier     : {clim_brier:.4f}")
    print(f"  Model ROC-AUC         : {model_rocauc:.4f}  (95% month-block CI: {ci['roc_auc_ci95']})")

    print("\nTHRESHOLD TABLE (test set heavy-rain classifier):")
    print(f"  {'Thresh':>6} | {'Prec':>6} | {'Recall':>6} | {'F1':>6} | {'Warn':>4} | {'TP':>3} | {'FP':>4} | {'Missed':>6}")
    print("  " + "-" * 58)
    for row in th_table:
        print(
            f"  {row['threshold']:>6.2f} | {row['precision']:>6.3f} | {row['recall']:>6.3f} | "
            f"{row['f1']:>6.3f} | {row['warnings_issued']:>4d} | {row['tp']:>3d} | "
            f"{row['fp']:>4d} | {row['fn']:>6d}"
        )

    print("\n5-FOLD EXPANDING-WINDOW CV (full history):")
    print(f"  {'Fold':>4} | {'Train End':>10} | {'Test Window':>23} | {'Heavy':>5} | {'MAE':>6} | {'PR-AUC':>6} | {'ROC-AUC':>7}")
    print("  " + "-" * 74)
    for f in cv["folds"]:
        pr_s = f"{f['pr_auc']:.3f}" if f["pr_auc"] is not None else "  n/a"
        roc_s = f"{f['roc_auc']:.3f}" if f["roc_auc"] is not None else "   n/a"
        print(
            f"  {f['fold']:>4d} | {f['train_end']:>10} | {f['test_start']}..{f['test_end']} | "
            f"{f['test_heavy_days']:>5d} | {f['mae_mm']:>6.3f} | {pr_s:>6} | {roc_s:>7}"
        )
    print(
        f"  Mean +/- Std -> MAE: {cv['mae_mean']:.3f} +/- {cv['mae_std']:.3f} mm | "
        f"PR-AUC: {cv['pr_auc_mean']} +/- {cv['pr_auc_std']} | "
        f"ROC-AUC: {cv['roc_auc_mean']} +/- {cv['roc_auc_std']}"
    )
    print("=" * 70)

    beats_persistence = bool(model_mae < pct_mae)
    beats_climatology = bool(model_mae < clim_mae)
    beats_pr_auc = bool((not np.isnan(model_prauc)) and (not np.isnan(clim_prauc)) and (model_prauc > clim_prauc))
    passes_gate = bool(beats_persistence and beats_climatology and beats_pr_auc)

    metrics = {
        "model_mae_mm": round(model_mae, 4),
        "persistence_mae_mm": round(pct_mae, 4),
        "climatology_mae_mm": round(clim_mae, 4),
        "model_heavy_mae_mm": round(model_heavy_mae, 4) if not np.isnan(model_heavy_mae) else None,
        "climatology_heavy_mae_mm": round(clim_heavy_mae, 4) if not np.isnan(clim_heavy_mae) else None,
        "model_pr_auc": round(model_prauc, 4) if not np.isnan(model_prauc) else None,
        "climatology_pr_auc": round(clim_prauc, 4) if not np.isnan(clim_prauc) else None,
        "model_brier": round(model_brier, 4),
        "climatology_brier": round(clim_brier, 4),
        "model_roc_auc": round(model_rocauc, 4) if not np.isnan(model_rocauc) else None,
        "bootstrap_ci_95": ci,
        "threshold_table": th_table,
        "expanding_cv_5fold": cv,
        "passes_gate": passes_gate,
        "test_start": TEST_START.isoformat(),
        "train_heavy_days": pos_tr,
        "train_not_heavy_days": neg_tr,
        "test_heavy_days": pos_te,
        "test_not_heavy_days": neg_te,
        "heavy_mm": heavy_mm,
        "train_rows": len(X_tr),
        "test_rows": len(X_te),
        "data_source": data_source_label,
        "data_source_url": source_url,
        "data_start": str(actual_start),
        "data_end": str(actual_end),
        "refit_on_all_data": False,
        "test_metrics_source": "pre_2024_model_only",
    }

    if not save:
        return (0 if passes_gate else 2), metrics

    if not passes_gate:
        print("\ndid NOT beat baselines — model NOT saved.")
        print(f"  Beats persistence MAE: {beats_persistence}")
        print(f"  Beats climatology MAE: {beats_climatology}")
        print(f"  Beats climatology PR-AUC: {beats_pr_auc}")
        return 2, metrics

    print("\nModel passed gate — refitting on all available data before saving …")
    X_all = df[FEATURES].fillna(0.0).infer_objects(copy=False)
    yr_all = np.log1p(df["rain_next_mm"].clip(lower=0))
    yc_all = df["heavy_next"]
    reg_all, cls_all = _make_models()
    reg_all.fit(X_all, yr_all)
    cls_all.fit(X_all, yc_all)

    metrics["refit_on_all_data"] = True
    metrics["refit_rows"] = len(X_all)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    trained_at = datetime.now(timezone.utc).isoformat()
    bundle = {
        "regressor": reg_all,
        "classifier": cls_all,
        "features": FEATURES,
        "heavy_mm": heavy_mm,
        "version": date.today().isoformat(),
        "trained_at": trained_at,
        "data_start": str(actual_start),
        "data_end": str(actual_end),
        "data_source": data_source_label,
        "metrics": metrics,
        "location": {"lat": LAT, "lon": LON, "city": "Hyderabad"},
    }

    joblib.dump(bundle, MODEL_DIR / "model.joblib")
    (MODEL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved -> {MODEL_DIR / 'model.joblib'} (refit on {len(X_all)} days; metrics from pre-2024 model)")
    print(f"Saved -> {MODEL_DIR / 'metrics.json'}")
    return 0, metrics


def train(heavy_mm: float = HEAVY_MM) -> int:
    code, _ = evaluate_and_optionally_save(heavy_mm=heavy_mm, save=True)
    return code


if __name__ == "__main__":
    sys.exit(train())
