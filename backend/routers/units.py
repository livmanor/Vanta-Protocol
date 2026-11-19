import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal
from backend.models import Unit, UnitCreate, PrepositionSuggestion
from backend.db import (
    delete_unit,
    fetch_units,
    insert_unit,
    log_officer_decision,
    update_unit_status,
)
from backend.services.risk_engine import compute_real_risk_zones
from backend.services.prepositioning import generate_prepositioning_suggestions

router = APIRouter(prefix="/api", tags=["Units & Prepositioning"])

class StatusUpdateRequest(BaseModel):
    status: Literal["available", "assigned"]
    officer_id: str = "Officer-ControlRoom"

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
    """Officer marks a unit available (task complete) or assigned."""
    updated = await update_unit_status(unit_id, req.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Unit not found")
    await log_officer_decision(
        decision_id=f"unit-status-{uuid.uuid4().hex[:10]}",
        decision_type="UNIT_STATUS_UPDATED",
        details={"unit_id": unit_id, "new_status": req.status},
        officer_id=req.officer_id,
    )
    return {"status": "ok", "unit_id": unit_id, "new_status": req.status}


@router.delete("/units/{unit_id}")
async def remove_unit(unit_id: str, officer_id: str = "Officer-ControlRoom"):
    """Officer removes a registered unit from the control room roster."""
    deleted = await delete_unit(unit_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Unit not found")
    await log_officer_decision(
        decision_id=f"unit-delete-{uuid.uuid4().hex[:10]}",
        decision_type="UNIT_DELETED",
        details={"unit_id": unit_id},
        officer_id=officer_id,
    )
    return {"status": "deleted", "unit_id": unit_id}

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

