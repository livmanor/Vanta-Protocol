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


class PrepareAgentOutput(BaseModel):
    summary: str = Field(description="Short synthesis of the preparedness recommendations")
    zone_notes: List[ZonePreparationNote] = Field(description="Notes for zones that have supplied recommendations")
    readiness_gaps: List[str] = Field(description="Missing resources or facts explicitly evident in supplied data")
