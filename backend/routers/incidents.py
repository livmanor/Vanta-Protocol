import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal
from backend.models import Incident, IncidentCreate
from backend.db import fetch_incidents, insert_incident, update_incident_status

router = APIRouter(prefix="/api", tags=["Incidents Intake"])

class IncidentStatusUpdate(BaseModel):
    status: Literal["new", "assigned", "resolved"]

@router.get("/incidents", response_model=List[Incident])
async def list_incidents():
    """Returns all real incidents logged in the system. Starts at 0."""
    return await fetch_incidents()

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
    await update_incident_status(incident_id, req.status)
    return {"status": "ok", "incident_id": incident_id, "new_status": req.status}

