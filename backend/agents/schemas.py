from typing import List

from pydantic import BaseModel, Field


class ZoneFocus(BaseModel):
    zone_id: str = Field(description="An exact zone_id from the supplied risk data")
    observation: str = Field(description="A brief observation grounded only in supplied facts")
    officer_check: str = Field(description="A practical check for the officer; do not create an action order")


class PredictAgentOutput(BaseModel):
    summary: str = Field(description="Short synthesis of the computed risk picture")
    focus_zones: List[ZoneFocus] = Field(description="Zero to three zones needing the closest review")
    data_gaps: List[str] = Field(description="Only missing or explicitly failed inputs in the supplied data")


class ZonePreparationNote(BaseModel):
    zone_id: str = Field(description="An exact zone_id from the supplied risk and preparation data")
    note: str = Field(description="Short readiness interpretation grounded only in supplied recommendations")
    officer_check: str = Field(description="A verification step for the officer, never a dispatch instruction")


class ReadinessAction(BaseModel):
    action: str = Field(description="A concise preparedness task supported by supplied forecast, historical impacts, or resource status")
    reason: str = Field(description="Which supplied evidence makes this task relevant")
    zone_id: str = Field(description="An exact supplied zone ID, or the empty string for city-wide actions")
    officer_check: str = Field(description="How an officer can verify completion; never issue dispatch orders")


class PrepareAgentOutput(BaseModel):
    summary: str = Field(description="Short synthesis of the preparedness recommendations")
    zone_notes: List[ZonePreparationNote] = Field(description="Notes for zones that have supplied recommendations")
    readiness_actions: List[ReadinessAction] = Field(default_factory=list, description="Specific pre-event readiness tasks grounded in evidence; no automatic dispatch")
    readiness_gaps: List[str] = Field(description="Missing resources or facts explicitly evident in supplied data")


class ResponsePriority(BaseModel):
    zone_id: str = Field(description="An exact supplied zone ID, or the empty string for city-wide priorities")
    situation: str = Field(description="A concise summary of reported active incidents and relevant risk facts")
    recommended_steps: List[str] = Field(description="Suggested response coordination steps for an officer to review; never issue dispatch orders")
    officer_check: str = Field(description="What the officer should verify before taking action")


class RespondAgentOutput(BaseModel):
    summary: str = Field(description="Situation summary grounded in supplied live risk and operational records")
    priorities: List[ResponsePriority] = Field(description="Ordered response areas that have supplied incident or elevated risk evidence")
    immediate_checks: List[str] = Field(description="Officer verification checks; not automated actions")
    data_gaps: List[str] = Field(description="Missing or stale sources and operational information")
