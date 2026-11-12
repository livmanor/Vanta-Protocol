from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.agents.gemini import AgentConfigurationError, AgentProviderError, is_configured
from backend.agents.workflow import run_predict_prepare_workflow
from backend.config import settings

router = APIRouter(prefix="/api/agents", tags=["Predict and Prepare Agents"])


class AgentRunApproval(BaseModel):
    confirm_google_processing: bool = False


@router.get("/status")
async def agent_status():
    return {
        "provider": "Google Gemini",
        "configured": is_configured(),
        "model": settings.GEMINI_MODEL,
        "agents": ["Predict", "Prepare"],
    }


@router.post("/run")
async def run_agents(approval: AgentRunApproval):
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend .env and restart the server.",
        )
    if not approval.confirm_google_processing:
        raise HTTPException(
            status_code=403,
            detail="Confirm that zone risk data and summarized positioning recommendations may be sent to Google Gemini for this run.",
        )
    try:
        return await run_predict_prepare_workflow()
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
