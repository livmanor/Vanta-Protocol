import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any, Literal, Optional

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
    previous_agent_output: Optional[dict] = None
    event_start: Optional[str] = None
    event_end: Optional[str] = None


def _require_run_all_approvals(approval: AgentRunApproval) -> None:
    if not is_configured() or not is_groq_configured():
        raise HTTPException(
            status_code=503,
            detail="Running all agents requires GEMINI_API_KEY and GROQ_API_KEY in backend .env.",
        )
    if not approval.confirm_google_processing or not approval.confirm_groq_processing:
        raise HTTPException(
            status_code=403,
            detail="Confirm both provider disclosures before running all agents.",
        )


def _agent_error_payload(exc: BaseException) -> dict[str, Any]:
    if isinstance(exc, AgentConfigurationError):
        return {"status": 503, "detail": str(exc)}
    if isinstance(exc, AgentProviderError):
        return {"status": 502, "detail": str(exc)}
    if isinstance(exc, ValueError):
        return {"status": 422, "detail": str(exc)}
    if isinstance(exc, HTTPException):
        return {"status": exc.status_code, "detail": str(exc.detail)}
    return {"status": 500, "detail": str(exc) or "Agent workflow failed"}


async def _run_all_agent_tasks(approval: AgentRunApproval) -> dict[str, Any]:
    """Run Predict, Prepare, and Respond concurrently on the same raw context (no chaining)."""
    predict_task = run_predict_agent(
        approval.language,
        event_start=approval.event_start,
        event_end=approval.event_end,
        officer_query=approval.officer_query,
        area_query=approval.area_query,
    )
    prepare_task = run_prepare_agent(
        approval.language,
        approval.officer_query,
        approval.area_query,
        None,
        approval.event_start,
        approval.event_end,
    )
    respond_task = run_respond_agent(
        approval.language,
        approval.officer_query,
        approval.area_query,
        None,
    )
    results = await asyncio.gather(predict_task, prepare_task, respond_task, return_exceptions=True)
    keys = ("predict", "prepare", "respond")
    payload: dict[str, Any] = {"predict": None, "prepare": None, "respond": None, "errors": {}}
    for key, result in zip(keys, results):
        if isinstance(result, BaseException):
            payload["errors"][key] = _agent_error_payload(result)
        else:
            payload[key] = result
    return payload


@router.get("/status")
async def agent_status():
    return {
        "provider": "Google Gemini",
        "configured": is_configured(),
        "model": settings.GEMINI_MODEL,
        "groq_configured": is_groq_configured(),
        "groq_provider": "Groq",
        "groq_model": settings.GROQ_MODEL,
        "sms_test_mode": settings.SMS_TEST_MODE,
        "sms_sender": settings.SMS_SENDER or ("Test mode — no SMS sent" if settings.SMS_TEST_MODE else "Not configured"),
        "sms_provider": settings.SMS_PROVIDER,
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
            return await run_predict_agent(
                approval.language,
                event_start=approval.event_start,
                event_end=approval.event_end,
                officer_query=approval.officer_query,
                area_query=approval.area_query,
            )
        elif agent_id == "prepare":
            return await run_prepare_agent(
                approval.language,
                approval.officer_query,
                approval.area_query,
                approval.previous_agent_output,
                approval.event_start,
                approval.event_end,
            )
        else:
            return await run_respond_agent(approval.language, approval.officer_query, approval.area_query, approval.previous_agent_output)
    except AgentConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/run-all")
async def run_all_agents(approval: AgentRunApproval):
    """Run Predict, Prepare, and Respond concurrently. Failures are returned per agent."""
    _require_run_all_approvals(approval)
    return await _run_all_agent_tasks(approval)


@router.get("/run-all/stream")
async def run_all_agents_stream(
    confirm_google_processing: bool = False,
    confirm_groq_processing: bool = False,
    language: Literal["en", "hi", "te"] = "en",
    officer_query: Optional[str] = None,
    area_query: Optional[str] = None,
    event_start: Optional[str] = None,
    event_end: Optional[str] = None,
):
    """SSE stream: emit one event per agent as each finishes (same raw context, no chaining)."""
    approval = AgentRunApproval(
        confirm_google_processing=confirm_google_processing,
        confirm_groq_processing=confirm_groq_processing,
        language=language,
        officer_query=officer_query,
        area_query=area_query,
        event_start=event_start,
        event_end=event_end,
    )
    _require_run_all_approvals(approval)

    async def event_generator():
        tasks = {
            "predict": asyncio.create_task(
                run_predict_agent(
                    approval.language,
                    event_start=approval.event_start,
                    event_end=approval.event_end,
                    officer_query=approval.officer_query,
                    area_query=approval.area_query,
                )
            ),
            "prepare": asyncio.create_task(
                run_prepare_agent(
                    approval.language,
                    approval.officer_query,
                    approval.area_query,
                    None,
                    approval.event_start,
                    approval.event_end,
                )
            ),
            "respond": asyncio.create_task(
                run_respond_agent(
                    approval.language,
                    approval.officer_query,
                    approval.area_query,
                    None,
                )
            ),
        }
        pending = set(tasks.values())
        task_to_id = {task: agent_id for agent_id, task in tasks.items()}
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                agent_id = task_to_id[task]
                try:
                    result = task.result()
                    payload = {"agent": agent_id, "ok": True, "result": result}
                except BaseException as exc:
                    payload = {"agent": agent_id, "ok": False, "error": _agent_error_payload(exc)}
                yield f"data: {json.dumps(payload)}\n\n"
        yield f"data: {json.dumps({'agent': 'done', 'ok': True})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
