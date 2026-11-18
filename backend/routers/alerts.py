"""Active CAP alerts for the control room."""

from fastapi import APIRouter

from backend.data_sources.cap_alerts import list_active_alerts, poll_cap_feeds

router = APIRouter(prefix="/api", tags=["CAP Alerts"])


@router.get("/alerts")
async def get_alerts(refresh: bool = False):
    if refresh:
        await poll_cap_feeds(force=True)
    return await list_active_alerts()
