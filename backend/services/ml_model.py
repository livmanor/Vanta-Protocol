"""Live rainfall prediction service.

Loads the trained model bundle once at import time and exposes
``predict_live()``, which fetches the most-recent 35 days from
Open-Meteo's forecast API, engineers the same features used during
training, and returns a one-day-ahead prediction.

The result is cached for ~1 hour via the shared ``global_cache`` so
that every page load does not hit Open-Meteo.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
import numpy as np
import pandas as pd

from pathlib import Path

logger = logging.getLogger("vanta.ml_model")

_BUNDLE_PATH = Path("models/rainfall/model.joblib")
_bundle = None   # loaded lazily on first call so startup is not blocked


def _load_bundle():
    global _bundle
    if _bundle is not None:
        return _bundle
    if not _BUNDLE_PATH.exists():
        return None
    try:
        import joblib  # optional dep
        _bundle = joblib.load(_BUNDLE_PATH)
        logger.info(
            "Rainfall model bundle loaded (version %s, trained %s → %s)",
            _bundle.get("version", "?"),
            _bundle.get("train_start", "?"),
            _bundle.get("train_end",   "?"),
        )
    except Exception as exc:
        logger.warning("Could not load rainfall model bundle: %s", exc)
        _bundle = None
    return _bundle


# ---------------------------------------------------------------------------
# Live prediction
# ---------------------------------------------------------------------------

async def predict_live() -> dict | None:
    """Fetch recent days from Open-Meteo and return a next-day prediction.

    Returns
    -------
    dict  with keys: for_date, rain_next_mm, p_heavy, open_meteo_rain_mm,
                     open_meteo_precip_prob_pct, version, cached_at
    None  if the model bundle does not exist yet (not trained).
    """
    # Check cache first (1-hour TTL)
    from backend.cache import global_cache

    cache_key = "ml_rain_predict_live"
    cached = global_cache.get(cache_key)
    if cached is not None:
        data, fetched_at, is_stale = cached
        if not is_stale:
            return data

    bundle = _load_bundle()
    if bundle is None:
        return None

    # Import build() from the training script without executing train()
    import sys
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    try:
        from scripts.train_rainfall_forecaster import build, DAILY, LAT, LON, HEAVY_MM
    except ImportError as exc:
        logger.warning("Could not import train_rainfall_forecaster: %s", exc)
        return None

    # Fetch last 35 days (need 30-day rolling + a bit of headroom) + 1 forecast day
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            r = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude":       LAT,
                    "longitude":      LON,
                    "daily":          ",".join(DAILY),
                    "past_days":      35,
                    "forecast_days":  1,
                    "timezone":       "Asia/Kolkata",
                },
            )
            r.raise_for_status()
            payload = r.json()
            if isinstance(payload, list):
                payload = payload[0]
    except Exception as exc:
        logger.error("Open-Meteo forecast fetch failed: %s", exc)
        return None

    daily = payload.get("daily", {})
    if not daily.get("time"):
        logger.warning("Open-Meteo returned empty daily block for live prediction.")
        return None

    df = pd.DataFrame(daily).rename(columns={"time": "date"})
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()

    # The last row is today (a forecast, not yet complete) — grab it for the
    # Open-Meteo-native forecast figures, then drop it before feature engineering.
    today_row = df.iloc[-1]
    om_rain_today_mm   = float(today_row.get("precipitation_sum", 0.0) or 0.0)
    om_precip_prob_pct = float(today_row.get("precipitation_probability_max", 0.0) or 0.0)
    today_date_str     = str(today_row.name.date())

    # Drop today; build on yesterday-and-older so lag features are deterministic.
    hist = df.iloc[:-1]

    try:
        featured = build(hist, for_inference=True)
    except Exception as exc:
        logger.error("Feature engineering failed: %s", exc)
        return None

    if featured.empty:
        logger.warning("No rows survived feature engineering (need 31+ history days).")
        return None

    last_row = featured.iloc[[-1]]
    features = bundle.get("features", [])

    # Fill any missing feature columns with 0 (graceful degradation)
    for col in features:
        if col not in last_row.columns:
            last_row = last_row.copy()
            last_row[col] = 0.0

    X = last_row[features].fillna(0.0)

    try:
        rain_mm = float(np.expm1(bundle["regressor"].predict(X))[0])
        p_heavy = float(bundle["classifier"].predict_proba(X)[0, 1])
    except Exception as exc:
        logger.error("Model prediction failed: %s", exc)
        return None

    # The prediction is for the day after the last complete historical day,
    # which is effectively "today" (since we dropped today's incomplete row).
    for_date = today_date_str

    result = {
        "for_date":               for_date,
        "rain_next_mm":           round(max(rain_mm, 0.0), 2),
        "p_heavy":                round(p_heavy, 4),
        "heavy_mm_threshold":     HEAVY_MM,
        "open_meteo_rain_mm":     round(om_rain_today_mm, 2),
        "open_meteo_precip_prob_pct": round(om_precip_prob_pct, 1),
        "version":                bundle.get("version", "unknown"),
        "model_trained_end":      bundle.get("train_end", "?"),
    }

    now_iso = datetime.now(timezone.utc).isoformat()
    global_cache.set(cache_key, result, ttl_seconds=3600, fetched_at_iso=now_iso)
    logger.info("Live rainfall prediction for %s: %.1f mm, p_heavy=%.2f", for_date, rain_mm, p_heavy)
    return result
