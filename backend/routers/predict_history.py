from datetime import date, datetime, timedelta
from typing import Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.agents.gemini import AgentConfigurationError, AgentProviderError, is_configured
from backend.agents.workflow import list_rain_history_events, run_predict_agent
from backend.services.risk_engine import REAL_ZONES_METADATA

router = APIRouter(prefix="/api/agents/predict", tags=["Predict history"])


class PredictHistoryRun(BaseModel):
    confirm_google_processing: bool = False
    language: Literal["en", "hi", "te"] = "en"
    event_start: date
    event_end: date
    zone_id: Optional[str] = None


@router.get("/events")
async def predict_history_events(days: int = Query(default=90, ge=7, le=90)):
    """Return rainfall event windows with hotspot-level, app-recorded impact counts."""
    return await list_rain_history_events(days)


@router.post("/run")
async def run_predict_for_selected_history(selection: PredictHistoryRun):
    if not is_configured():
        raise HTTPException(status_code=503, detail="Gemini API is not configured. Add GEMINI_API_KEY to the local .env and restart the backend.")
    if not selection.confirm_google_processing:
        raise HTTPException(status_code=403, detail="Confirm that the selected rainfall event and summarized impact counts may be sent to Google Gemini for this run.")

    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    if selection.event_start > selection.event_end:
        raise HTTPException(status_code=422, detail="The event start date must be before its end date.")
    if selection.event_end >= today:
        raise HTTPException(status_code=422, detail="Choose a completed historical event.")
    if selection.event_start < today - timedelta(days=90):
        raise HTTPException(status_code=422, detail="Choose an event from the available 90-day history.")
    if (selection.event_end - selection.event_start).days > 14:
        raise HTTPException(status_code=422, detail="A selected rainfall event cannot exceed 14 days.")
    if selection.zone_id and selection.zone_id not in {zone["id"] for zone in REAL_ZONES_METADATA}:
        raise HTTPException(status_code=422, detail="Choose one of the mapped Hyderabad hotspots.")

    try:
        return await run_predict_agent(
            selection.language,
            selection.event_start.isoformat(),
            selection.event_end.isoformat(),
            selection.zone_id,
        )
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
