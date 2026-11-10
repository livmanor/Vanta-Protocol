import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.models import EvacuationRoute, BlockedRoad, BlockedRoadCreate
from backend.services.routing import find_evacuation_route
from backend.db import fetch_blocked_roads, insert_blocked_road

router = APIRouter(prefix="/api", tags=["Preparedness & Routing"])

class EvacuationRequest(BaseModel):
    zone_id: str
    zone_name: str
    lat: float
    lng: float

@router.post("/evacuation-route", response_model=EvacuationRoute)
async def generate_evacuation_route(req: EvacuationRequest):
    """Calculates evacuation route from risk zone to closest safe shelter via OSRM,
    accounting for officer-reported road diversions.
    """
    route = await find_evacuation_route(
        start_lat=req.lat,
        start_lng=req.lng,
        zone_id=req.zone_id,
        zone_name=req.zone_name
    )
    if not route:
        raise HTTPException(status_code=404, detail="No suitable emergency shelter found within reachable range.")
    return route

@router.get("/blocked-roads", response_model=List[BlockedRoad])
async def get_blocked_roads():
    """Returns all active road diversions and blocks reported by officers."""
    return await fetch_blocked_roads()

@router.post("/blocked-roads", response_model=BlockedRoad)
async def create_blocked_road(req: BlockedRoadCreate):
    """Logs an officer-drawn road blockage / diversion."""
    now_iso = datetime.now(timezone.utc).isoformat()
    record = BlockedRoad(
        id=f"road-{uuid.uuid4().hex[:8]}",
        name=req.name,
        geometry=req.geometry,
        reason=req.reason,
        reported_by=req.reported_by,
        timestamp=now_iso
    )
    await insert_blocked_road(record)
    return record
