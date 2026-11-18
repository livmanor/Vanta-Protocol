"""Match a coordinate to a risk zone. Point hotspots match within 500 m."""
import math
from typing import List

from backend.models import RiskZone


def point_in_ring(lng: float, lat: float, ring: List[List[float]]) -> bool:
    inside = False
    previous = ring[-1] if ring else None
    for current in ring:
        if previous:
            x1, y1 = previous[0], previous[1]
            x2, y2 = current[0], current[1]
            if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / ((y2 - y1) or 1e-12) + x1:
                inside = not inside
        previous = current
    return inside


def zone_for_point(lng: float, lat: float, zones: List[RiskZone]) -> str:
    # Point risk locations are fixed HTP waterlogging hotspots, not polygons.
    # Attribute an incident only when it is within 500 m of a mapped hotspot.
    for zone in zones:
        geometry = zone.polygon or {}
        if geometry.get("type") == "Point":
            point_lng, point_lat = geometry.get("coordinates", [None, None])
            if point_lng is not None and point_lat is not None:
                lat_delta = math.radians(lat - point_lat)
                lng_delta = math.radians(lng - point_lng)
                a = math.sin(lat_delta / 2) ** 2 + math.cos(math.radians(point_lat)) * math.cos(math.radians(lat)) * math.sin(lng_delta / 2) ** 2
                distance_m = 6_371_000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                if distance_m <= 500:
                    return zone.id
            continue
        polygons = geometry.get("coordinates", [])
        if geometry.get("type") == "Polygon":
            polygons = [polygons]
        for polygon in polygons:
            if polygon and point_in_ring(lng, lat, polygon[0]) and not any(point_in_ring(lng, lat, hole) for hole in polygon[1:]):
                return zone.id
    return "unmapped"
