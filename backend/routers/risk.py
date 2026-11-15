from fastapi import APIRouter, HTTPException
from typing import List
from backend.models import RiskGridResponse, RiskZone
from backend.services.grid import compute_risk_grid
from backend.services.risk_engine import compute_real_risk_zones

router = APIRouter(prefix="/api", tags=["Risk Analysis"])

@router.get("/risk-zones", response_model=List[RiskZone])
async def get_risk_zones():
    """The six named Hyderabad Traffic Police hotspots. cell_type is hotspot."""
    try:
        zones = await compute_real_risk_zones()
        return zones
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute risk zones: {str(e)}")


@router.get("/risk-grid", response_model=RiskGridResponse)
async def get_risk_grid():
    """GHMC monitoring grid. Failed weather stays null and is marked data unavailable."""
    try:
        return await compute_risk_grid()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute the city risk grid: {str(e)}")

