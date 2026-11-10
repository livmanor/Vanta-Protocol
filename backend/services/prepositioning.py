import math
from typing import List
from backend.models import Unit, RiskZone, PrepositionSuggestion
from backend.services.routing import haversine_distance_km

def generate_prepositioning_suggestions(
    units: List[Unit],
    risk_zones: List[RiskZone]
) -> List[PrepositionSuggestion]:
    """Generates human-in-the-loop prepositioning suggestions matching real registered units
    to priority risk zones based on proximity, unit capability, and risk severity.
    """
    suggestions: List[PrepositionSuggestion] = []
    
    # Filter available units
    available_units = [u for u in units if u.status == "available"]
    if not available_units:
        return []

    # Sort risk zones descending by risk level
    high_risk_zones = sorted(risk_zones, key=lambda z: z.risk_level, reverse=True)

    assigned_unit_ids = set()

    for zone in high_risk_zones:
        # Find zone centroid from polygon
        coords = zone.polygon.get("coordinates", [[]])[0]
        if not coords:
            continue
        avg_lng = sum(p[0] for p in coords) / len(coords)
        avg_lat = sum(p[1] for p in coords) / len(coords)

        # Match best available unit
        best_unit = None
        best_score = float("-inf")
        best_dist = float("inf")

        for unit in available_units:
            if unit.id in assigned_unit_ids:
                continue

            dist_km = haversine_distance_km(unit.lat, unit.lng, avg_lat, avg_lng)
            
            # Unit capability scoring
            suitability = 1.0
            if zone.risk_level >= 3:
                if unit.kind == "rescue_boat":
                    suitability = 3.0  # Boat heavily favored for severe inundation zones
                elif unit.kind == "patrol":
                    suitability = 2.0
            else:
                if unit.kind == "patrol":
                    suitability = 2.5
                elif unit.kind == "rescue_boat":
                    suitability = 1.0

            # Proximity factor (closer is better)
            score = (suitability * 10) - (dist_km * 1.5)
            if score > best_score:
                best_score = score
                best_unit = unit
                best_dist = dist_km

        if best_unit:
            assigned_unit_ids.add(best_unit.id)
            eta_mins = round((best_dist / 30.0) * 60, 1)  # Est 30km/h urban emergency response
            
            reasons = [
                f"Risk Level {zone.risk_level} area requiring {best_unit.kind.replace('_', ' ')} asset",
                f"Closest available unit ({best_dist:.1f} km from {best_unit.station})",
                f"Estimated ETA: ~{eta_mins} mins"
            ]
            if best_unit.kind == "rescue_boat":
                reasons.append("Equipped for waterborne extraction and low-elevation waterlogging")

            suggestions.append(
                PrepositionSuggestion(
                    id=f"prep-{best_unit.id}-{zone.id}",
                    unit_id=best_unit.id,
                    unit_kind=best_unit.kind,
                    current_lat=best_unit.lat,
                    current_lng=best_unit.lng,
                    station=best_unit.station,
                    target_zone_id=zone.id,
                    target_zone_name=zone.name,
                    target_lat=round(avg_lat, 5),
                    target_lng=round(avg_lng, 5),
                    risk_level=zone.risk_level,
                    distance_km=round(best_dist, 2),
                    eta_minutes=eta_mins,
                    why_this="; ".join(reasons),
                    status="recommended"
                )
            )

    return suggestions
