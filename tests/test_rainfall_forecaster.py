"""Tests for rainfall forecaster: no leakage, graceful 503, scorecard gate, and log uniqueness."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import db as db_mod
from backend.cache import global_cache
from backend.main import app
from backend.services import ml_model
from scripts.train_rainfall_forecaster import build


def test_no_future_leakage_in_build():
    """Features for day t depend only on data up to t; target is t+1."""
    dates = pd.date_range("2024-01-01", periods=60, freq="D")
    df = pd.DataFrame(
        {
            "precipitation_sum": np.arange(60, dtype=float),
            "temperature_2m_max": np.full(60, 32.0),
            "temperature_2m_min": np.full(60, 22.0),
        },
        index=dates,
    )
    out = build(df, for_inference=False)
    # Row at index t should have rain_1d == p[t-1] and rain_next_mm == p[t+1]
    sample_day = pd.Timestamp("2024-02-15")
    pos = df.index.get_loc(sample_day)
    assert out.loc[sample_day, "rain_1d"] == df["precipitation_sum"].iloc[pos - 1]
    assert out.loc[sample_day, "rain_next_mm"] == df["precipitation_sum"].iloc[pos + 1]

    # Mutating day t+1 precipitation must NOT change day t's features
    df_mut = df.copy()
    df_mut.iloc[pos + 1, df_mut.columns.get_loc("precipitation_sum")] = 999.0
    out_inf_orig = build(df, for_inference=True)
    out_inf_mut = build(df_mut, for_inference=True)
    assert out_inf_orig.loc[sample_day, "rain_1d"] == out_inf_mut.loc[sample_day, "rain_1d"]
    assert out_inf_orig.loc[sample_day, "rain_7d"] == out_inf_mut.loc[sample_day, "rain_7d"]
    assert out_inf_orig.loc[sample_day, "rain_30d"] == out_inf_mut.loc[sample_day, "rain_30d"]


@pytest.mark.asyncio
async def test_predict_live_returns_none_when_model_missing(tmp_path):
    global_cache.clear()
    missing_path = tmp_path / "nonexistent_model.joblib"
    with patch.object(ml_model, "_BUNDLE_PATH", missing_path), patch.object(ml_model, "_bundle", None):
        res = await ml_model.predict_live()
        assert res is None


def test_predict_rain_endpoint_returns_503_when_model_missing(tmp_path, monkeypatch):
    global_cache.clear()
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    missing_path = tmp_path / "nonexistent_model.joblib"
    with patch.object(ml_model, "_BUNDLE_PATH", missing_path), patch.object(ml_model, "_bundle", None):
        with TestClient(app) as client:
            resp = client.get("/api/predict/rain")
            assert resp.status_code == 503
            body = resp.json()
            assert body["trained"] is False


@pytest.mark.asyncio
async def test_rain_forecast_log_unique_and_scorecard_gate(tmp_path):
    test_db = str(tmp_path / "test_rain_log.db")
    with patch.object(db_mod, "DB_PATH", test_db):
        await db_mod.init_db()

        # Upsert twice for the same for_date -> must remain 1 row
        await db_mod.upsert_rain_forecast_log("2026-11-20", 1.2, 0.05, 2.0, 40.0)
        await db_mod.upsert_rain_forecast_log("2026-11-20", 1.5, 0.08, 2.5, 45.0)
        # Add a second day
        await db_mod.upsert_rain_forecast_log("2026-11-21", 0.4, 0.01, 0.5, 10.0)

        sc = await db_mod.get_rain_forecast_scorecard()
        assert sc["days_logged"] == 2
        assert sc["days_with_actuals"] == 0
        assert sc["winner"] is None
        assert sc["note"] == "insufficient data"
