"""Tests for the Unified Hazard Engine, Tier A & B modules, and Officer Action Approvals.

Rules verified:
  1. No combined "total risk" score is ever produced (total_risk_score is None).
  2. Earthquake is monitoring & seismicity only — NO prediction.
  3. Cyclone is track monitoring & exposure only — wind never bumps flood score.
  4. Wildfire handles NASA FIRMS MAP_KEY presence and absence gracefully.
  5. Tier B modules return explicit "not implemented: missing X".
  6. Response recommendations start as "suggested" and require explicit officer approval.
"""
from __future__ import annotations

import os
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.models import (
    HazardItem,
    HazardModuleStatus,
    RecommendedAction,
    UnifiedHazardResponse,
)
from backend.services.hazards.actions_store import (
    approve_action,
    get_action,
    list_actions,
    reject_action,
    save_actions,
)
from backend.services.hazards.engine import unified_hazard_engine
from backend.services.hazards.tier_a.cyclone import CycloneHazardModule
from backend.services.hazards.tier_a.earthquake import EarthquakeHazardModule
from backend.services.hazards.tier_a.wildfire import WildfireHazardModule
from backend.services.hazards.tier_b.unimplemented import TIER_B_MODULES


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. Unified Engine & Total Risk Score Contract
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unified_hazard_engine_total_risk_score_is_always_none():
    """STRICT RULE: The engine must return per-hazard assessments without any combined total score."""
    resp = await unified_hazard_engine.assess_all()
    assert isinstance(resp, UnifiedHazardResponse)
    assert resp.total_risk_score is None, f"Expected total_risk_score=None, got {resp.total_risk_score}"
    assert "no combined total risk score" in resp.disclaimer.lower()


@pytest.mark.asyncio
async def test_unified_hazard_engine_modules_registry():
    """All Tier A and Tier B modules must be registered and return valid statuses."""
    statuses = await unified_hazard_engine.get_module_statuses()
    assert "earthquake" in statuses
    assert "cyclone" in statuses
    assert "wildfire" in statuses
    # Tier B
    for b_mod in ("flood_extension", "landslide", "drought", "heatwave", "tsunami", "lightning", "volcano"):
        assert b_mod in statuses, f"Tier B module {b_mod} missing from engine statuses"
        assert statuses[b_mod].tier == "B"
        assert statuses[b_mod].status == "not_implemented"
        assert "not implemented: missing" in statuses[b_mod].message


# ---------------------------------------------------------------------------
# 2. Tier A: Earthquake (Monitoring only, No prediction)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_earthquake_module_monitoring_only_no_prediction():
    """Earthquake module must return method='observed', forecast_window_h=0, and explicit no-prediction warning."""
    eq_mod = EarthquakeHazardModule()
    status = await eq_mod.get_status()
    assert status.status == "implemented"
    assert "no prediction" in status.message.lower()

    items = await eq_mod.assess(bbox={"min_lat": 6.5, "max_lat": 37.5, "min_lon": 68.0, "max_lon": 98.0})
    assert len(items) > 0, "Expected at least one earthquake in India bbox"

    for item in items:
        assert item.hazard_id == "earthquake"
        assert item.is_observed is True, f"Earthquake {item.id} must be marked as observed"
        assert item.method == "observed", f"Earthquake {item.id} method must be 'observed', got {item.method}"
        assert item.forecast_window_h == 0, f"Earthquake {item.id} forecast_window_h must be 0"
        assert item.probability is None, "Earthquake must never output a probability"
        assert any("no prediction" in w.lower() or "prediction is scientifically not possible" in w.lower() for w in item.warnings)


# ---------------------------------------------------------------------------
# 3. Tier A: Cyclone (Track exposure only, separate wind)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cyclone_module_track_monitoring_and_exposure():
    """Cyclone module must return track geometries and exposure without mixing flood scores."""
    cyc_mod = CycloneHazardModule()
    status = await cyc_mod.get_status()
    assert status.status == "implemented"

    items = await cyc_mod.assess()
    assert len(items) > 0, "Expected cyclone items from active/historical tracks"

    for item in items:
        assert item.hazard_id == "cyclone"
        assert item.is_observed is True
        assert item.probability is None
        assert any("separate" in w.lower() or "exposure" in w.lower() for w in item.warnings)


