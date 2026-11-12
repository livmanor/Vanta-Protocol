from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from backend.agents.gemini import AgentConfigurationError, AgentProviderError, is_configured
from backend.agents.workflow import run_predict_prepare_workflow, run_predict_agent, run_prepare_agent, run_respond_agent
from backend.config import settings

router = APIRouter(prefix="/api/agents", tags=["Predict and Prepare Agents"])


class AgentRunApproval(BaseModel):
    confirm_google_processing: bool = False
    language: Literal["en", "hi", "te"] = "en"


@router.get("/status")
async def agent_status():
    return {
        "provider": "Google Gemini",
        "configured": is_configured(),
        "model": settings.GEMINI_MODEL,
        "agents": [
            {"id": "predict", "name": "Weather Predict", "goal": "Compare live risk and forecast with recent rainfall and recorded impacts."},
            {"id": "prepare", "name": "Prepare", "goal": "Build evidence-based pre-event readiness checks and positioning recommendations."},
            {"id": "respond", "name": "Respond", "goal": "Review active incidents and support officer-led response coordination."},
        ],
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
        return await run_predict_prepare_workflow(approval.language)
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/run/{agent_id}")
async def run_single_agent(agent_id: Literal["predict", "prepare", "respond"], approval: AgentRunApproval):
    """Run one selected agent; each agent has an independent goal and output."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend .env and restart the server.")
    if not approval.confirm_google_processing:
        raise HTTPException(status_code=403, detail="Confirm processing of this agent's summarized operational inputs for this run.")
    runners = {"predict": run_predict_agent, "prepare": run_prepare_agent, "respond": run_respond_agent}
    try:
        return await runners[agent_id](approval.language)
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
