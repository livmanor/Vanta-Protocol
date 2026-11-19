"""Curated Greater Hyderabad areas for citizen field reports."""

from __future__ import annotations

from typing import Any, Optional

# Approximate landmark / neighborhood centers for map placement.
CITIZEN_AREAS: list[dict[str, Any]] = [
    {"id": "musi-river", "name": "Musi River", "lat": 17.3753, "lng": 78.4803},
    {"id": "charminar", "name": "Charminar", "lat": 17.3616, "lng": 78.4747},
    {"id": "afzalgunj", "name": "Afzalgunj", "lat": 17.3759, "lng": 78.4752},
    {"id": "chaderghat", "name": "Chaderghat", "lat": 17.3706, "lng": 78.4920},
    {"id": "malakpet", "name": "Malakpet", "lat": 17.3730, "lng": 78.4985},
    {"id": "dilsukhnagar", "name": "Dilsukhnagar", "lat": 17.3687, "lng": 78.5247},
    {"id": "lb-nagar", "name": "LB Nagar", "lat": 17.3496, "lng": 78.5500},
    {"id": "uppal", "name": "Uppal", "lat": 17.3984, "lng": 78.5583},
    {"id": "secunderabad", "name": "Secunderabad", "lat": 17.4399, "lng": 78.4983},
    {"id": "paradise", "name": "Paradise Circle", "lat": 17.4417, "lng": 78.4871},
    {"id": "begumpet", "name": "Begumpet", "lat": 17.4441, "lng": 78.4620},
    {"id": "ameerpet", "name": "Ameerpet", "lat": 17.4375, "lng": 78.4483},
    {"id": "sr-nagar", "name": "SR Nagar", "lat": 17.4435, "lng": 78.4450},
    {"id": "kukatpally", "name": "Kukatpally", "lat": 17.4849, "lng": 78.4138},
    {"id": "miyapur", "name": "Miyapur", "lat": 17.4967, "lng": 78.3915},
    {"id": "hitec-city", "name": "Hitec City", "lat": 17.4474, "lng": 78.3762},
    {"id": "gachibowli", "name": "Gachibowli", "lat": 17.4401, "lng": 78.3489},
    {"id": "madhapur", "name": "Madhapur", "lat": 17.4483, "lng": 78.3915},
    {"id": "jubilee-hills", "name": "Jubilee Hills", "lat": 17.4326, "lng": 78.4071},
    {"id": "banjara-hills", "name": "Banjara Hills", "lat": 17.4156, "lng": 78.4347},
    {"id": "mehdipatnam", "name": "Mehdipatnam", "lat": 17.3940, "lng": 78.4346},
    {"id": "attapur", "name": "Attapur", "lat": 17.3666, "lng": 78.4305},
    {"id": "tolichowki", "name": "Tolichowki", "lat": 17.3992, "lng": 78.4200},
    {"id": "koti", "name": "Koti", "lat": 17.3850, "lng": 78.4867},
    {"id": "abids", "name": "Abids", "lat": 17.3920, "lng": 78.4760},
    {"id": "nampally", "name": "Nampally", "lat": 17.3914, "lng": 78.4677},
    {"id": "tank-bund", "name": "Tank Bund", "lat": 17.4239, "lng": 78.4738},
    {"id": "hussain-sagar", "name": "Hussain Sagar", "lat": 17.4239, "lng": 78.4738},
    {"id": "kphb", "name": "KPHB Colony", "lat": 17.4932, "lng": 78.3995},
    {"id": "alwal", "name": "Alwal", "lat": 17.5030, "lng": 78.5080},
]


def list_citizen_areas() -> list[dict[str, Any]]:
    return [
        {"id": item["id"], "name": item["name"], "lat": item["lat"], "lng": item["lng"]}
        for item in CITIZEN_AREAS
    ]


def resolve_citizen_area(area_id: str | None = None, area_name: str | None = None) -> Optional[dict[str, Any]]:
    clean_id = (area_id or "").strip().lower()
    clean_name = (area_name or "").strip().lower()
    for item in CITIZEN_AREAS:
        if clean_id and item["id"] == clean_id:
            return item
        if clean_name and item["name"].lower() == clean_name:
            return item
    return None