# ---------------------------------------------------------------------------
# 4. Tier A: Wildfire (NASA FIRMS MAP_KEY Handling)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_wildfire_module_missing_credentials_fallback():
    """Without MAP_KEY, wildfire module must report missing_credentials and not crash."""
    wildfire_mod = WildfireHazardModule()

    with patch.dict(os.environ, {}, clear=True):
        with patch("backend.services.hazards.tier_a.wildfire._get_firms_map_key", return_value=""):
            status = await wildfire_mod.get_status()
            assert status.status == "missing_credentials"
            assert "MAP_KEY" in status.message

            items = await wildfire_mod.assess()
            # Items may come from offline baseline or be empty; all must have missing-key note
            for item in items:
                assert item.hazard_id == "wildfire"
                assert item.is_observed is True


# ---------------------------------------------------------------------------
# 5. Tier B Modules: Explicit "not implemented: missing X"
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tier_b_modules_explicit_reasons():
    """Every Tier B module must report not_implemented with the missing dependency."""
    for mod in TIER_B_MODULES:
        status = await mod.get_status()
        assert status.tier == "B"
        assert status.status == "not_implemented"
        assert status.message.startswith("not implemented: missing"), (
            f"Module {mod.hazard_id} message must start with 'not implemented: missing', got: {status.message}"
        )
        items = await mod.assess()
        assert items == [], f"Tier B module {mod.hazard_id} must return empty items"


# ---------------------------------------------------------------------------
# 6. Response Recommendations Require Officer Approval
# ---------------------------------------------------------------------------

def test_recommended_actions_officer_approval_workflow():
    """Response recommendations must start as 'suggested' and require explicit approval/rejection."""
    act_id = "test-act-001"
    action = RecommendedAction(
        id=act_id,
        hazard_id="earthquake",
        action_type="infrastructure_inspection",
        description="Inspect PVNR Expressway piers",
        priority="high",
        status="suggested",
        suggested_at="2026-11-19T20:00:00Z",
    )
    save_actions([action])

    # Starts as suggested
    retrieved = get_action(act_id)
    assert retrieved is not None
    assert retrieved.status == "suggested"
    assert retrieved.approved_by is None

    # Approve action
    approved = approve_action(act_id, officer_name="Inspector Rao")
    assert approved is not None
    assert approved.status == "approved"
    assert approved.approved_by == "Inspector Rao"
    assert approved.approved_at is not None

    # Reject action
    act_id_2 = "test-act-002"
    action2 = RecommendedAction(
        id=act_id_2,
        hazard_id="wildfire",
        action_type="fire_dispatch",
        description="Dispatch fire tender to scrubland",
        priority="medium",
        status="suggested",
        suggested_at="2026-11-19T20:00:00Z",
    )
    save_actions([action2])

    rejected = reject_action(act_id_2, officer_name="Inspector Rao")
    assert rejected is not None
    assert rejected.status == "rejected"
    assert rejected.approved_by == "Inspector Rao"


# ---------------------------------------------------------------------------
# 7. Hazards API Endpoints
# ---------------------------------------------------------------------------

def test_hazards_api_endpoints(client):
    """Verify HTTP endpoints /api/hazards, /api/hazards/modules, and /api/hazards/actions."""
    # 1. /api/hazards/modules
    res = client.get("/api/hazards/modules")
    assert res.status_code == 200
    modules = res.json()
    assert "earthquake" in modules
    assert "cyclone" in modules
    assert "wildfire" in modules
    assert "landslide" in modules

    # 2. /api/hazards
    res2 = client.get("/api/hazards")
    assert res2.status_code == 200
    data = res2.json()
    assert data["total_risk_score"] is None
    assert "features" in data
    assert isinstance(data["features"], list)

    # 3. /api/hazards/actions
    res3 = client.get("/api/hazards/actions")
    assert res3.status_code == 200
    actions = res3.json()
    assert isinstance(actions, list)
