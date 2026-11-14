from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal, Optional

from backend.agents.gemini import AgentConfigurationError, AgentProviderError, is_configured
from backend.agents.groq import is_configured as is_groq_configured
from backend.agents.workflow import run_predict_prepare_workflow, run_predict_agent, run_prepare_agent, run_respond_agent
from backend.config import settings

router = APIRouter(prefix="/api/agents", tags=["Predict and Prepare Agents"])


class AgentRunApproval(BaseModel):
    confirm_google_processing: bool = False
    confirm_groq_processing: bool = False
    language: Literal["en", "hi", "te"] = "en"
    officer_query: Optional[str] = None
    area_query: Optional[str] = None


@router.get("/status")
async def agent_status():
    return {
        "provider": "Google Gemini",
        "configured": is_configured(),
        "model": settings.GEMINI_MODEL,
        "groq_configured": is_groq_configured(),
        "groq_provider": "Groq",
        "groq_model": settings.GROQ_MODEL,
        "agents": [
            {"id": "predict", "name": "Weather Predict", "goal": "Compare live risk and forecast with recent rainfall and recorded impacts."},
            {"id": "prepare", "name": "Prepare", "goal": "Build evidence-based pre-event readiness checks and positioning recommendations."},
            {"id": "respond", "name": "Respond", "goal": "Review active incidents and support officer-led response coordination."},
        ],
    }


@router.post("/run")
async def run_agents(approval: AgentRunApproval):
    if not is_configured() or not is_groq_configured():
        raise HTTPException(
            status_code=503,
            detail="The combined workflow requires GEMINI_API_KEY and GROQ_API_KEY in backend .env.",
        )
    if not approval.confirm_google_processing or not approval.confirm_groq_processing:
        raise HTTPException(
            status_code=403,
            detail="Confirm both provider disclosures before running the combined Groq and Gemini workflow.",
        )
    try:
        return await run_predict_prepare_workflow(approval.language)
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/run/{agent_id}")
async def run_single_agent(agent_id: Literal["predict", "prepare", "respond"], approval: AgentRunApproval):
    """Run one selected agent; each agent has an independent goal and output."""
    provider_ready = is_groq_configured() if agent_id == "predict" else is_configured()
    provider_name = "Groq" if agent_id == "predict" else "Google Gemini"
    confirmed = approval.confirm_groq_processing if agent_id == "predict" else approval.confirm_google_processing
    if not provider_ready:
        key_name = "GROQ_API_KEY" if agent_id == "predict" else "GEMINI_API_KEY"
        raise HTTPException(status_code=503, detail=f"{provider_name} is not configured. Set {key_name} in backend .env and restart the server.")
    if not confirmed:
        raise HTTPException(status_code=403, detail=f"Confirm processing of this agent's summarized operational inputs by {provider_name} for this run.")
    try:
        if agent_id == "predict":
            return await run_predict_agent(approval.language, officer_query=approval.officer_query, area_query=approval.area_query)
        elif agent_id == "prepare":
            return await run_prepare_agent(approval.language, approval.officer_query, approval.area_query)
        else:
            return await run_respond_agent(approval.language, approval.officer_query, approval.area_query)
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
