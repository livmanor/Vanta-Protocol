"""Citizen signup/login and field photo reports for the watch officer map."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.auth.citizens import (
    CITIZEN_SESSION_COOKIE,
    authenticate_citizen,
    citizen_for_token,
    create_report,
    get_report,
    get_report_photo,
    list_reports_for_citizen,
    list_reports_for_officers,
    logout_citizen,
    register_citizen,
    review_report,
)
from backend.auth.officer import OfficerIdentity, get_optional_officer, require_officer
from backend.auth.settings import cookie_secure
from backend.citizen_areas import list_citizen_areas, resolve_citizen_area
from backend.config import settings
from backend.db import insert_incident, log_officer_decision
from backend.models import Incident

router = APIRouter(tags=["Citizen field reports"])


class CitizenAuthBody(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(default="", max_length=80)


class CitizenLoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class ReviewBody(BaseModel):
    decision: Literal["accepted", "rejected"]
    create_incident: bool = True
    officer_id: str = "Officer-ControlRoom"


def _set_citizen_cookie(response: Response, token: str, expires_at: str) -> None:
    response.set_cookie(
        key=CITIZEN_SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )


def _clear_citizen_cookie(response: Response) -> None:
    response.delete_cookie(CITIZEN_SESSION_COOKIE, path="/")


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("Authorization") or ""
    if header.startswith("Bearer "):
        token = header[7:].strip()
        if token:
            return token
    return request.cookies.get(CITIZEN_SESSION_COOKIE)


async def require_citizen(request: Request) -> dict:
    citizen = getattr(request.state, "citizen", None)
    if citizen:
        return citizen
    profile = await citizen_for_token(_extract_token(request))
    if not profile:
        raise HTTPException(status_code=401, detail="Sign in with a citizen account.")
    request.state.citizen = profile
    return profile


@router.post("/api/citizen/register")
async def citizen_register(body: CitizenAuthBody, response: Response):
    try:
        result = await register_citizen(body.username, body.password, body.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_citizen_cookie(response, result["token"], result["expires_at"])
    return result


@router.post("/api/citizen/login")
async def citizen_login(body: CitizenLoginBody, response: Response):
    result = await authenticate_citizen(body.username, body.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    _set_citizen_cookie(response, result["token"], result["expires_at"])
    return result


@router.post("/api/citizen/logout")
async def citizen_logout(request: Request, response: Response):
    await logout_citizen(_extract_token(request))
    _clear_citizen_cookie(response)
    return {"status": "ok"}


@router.get("/api/citizen/me")
async def citizen_me(citizen: dict = Depends(require_citizen)):
    return citizen


@router.get("/api/citizen/areas")
async def citizen_areas():
    return list_citizen_areas()


@router.post("/api/citizen/reports")
async def submit_citizen_report(
    area_id: str = Form(...),
    phase: str = Form(...),
    message: str = Form(...),
    photo: UploadFile = File(...),
    citizen: dict = Depends(require_citizen),
):
    place = resolve_citizen_area(area_id=area_id)
    if not place:
        raise HTTPException(status_code=400, detail="Select an area from the list.")

    raw = await photo.read()
    content_type = (photo.content_type or "").split(";")[0].strip().lower() or "image/jpeg"
    try:
        return await create_report(
            citizen_id=citizen["id"],
            lat=float(place["lat"]),
            lng=float(place["lng"]),
            area=place["name"],
            phase=phase,
            message=message,
            photo_bytes=raw,
            content_type=content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/citizen/reports/mine")
async def my_citizen_reports(citizen: dict = Depends(require_citizen)):
    return await list_reports_for_citizen(citizen["id"])


@router.get("/api/citizen-reports")
async def officer_list_citizen_reports(
    status: Optional[str] = None,
    officer: OfficerIdentity = Depends(require_officer),
):
    _ = officer
    if status and status not in ("pending", "accepted", "rejected"):
        raise HTTPException(status_code=400, detail="status must be pending, accepted, or rejected.")
    return await list_reports_for_officers(status)


@router.get("/api/citizen-reports/{report_id}/photo")
async def citizen_report_photo(
    report_id: str,
    request: Request,
    officer: Optional[OfficerIdentity] = Depends(get_optional_officer),
):
    report = await get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    citizen = getattr(request.state, "citizen", None)
    if not citizen:
        citizen = await citizen_for_token(_extract_token(request))
    if officer is None and (not citizen or citizen["id"] != report["citizen_id"]):
        if settings.AUTH_REQUIRED:
            raise HTTPException(status_code=401, detail="Sign in to view this photo.")
    photo = await get_report_photo(report_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo file missing.")
    path, content_type = photo
    return FileResponse(path, media_type=content_type)


@router.post("/api/citizen-reports/{report_id}/review")
async def officer_review_citizen_report(
    report_id: str,
    body: ReviewBody,
    officer: OfficerIdentity = Depends(require_officer),
):
    report = await get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Report already {report['status']}.")

    linked_incident_id = None
    if body.decision == "accepted" and body.create_incident:
        now_iso = datetime.now(timezone.utc).isoformat()
        linked_incident_id = f"inc-{uuid.uuid4().hex[:6]}"
        phase_note = {
            "before": "pre-disaster citizen photo",
            "during": "during-event citizen photo",
            "after": "post-disaster citizen photo",
        }.get(report["phase"], "citizen photo")
        incident = Incident(
            id=linked_incident_id,
            lat=report["lat"],
            lng=report["lng"],
            type="flood",
            urgency=3,
            people=0,
            vulnerable=False,
            message=(
                f"[Citizen {phase_note}"
                + (f" · {report['area']}" if report.get("area") else "")
                + f"] {report['message']}"
            ),
            timestamp=now_iso,
            status="new",
            source=f"citizen_report:{report_id}",
        )
        await insert_incident(incident)

    try:
        updated = await review_report(
            report_id,
            decision=body.decision,
            officer_id=body.officer_id or officer.officer_id,
            linked_incident_id=linked_incident_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Report not found") from exc

    await log_officer_decision(
        decision_id=f"citizen-review-{uuid.uuid4().hex[:10]}",
        decision_type=f"CITIZEN_REPORT_{body.decision.upper()}",
        details={
            "report_id": report_id,
            "linked_incident_id": linked_incident_id,
            "citizen_id": report["citizen_id"],
        },
        officer_id=body.officer_id or officer.officer_id,
    )
    return updated
