"""Historical replay endpoint. Never writes incidents, units, SMS, or calendar rows."""
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query

from backend.services.replay import build_replay

router = APIRouter(prefix="/api", tags=["Replay"])


@router.get("/replay")
async def get_replay(date_str: str = Query(..., alias="date", description="IST calendar day YYYY-MM-DD")):
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD") from exc
    if day > date.today():
        raise HTTPException(status_code=400, detail="Replay date cannot be in the future")
    try:
        return await build_replay(day)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Replay failed: {exc}") from exc
