"""Rank active incidents. This is a screening model, not a dispatch decision."""
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field

from backend.models import Incident, RiskZone
from backend.services.zone_match import zone_for_point

MODEL_LABEL = "Model output, not a confirmed fact."
TYPE_WEIGHT = {
    "trapped": 30,
    "medical": 25,
    "fire": 22,
    "flood": 18,
    "road_blocked": 8,
}
URGENCY_PER_LEVEL = 10
PEOPLE_PER_PERSON = 2
PEOPLE_CAP = 20
VULNERABLE_WEIGHT = 15
ZONE_RISK_PER_LEVEL = 4


class TriageItem(BaseModel):
    incident_id: str
    score: float
    rank: int
    why_this: str
    zone_id: str
    label: str = MODEL_LABEL


class TriageResponse(BaseModel):
    generated_at: str
    label: str = MODEL_LABEL
    note: str = "Triage only ranks active incidents. It does not assign units or dispatch."
    items: List[TriageItem] = Field(default_factory=list)


def _reported_at(timestamp: str) -> Optional[datetime]:
    try:
        reported = datetime.fromisoformat(timestamp)
    except (TypeError, ValueError):
        return None
    if reported.tzinfo is None:
        reported = reported.replace(tzinfo=timezone.utc)
    return reported


def _age_weight(timestamp: str, now: datetime) -> tuple[float, str]:
    reported = _reported_at(timestamp)
    if reported is None:
        return 0, "Report age unavailable +0"
    hours = max(0.0, (now - reported).total_seconds() / 3600)
    if hours < 1:
        weight = 15
    elif hours < 6:
        weight = 8
    elif hours < 24:
        weight = 3
    else:
        weight = 0
    return weight, f"Report age {hours:.1f} h +{weight}"


def _score_incident(incident: Incident, zones: List[RiskZone], now: datetime) -> tuple[float, str, str]:
    type_weight = TYPE_WEIGHT.get(incident.type, 0)
    urgency_weight = incident.urgency * URGENCY_PER_LEVEL
    people_counted = min(incident.people, PEOPLE_CAP)
    people_weight = people_counted * PEOPLE_PER_PERSON
    if incident.people > PEOPLE_CAP:
        people_text = f"People {incident.people} capped at {PEOPLE_CAP} +{people_weight}"
    else:
        people_text = f"People {people_counted} +{people_weight}"
    vulnerable_weight = VULNERABLE_WEIGHT if incident.vulnerable else 0
    age_weight, age_text = _age_weight(incident.timestamp, now)
    zone_id = zone_for_point(incident.lng, incident.lat, zones)
    zone = next((item for item in zones if item.id == zone_id), None)
    if zone is None or zone.risk_level is None:
        zone_weight = 0
        zone_text = "Zone risk unavailable +0"
    else:
        zone_weight = zone.risk_level * ZONE_RISK_PER_LEVEL
        zone_text = f"Zone risk level {zone.risk_level} +{zone_weight}"
    score = type_weight + urgency_weight + people_weight + vulnerable_weight + age_weight + zone_weight
    why = (
        f"{MODEL_LABEL} Triage ranks this report and does not assign a unit. "
        f"Type {incident.type} +{type_weight}. "
        f"Urgency {incident.urgency} +{urgency_weight}. "
        f"{people_text}. "
        f"Vulnerable {'yes' if incident.vulnerable else 'no'} +{vulnerable_weight}. "
        f"{age_text}. {zone_text}. Total {score:g}."
    )
    return score, why, zone_id


def rank_incidents(incidents: List[Incident], zones: List[RiskZone], now: datetime) -> List[TriageItem]:
    active = [incident for incident in incidents if incident.status in ("new", "assigned")]
    scored = []
    for incident in active:
        score, why, zone_id = _score_incident(incident, zones, now)
        reported = _reported_at(incident.timestamp)
        scored.append((score, reported or datetime.min.replace(tzinfo=timezone.utc), incident.id, why, zone_id))
    scored.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    return [
        TriageItem(incident_id=incident_id, score=score, rank=index, why_this=why, zone_id=zone_id)
        for index, (score, _reported, incident_id, why, zone_id) in enumerate(scored, start=1)
    ]
