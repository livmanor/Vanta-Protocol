"""Tests for the risk engine refactor (vanta-upgrade).

Covers:
  1. no_rainfall_data  — score_observations returns level=None, score=None
  2. missing_dem       — _load_dem_slopes with nonexistent path returns all None, no crash
  3. invalid_coords    — validate_row rejects coords outside GHMC box (Chennai)
  4. no_model          — build_flood_prediction is always rule_based with probability=None
  5. api_timeout       — _fetch_weather marks cells failed on TimeoutException, no raise
  6. rate_limit        — _fetch_weather marks cells failed/stale on HTTP 429, no raise
"""
from __future__ import annotations

import asyncio
import sys
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# 1. No rainfall data → level=None, score=None
# ---------------------------------------------------------------------------

def test_no_rainfall_data_returns_none_level_and_score():
    """When rainfall_24h and rainfall_48h are both None the flood level and
    score must be None — never infer zero rain."""
    from backend.services.risk_engine import score_observations

    level, score, explanation = score_observations(
        rainfall_24h=None,
        rainfall_48h=None,
        precip_prob_max=None,
        wind_max_kmh=None,
        river_discharge=None,
        elevation_m=20.0,
        historical_flood=False,
    )

    assert level is None, f"Expected level=None, got {level}"
    assert score is None, f"Expected score=None, got {score}"
    assert "unavailable" in explanation.why_this.lower(), (
        f"Expected 'unavailable' in why_this, got: {explanation.why_this!r}"
    )


def test_no_rainfall_data_with_river_still_none():
    """River discharge alone should not produce a flood level without rainfall."""
    from backend.services.risk_engine import score_observations

    level, score, _ = score_observations(
        rainfall_24h=None,
        rainfall_48h=None,
        precip_prob_max=None,
        wind_max_kmh=None,
        river_discharge=5000.0,   # very high discharge — but no rainfall
        elevation_m=5.0,
        historical_flood=True,
    )

    assert level is None, f"River discharge without rainfall must yield level=None, got {level}"
    assert score is None


# ---------------------------------------------------------------------------
# 2. Missing DEM → all slopes None, no crash
# ---------------------------------------------------------------------------

def test_missing_dem_returns_all_none_slopes(tmp_path):
    """When DEM_FILE_PATH points to a nonexistent file _load_dem_slopes must
    return all None values without crashing."""
    import backend.services.grid as grid_mod

    # Reset the one-time warning flag so the missing-file branch fires cleanly.
    grid_mod._dem_warned = False

    fake_dem = str(tmp_path / "nonexistent.tif")
    cells = [
        {"id": "c01", "lat": 17.38, "lon": 78.49},
        {"id": "c02", "lat": 17.42, "lon": 78.51},
    ]

    with patch.object(grid_mod.settings, "DEM_FILE_PATH", fake_dem):
        slopes = grid_mod._load_dem_slopes(cells)

    assert slopes == {"c01": None, "c02": None}, f"Expected all None slopes, got {slopes}"


def test_empty_dem_path_returns_all_none():
    """Empty DEM_FILE_PATH → slopes all None, no file access attempted."""
    import backend.services.grid as grid_mod

    cells = [{"id": "x1", "lat": 17.40, "lon": 78.50}]

    with patch.object(grid_mod.settings, "DEM_FILE_PATH", ""):
        slopes = grid_mod._load_dem_slopes(cells)

    assert slopes == {"x1": None}


# ---------------------------------------------------------------------------
# 3. Invalid coordinates (outside GHMC box) → validation error
# ---------------------------------------------------------------------------

def test_invalid_coords_chennai_rejected():
    """Chennai coordinates are well outside the GHMC box and must be rejected."""
    from scripts.label_schema import validate_row

    chennai_row = {
        "event_id": "evt-chennai-01",
        "date": date.today().isoformat(),
        "lat": 13.0827,   # Chennai
        "lon": 80.2707,
        "label_type": "flood",
        "label": 1,
        "source": "manual",
    }

    errors = validate_row(chennai_row, today=date.today())

    assert any(
        "GHMC" in e or "outside" in e.lower() or "box" in e.lower()
        for e in errors
    ), f"Expected a GHMC boundary error, got: {errors}"


