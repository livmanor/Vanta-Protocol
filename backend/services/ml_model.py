"""Live rainfall prediction service.

Loads the trained model bundle once at import time and exposes
``predict_live()``, which fetches the most-recent 35 days from
Open-Meteo's forecast API, engineers the same features used during
training, logs the prediction to SQLite (one row per for_date), and
returns a one-day-ahead prediction.

The result is cached for ~1 hour via the shared ``global_cache`` so
that every page load does not hit Open-Meteo.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

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
            "Rainfall model bundle loaded (version %s, data %s -> %s)",
            _bundle.get("version", "?"),
            _bundle.get("data_start", "?"),
            _bundle.get("data_end", "?"),
        )
    except Exception as exc:
        logger.warning("Could not load rainfall model bundle: %s", exc)
        _bundle = None
    return _bundle


async def _log_prediction(result: dict) -> None:
    try:
        from backend.db import upsert_rain_forecast_log
        await upsert_rain_forecast_log(
            for_date=result["for_date"],
            ml_rain_mm=result["rain_next_mm"],
            ml_p_heavy=result["p_heavy"],
            open_meteo_rain_mm=result["open_meteo_rain_mm"],
            open_meteo_precip_prob_pct=result["open_meteo_precip_prob_pct"],
        )
    except Exception as exc:
        logger.warning("Could not log rain prediction to SQLite: %s", exc)


# ---------------------------------------------------------------------------
# Live prediction
# ---------------------------------------------------------------------------

async def predict_live() -> dict | None:
    """Fetch recent days from Open-Meteo and return a next-day prediction."""
    from backend.cache import global_cache

    bundle = _load_bundle()
    if bundle is None:
        return None

    cache_key = "ml_rain_predict_live"
    cached = global_cache.get(cache_key)
    if cached is not None:
        data, fetched_at, is_stale = cached
        if not is_stale:
            await _log_prediction(data)
            return data

    import sys
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    try:
        from scripts.train_rainfall_forecaster import build, DAILY, LAT, LON, HEAVY_MM
    except ImportError as exc:
        logger.warning("Could not import train_rainfall_forecaster: %s", exc)
        return None

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

    today_row = df.iloc[-1]
    om_rain_today_mm   = float(today_row.get("precipitation_sum", 0.0) or 0.0)
    om_precip_prob_pct = float(today_row.get("precipitation_probability_max", 0.0) or 0.0)
    today_date_str     = str(today_row.name.date())

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

    for col in features:
        if col not in last_row.columns:
            last_row = last_row.copy()
            last_row[col] = 0.0

    X = last_row[features].fillna(0.0).infer_objects(copy=False)

    try:
        rain_mm = float(np.expm1(bundle["regressor"].predict(X))[0])
        p_heavy = float(bundle["classifier"].predict_proba(X)[0, 1])
    except Exception as exc:
        logger.error("Model prediction failed: %s", exc)
        return None

    metrics = bundle.get("metrics") or {}
    data_start = bundle.get("data_start") or metrics.get("data_start")
    data_end = bundle.get("data_end") or metrics.get("data_end")
    data_source = bundle.get("data_source") or metrics.get("data_source")
    trained_at = bundle.get("trained_at")

    result = {
        "for_date":                   today_date_str,
        "rain_next_mm":               round(max(rain_mm, 0.0), 2),
        "p_heavy":                    round(p_heavy, 4),
        "heavy_mm_threshold":         bundle.get("heavy_mm", HEAVY_MM),
        "open_meteo_rain_mm":         round(om_rain_today_mm, 2),
        "open_meteo_precip_prob_pct": round(om_precip_prob_pct, 1),
        "version":                    bundle.get("version", "unknown"),
        "trained_at":                 trained_at,
        "data_start":                 data_start,
        "data_end":                   data_end,
        "data_source":                data_source,
        "test_roc_auc":               metrics.get("model_roc_auc"),
    }

    now_iso = datetime.now(timezone.utc).isoformat()
    global_cache.set(cache_key, result, ttl_seconds=3600, fetched_at_iso=now_iso)
    await _log_prediction(result)
    logger.info("Live rainfall prediction for %s: %.1f mm, p_heavy=%.2f", today_date_str, rain_mm, p_heavy)
    return result
