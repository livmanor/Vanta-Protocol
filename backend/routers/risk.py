from fastapi import APIRouter, HTTPException
from typing import List
from backend.models import RiskZone
from backend.services.risk_engine import compute_real_risk_zones

router = APIRouter(prefix="/api", tags=["Risk Analysis"])

@router.get("/risk-zones", response_model=List[RiskZone])
async def get_risk_zones():
    """Derives current flood and cyclone risk levels across municipal zones
    using live Open-Meteo rainfall forecast, GloFAS river discharge, and terrain elevation.
    """
    try:
        zones = await compute_real_risk_zones()
        return zones
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute risk zones: {str(e)}")

