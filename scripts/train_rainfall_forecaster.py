"""Hyderabad rainfall next-day forecaster.

Trains on ERA5 reanalysis via Open-Meteo's archive API
(historical-forecast-api.open-meteo.com gives closer-to-live parity).

Usage
-----
  python scripts/train_rainfall_forecaster.py

Outputs
-------
  models/rainfall/model.joblib   — bundle with regressor + classifier + metadata
  docs/model_report.md           — updated with training results (appended)

The ``build()`` function is imported by ``backend/services/ml_model.py`` for
live inference, so its public API is stable.
"""
from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

import httpx
import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# ---------------------------------------------------------------------------
# Constants shared with the live inference service
# ---------------------------------------------------------------------------
LAT: float = 17.3914          # Hyderabad city-centre
LON: float = 78.4702

HEAVY_MM: float = 25.0        # ≥ 25 mm/day → "heavy" label

# Daily fields requested from Open-Meteo (archive + forecast API).
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

# Training window — full ERA5 archive available for Hyderabad
TRAIN_START = date(2016, 1, 1)
TRAIN_END   = (date.today() - timedelta(days=5))   # ERA5 has ~5-day lag

MODEL_DIR = ROOT / "models" / "rainfall"


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def build(d: pd.DataFrame, *, for_inference: bool = False) -> pd.DataFrame:
    """Add lag / rolling features to a daily DataFrame and return training rows.

    Parameters
    ----------
    d:
        DataFrame indexed by date with at least the DAILY columns.
    for_inference:
        If True, return the most-recent row that has valid lag features but
        skip adding/requiring ``rain_next_mm`` / ``heavy_next`` targets
        (they are unknowable for future days).  Useful for live prediction.

    Returns
    -------
    DataFrame with feature columns (and target columns when not for_inference).
    Rows with any NaN in the required subset are dropped.
    """
    x = d.copy()
    p = x["precipitation_sum"]

    # Rolling / lag features
    x["rain_1d"]   = p.shift(1)
    x["rain_3d"]   = p.shift(1).rolling(3,  min_periods=3).sum()
    x["rain_7d"]   = p.shift(1).rolling(7,  min_periods=7).sum()
    x["rain_14d"]  = p.shift(1).rolling(14, min_periods=14).sum()
    x["rain_30d"]  = p.shift(1).rolling(30, min_periods=30).sum()

    # Month / season signal
    x["month_sin"] = np.sin(2 * np.pi * x.index.month / 12)
    x["month_cos"] = np.cos(2 * np.pi * x.index.month / 12)

    # Wet-streak: consecutive days with rain ≥ 1 mm (looking backwards)
    is_wet = (p.shift(1) >= 1.0).astype(int)
    streak = []
    s = 0
    for w in is_wet:
        s = (s + 1) if w else 0
        streak.append(s)
    x["wet_streak"] = streak

    # Log-transform heavy-tailed rain to help the regressor
    x["log1p_rain_1d"]  = np.log1p(x["rain_1d"].clip(lower=0))
    x["log1p_rain_7d"]  = np.log1p(x["rain_7d"].clip(lower=0))
    x["log1p_rain_30d"] = np.log1p(x["rain_30d"].clip(lower=0))

    # Pass-through meteo columns if present (they may be missing for some API calls)
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
        # Return rows that have enough history for the lag features.
        # rain_30d needs 31 days of data (30-day rolling with 1-day shift).
        return x.dropna(subset=["rain_30d"])

    # Supervised targets — next-day rain
    x["rain_next_mm"] = p.shift(-1)
    x["heavy_next"]   = (x["rain_next_mm"] >= HEAVY_MM).astype(float)
    x.loc[x["rain_next_mm"].isna(), "heavy_next"] = np.nan

    return x.dropna(subset=["rain_next_mm", "rain_30d"])


