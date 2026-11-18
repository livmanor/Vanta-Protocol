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
        raise HTTPException(status_code=404, detail="No verified destination found. OpenStreetMap did not return a shelter, community centre, or hospital inside Hyderabad.")
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


class SnapRequest(BaseModel):
    lat: float
    lng: float


class SnapResponse(BaseModel):
    snapped: bool
    original_lat: float
    original_lng: float
    lat: float
    lng: float
    distance_m: float
    road_name: str


class WaypointItem(BaseModel):
    lat: float
    lng: float
    name: Optional[str] = None


class PatrolRouteRequest(BaseModel):
    waypoints: List[WaypointItem]


@router.post("/snap-to-road", response_model=SnapResponse)
async def snap_point_to_road(req: SnapRequest):
    """Snap any clicked or input coordinate to the nearest drivable road via OSRM."""
    from backend.services.routing import snap_to_nearest_road
    return await snap_to_nearest_road(req.lat, req.lng)


@router.post("/patrol-route")
async def get_patrol_route(req: PatrolRouteRequest):
    """Compute driving route connecting multiple patrol points."""
    from backend.services.routing import compute_patrol_route
    pts = [{"lat": wp.lat, "lng": wp.lng} for wp in req.waypoints]
    result = await compute_patrol_route(pts)
    if not result:
        raise HTTPException(status_code=400, detail="Could not compute patrol route across given waypoints")
    return result


