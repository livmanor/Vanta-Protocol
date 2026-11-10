import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal
from backend.models import Unit, UnitCreate, PrepositionSuggestion
from backend.db import fetch_units, insert_unit, update_unit_status, log_officer_decision
from backend.services.risk_engine import compute_real_risk_zones
from backend.services.prepositioning import generate_prepositioning_suggestions

router = APIRouter(prefix="/api", tags=["Units & Prepositioning"])

class StatusUpdateRequest(BaseModel):
    status: Literal["available", "assigned"]

class ApprovePrepositionRequest(BaseModel):
    suggestion_id: str
    unit_id: str
    target_zone_name: str
    officer_id: str = "Officer-ControlRoom"

@router.get("/units", response_model=List[Unit])
async def list_units():
    """Returns all registered units. The database starts with 0 units until registered."""
    return await fetch_units()

@router.post("/units", response_model=Unit)
async def register_unit(req: UnitCreate):
    """Registers a real unit (patrol vehicle, rescue boat, ambulance) with live position."""
    now_iso = datetime.now(timezone.utc).isoformat()
    unit_id = req.id if req.id else f"unit-{uuid.uuid4().hex[:6]}"
    unit = Unit(
        id=unit_id,
        kind=req.kind,
        lat=req.lat,
        lng=req.lng,
        capacity=req.capacity,
        status="available",
        station=req.station,
        position_updated_at=now_iso
    )
    await insert_unit(unit)
    return unit

@router.patch("/units/{unit_id}/status")
async def change_unit_status(unit_id: str, req: StatusUpdateRequest):
    await update_unit_status(unit_id, req.status)
    return {"status": "ok", "unit_id": unit_id, "new_status": req.status}

@router.get("/prepositioning-suggestions", response_model=List[PrepositionSuggestion])
async def get_prepositioning_suggestions():
    """Generates AI-assisted patrol and rescue pre-positioning suggestions
    matching registered available units to high-risk flood/cyclone zones.
    """
    units = await fetch_units()
    if not units:
        return []
    risk_zones = await compute_real_risk_zones()
    return generate_prepositioning_suggestions(units, risk_zones)

@router.post("/prepositioning/approve")
async def approve_prepositioning(req: ApprovePrepositionRequest):
    """Human-in-the-loop: Officer confirms a prepositioning recommendation."""
    # Update unit status to assigned
    await update_unit_status(req.unit_id, "assigned")
    # Log the decision in audit trail
    await log_officer_decision(
        decision_id=req.suggestion_id,
        decision_type="PREPOSITION_APPROVED",
        details={
            "unit_id": req.unit_id,
            "target_zone": req.target_zone_name,
            "approved_by": req.officer_id
        },
        officer_id=req.officer_id
    )
    return {
        "status": "approved",
        "suggestion_id": req.suggestion_id,
        "unit_id": req.unit_id,
        "message": f"Pre-positioning to {req.target_zone_name} officially approved and dispatched."
    }