def test_valid_coords_hyderabad_accepted():
    """Hyderabad city-centre coordinates must pass the boundary check."""
    from scripts.label_schema import validate_row

    hyd_row = {
        "event_id": "evt-hyd-01",
        "date": "2024-08-15",
        "lat": 17.385,
        "lon": 78.486,
        "label_type": "flood",
        "label": 1,
        "source": "manual",
    }

    errors = validate_row(hyd_row, today=date.today())
    coord_errors = [e for e in errors if "GHMC" in e or "outside" in e.lower()]
    assert coord_errors == [], f"Valid Hyderabad coords produced coord errors: {coord_errors}"


# ---------------------------------------------------------------------------
# 4. No model → build_flood_prediction always rule_based, probability=None
# ---------------------------------------------------------------------------

def test_no_model_flood_prediction_is_rule_based():
    """build_flood_prediction must always set method='rule_based' and probability=None.
    There is no ML model; this must remain true even if one is later trained."""
    from backend.services.risk_engine import build_flood_prediction

    flood, wind, heat = build_flood_prediction(
        location_id="test-loc",
        location_name="Test Area",
        lat=17.385,
        lon=78.486,
        rainfall_24h=80.0,
        rainfall_48h=120.0,
        river_discharge=None,
        historical_flood=True,
        low_lying=True,
        temperature_max_c=38.0,
        apparent_temperature_max_c=40.0,
        wind_speed_kmh=25.0,
    )

    assert flood.method == "rule_based", f"Expected rule_based, got {flood.method!r}"
    assert flood.probability is None, f"Expected probability=None, got {flood.probability}"
    assert flood.model_version == "none", f"Expected model_version='none', got {flood.model_version!r}"
    assert flood.hazard == "urban_flood"


def test_no_model_flood_no_rainfall_category_is_none():
    """With no rainfall, category must be None — not zero or any default."""
    from backend.services.risk_engine import build_flood_prediction

    flood, _, _ = build_flood_prediction(
        location_id="test-loc2",
        location_name="Test Area",
        lat=17.385,
        lon=78.486,
        rainfall_24h=None,
        rainfall_48h=None,
        river_discharge=None,
        historical_flood=False,
    )

    assert flood.category is None, f"Expected category=None with no rainfall, got {flood.category}"
    assert flood.probability is None


# ---------------------------------------------------------------------------
# 5. API timeout → cells marked failed, no exception propagated
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_api_timeout_marks_cells_failed():
    """A TimeoutException from Open-Meteo must be caught inside _fetch_weather.
    All affected cells should get status='failed'; no exception must escape."""
    import backend.services.grid as grid_mod
    import httpx

    # Clear any cached readings that might mask the timeout path.
    grid_mod.global_cache._cache.clear() if hasattr(grid_mod.global_cache, "_cache") else None

    test_cells = [
        {"id": "t01", "lat": 17.40, "lon": 78.45},
        {"id": "t02", "lat": 17.41, "lon": 78.46},
    ]

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = httpx.TimeoutException("timed out")

        result = await grid_mod._fetch_weather(test_cells)

    # Every cell that couldn't be fetched must appear in the result with a failure status.
    for cell in test_cells:
        assert cell["id"] in result, f"Cell {cell['id']} missing from result after timeout"
        status = result[cell["id"]].get("status")
        assert status in ("failed", "stale"), (
            f"Expected failed/stale status for {cell['id']} after timeout, got {status!r}"
        )


# ---------------------------------------------------------------------------
# 6. Rate limit (HTTP 429) → cells marked failed/stale, no exception propagated
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rate_limit_429_marks_cells_failed():
    """A 429 response from Open-Meteo must be handled gracefully.
    Cells get the stale fallback if available, otherwise 'failed'. No raise."""
    import backend.services.grid as grid_mod
    import httpx

    # Ensure no stale cache entry exists for these test cells.
    if hasattr(grid_mod.global_cache, "_cache"):
        grid_mod.global_cache._cache.clear()

    test_cells = [
        {"id": "r01", "lat": 17.38, "lon": 78.44},
        {"id": "r02", "lat": 17.39, "lon": 78.45},
    ]

    mock_response = MagicMock()
    mock_response.status_code = 429

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response

        result = await grid_mod._fetch_weather(test_cells)

    for cell in test_cells:
        assert cell["id"] in result, f"Cell {cell['id']} missing from result after 429"
        status = result[cell["id"]].get("status")
        assert status in ("failed", "stale"), (
            f"Expected failed/stale for {cell['id']} after 429, got {status!r}"
        )