# ---------------------------------------------------------------------------
# Feature list (must stay identical between training and inference)
# ---------------------------------------------------------------------------
FEATURES: list[str] = [
    "rain_1d", "rain_3d", "rain_7d", "rain_14d", "rain_30d",
    "log1p_rain_1d", "log1p_rain_7d", "log1p_rain_30d",
    "wet_streak",
    "month_sin", "month_cos",
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

def _fetch_archive(start: date, end: date) -> pd.DataFrame:
    """Download daily fields from the Open-Meteo historical-forecast API.

    We prefer historical-forecast-api.open-meteo.com (ERA5-based, same
    product as forecast API recent days) so training and inference use
    consistent data.  Falls back to archive-api.open-meteo.com.
    """
    daily_param = ",".join(DAILY)
    for base_url in [
        "https://historical-forecast-api.open-meteo.com/v1/forecast",
        "https://archive-api.open-meteo.com/v1/archive",
    ]:
        try:
            with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                r = client.get(
                    base_url,
                    params={
                        "latitude":   LAT,
                        "longitude":  LON,
                        "start_date": start.isoformat(),
                        "end_date":   end.isoformat(),
                        "daily":      daily_param,
                        "timezone":   "Asia/Kolkata",
                    },
                )
                r.raise_for_status()
                payload = r.json()
                if isinstance(payload, list):
                    payload = payload[0]
                daily = payload.get("daily", {})
                if not daily.get("time"):
                    continue
                df = pd.DataFrame(daily).rename(columns={"time": "date"})
                df["date"] = pd.to_datetime(df["date"])
                df = df.set_index("date").sort_index()
                print(f"  Fetched {len(df)} days from {base_url}")
                return df
        except Exception as exc:
            print(f"  Warning: {base_url} failed: {exc}")
            time.sleep(2)
    raise RuntimeError("All archive APIs failed.")


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train() -> int:
    """Download data, fit models, save bundle.  Returns 0 on success."""
    try:
        from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
        from sklearn.metrics import mean_absolute_error, roc_auc_score
    except ImportError:
        print("scikit-learn not installed.  Run:  pip install scikit-learn")
        return 1

    print(f"Fetching ERA5 archive for Hyderabad  {TRAIN_START} → {TRAIN_END}")
    raw = _fetch_archive(TRAIN_START, TRAIN_END)

    print("Building features …")
    df = build(raw)

    # Keep only columns that exist
    feat_cols = [c for c in FEATURES if c in df.columns]
    missing   = [c for c in FEATURES if c not in df.columns]
    if missing:
        print(f"  Note: columns missing from archive and filled with 0: {missing}")
        for c in missing:
            df[c] = 0.0

    X = df[FEATURES].fillna(0.0)
    y_reg  = np.log1p(df["rain_next_mm"])          # predict log(1 + mm)
    y_cls  = df["heavy_next"].dropna()

    # Only keep rows where both targets are defined (should already be the case)
    mask_cls = df["heavy_next"].notna()
    X_cls  = X.loc[mask_cls]
    y_cls  = y_cls.loc[mask_cls]

    # Simple time-based train / test split (last 20 % as test)
    n = len(X)
    split = int(n * 0.80)
    X_tr,  X_te  = X.iloc[:split],  X.iloc[split:]
    yr_tr, yr_te = y_reg.iloc[:split], y_reg.iloc[split:]

    n_cls = len(X_cls)
    split_cls = int(n_cls * 0.80)
    Xc_tr, Xc_te = X_cls.iloc[:split_cls], X_cls.iloc[split_cls:]
    yc_tr, yc_te = y_cls.iloc[:split_cls], y_cls.iloc[split_cls:]

    print(f"Training regressor   on {len(X_tr)} days …")
    reg = GradientBoostingRegressor(n_estimators=300, max_depth=4,
                                    learning_rate=0.05, subsample=0.8,
                                    random_state=42)
    reg.fit(X_tr, yr_tr)
    mae = mean_absolute_error(np.expm1(yr_te), np.expm1(reg.predict(X_te)))
    print(f"  Test MAE: {mae:.2f} mm")

    print(f"Training classifier  on {len(Xc_tr)} days …")
    pos = int(yc_tr.sum())
    neg = len(yc_tr) - pos
    cls = GradientBoostingClassifier(n_estimators=300, max_depth=4,
                                     learning_rate=0.05, subsample=0.8,
                                     random_state=42)
    cls.fit(Xc_tr, yc_tr)
    if len(yc_te.unique()) > 1:
        auc = roc_auc_score(yc_te, cls.predict_proba(Xc_te)[:, 1])
        print(f"  Test AUC (heavy ≥ {HEAVY_MM} mm): {auc:.3f}")
    else:
        print("  Only one class in test split — AUC not computed.")

    # Persist
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    bundle_path = MODEL_DIR / "model.joblib"
    bundle = {
        "regressor":  reg,
        "classifier": cls,
        "features":   FEATURES,
        "version":    date.today().isoformat(),
        "train_start": TRAIN_START.isoformat(),
        "train_end":   TRAIN_END.isoformat(),
        "heavy_mm":    HEAVY_MM,
        "lat":         LAT,
        "lon":         LON,
        "metrics": {
            "reg_mae_mm": round(mae, 3),
            "train_positives": pos,
            "train_negatives": neg,
        },
    }
    joblib.dump(bundle, bundle_path)
    print(f"Saved → {bundle_path}")

    # Append a brief blurb to docs/model_report.md
    report = ROOT / "docs" / "model_report.md"
    blurb = (
        f"\n\n---\n\n## Rainfall next-day forecaster  ({date.today().isoformat()})\n\n"
        f"- Training window: {TRAIN_START} → {TRAIN_END} ({n} days)\n"
        f"- Features: {len(FEATURES)}\n"
        f"- Regressor test MAE: **{mae:.2f} mm** (log1p-space; actual mm)\n"
        f"- Heavy-rain threshold: ≥ {HEAVY_MM} mm\n"
        f"- Training positives (heavy days): {pos}  |  negatives: {neg}\n"
        f"- Model bundle: `{bundle_path.relative_to(ROOT)}`\n"
    )
    report.parent.mkdir(parents=True, exist_ok=True)
    with open(report, "a", encoding="utf-8") as fh:
        fh.write(blurb)
    print(f"Updated {report}")
    return 0


if __name__ == "__main__":
    sys.exit(train())
