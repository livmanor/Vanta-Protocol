import calendar
import re
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
    officer_query: Optional[str] = None


class HistorySearch(BaseModel):
    query: str


def _resolve_history_query(query: str, today: date):
    text = query.casefold().strip()
    if not text:
        raise HTTPException(status_code=422, detail="Enter a question about a past rain or flood event.")

    year_match = re.search(r"\b(20\d{2})\b", text)
    if re.search(r"\b(last|previous|prior)\s+year\b", text) or "గత సంవత్సరం" in text or "पिछले साल" in text:
        year = today.year - 1
        start, end = date(year, 1, 1), date(year, 12, 31)
    elif year_match:
        year = int(year_match.group(1))
        start, end = date(year, 1, 1), date(year, 12, 31)
    else:
        period = re.search(r"\b(?:last|past)\s+(\d{1,3})\s+days?\b", text)
        if period:
            count = min(int(period.group(1)), 1825)
            end, start = today - timedelta(days=1), today - timedelta(days=count)
        else:
            end, start = today - timedelta(days=1), today - timedelta(days=90)

    if start > today - timedelta(days=1):
        raise HTTPException(status_code=422, detail="The query must refer to a completed historical period.")
    if (today - start).days > 1825:
        raise HTTPException(status_code=422, detail="History search is limited to the past five years.")

    zone_id = None
    matched_zone = None
    aliases_by_zone = {
        "hyd-hotspot-nampally-metro": ("nampally", "metro underpass"),
        "hyd-hotspot-banjara-rd12": ("banjara hills", "road no 12", "road 12"),
        "hyd-hotspot-gun-park": ("gun park", "traffic police"),
        "hyd-hotspot-chatrinaka": ("chatrinaka",),
        "hyd-hotspot-kachiguda": ("kachiguda", "6 no junction"),
        "hyd-hotspot-moosarambagh-bridge": ("moosarambagh", "ali cafe"),
    }
    for zone in REAL_ZONES_METADATA:
        aliases = [zone["name"], zone["id"].replace("hyd-hotspot-", "").replace("-", " ")]
        aliases.extend(aliases_by_zone.get(zone["id"], ()))
        if any(alias.casefold() in text for alias in aliases):
            zone_id, matched_zone = zone["id"], zone["name"]
            break
    return start, end, zone_id, matched_zone


@router.post("/search")
async def search_predict_history(search: HistorySearch):
    """Interpret a plain-language history question and retrieve matching rain events."""
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    start, end, zone_id, matched_zone = _resolve_history_query(search.query, today)
    result = await list_rain_history_events(start_date=start.isoformat(), end_date=end.isoformat())
    if zone_id:
        for event in result.get("events", []):
            event["areas"] = [area for area in event["areas"] if area["zone_id"] == zone_id]
    return {
        **result,
        "query": search.query,
        "resolved_window": {"start": start.isoformat(), "end": end.isoformat()},
        "resolved_area": matched_zone or "All mapped Hyderabad hotspots",
        "resolved_zone_id": zone_id,
    }


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
    if selection.event_start < today - timedelta(days=1825):
        raise HTTPException(status_code=422, detail="Choose an event from the available five-year history.")
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
            selection.officer_query,
        )
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
