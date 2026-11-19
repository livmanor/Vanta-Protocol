import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal
from backend.models import Incident, IncidentCreate
from backend.db import (
    delete_incident,
    fetch_incidents,
    insert_incident,
    log_officer_decision,
    update_incident_status,
)
from backend.services.risk_engine import compute_real_risk_zones
from backend.services.triage import TriageResponse, rank_incidents

logger = logging.getLogger("incidents")

router = APIRouter(prefix="/api", tags=["Incidents Intake"])

class IncidentStatusUpdate(BaseModel):
    status: Literal["new", "assigned", "resolved"]
    officer_id: str = "Officer-ControlRoom"

@router.get("/incidents", response_model=List[Incident])
async def list_incidents():
    """Returns all real incidents logged in the system. Starts at 0."""
    return await fetch_incidents()

@router.get("/incidents/triage", response_model=TriageResponse)
async def incident_triage():
    """Rank active incidents. The score is a model output and does not dispatch a unit."""
    incidents = await fetch_incidents()
    try:
        zones = await compute_real_risk_zones()
    except Exception as exc:
        logger.warning("Triage could not read live risk zones: %s", exc)
        zones = []
    now = datetime.now(timezone.utc)
    return TriageResponse(generated_at=now.isoformat(), items=rank_incidents(incidents, zones, now))

@router.post("/incidents", response_model=Incident)
async def report_incident(req: IncidentCreate):
    """Logs an incident via Officer intake form or verified intake."""
    now_iso = datetime.now(timezone.utc).isoformat()
    incident = Incident(
        id=f"inc-{uuid.uuid4().hex[:6]}",
        lat=req.lat,
        lng=req.lng,
        type=req.type,
        urgency=req.urgency,
        people=req.people,
        vulnerable=req.vulnerable,
        message=req.message,
        timestamp=now_iso,
        status="new",
        source=req.source
    )
    await insert_incident(incident)
    return incident

@router.patch("/incidents/{incident_id}/status")
async def change_incident_status(incident_id: str, req: IncidentStatusUpdate):
    """Officer marks an incident assigned or resolved (task complete)."""
    updated = await update_incident_status(incident_id, req.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Incident not found")
    await log_officer_decision(
        decision_id=f"incident-status-{uuid.uuid4().hex[:10]}",
        decision_type="INCIDENT_STATUS_UPDATED",
        details={"incident_id": incident_id, "new_status": req.status},
        officer_id=req.officer_id,
    )
    return {"status": "ok", "incident_id": incident_id, "new_status": req.status}


@router.delete("/incidents/{incident_id}")
async def remove_incident(incident_id: str, officer_id: str = "Officer-ControlRoom"):
    """Officer removes a logged incident from the control room list."""
    deleted = await delete_incident(incident_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Incident not found")
    await log_officer_decision(
        decision_id=f"incident-delete-{uuid.uuid4().hex[:10]}",
        decision_type="INCIDENT_DELETED",
        details={"incident_id": incident_id},
        officer_id=officer_id,
    )
    return {"status": "deleted", "incident_id": incident_id}

