import httpx
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List
from backend.config import settings
from backend.cache import global_cache

logger = logging.getLogger("imd")

# IMD public endpoints in fallback order.
# The old /responsive/districtWiseWarning_ajax.php no longer exists (HTTP 404 as of Nov 2026).
# Using the publicly accessible district warning page and national bulletin RSS.
IMD_ENDPOINTS = [
    # District warnings API (JSON)
    "https://mausam.imd.gov.in/api/warning_district.php",
    # National Weather Bulletins page (HTML scrape for active alerts)
    "https://mausam.imd.gov.in/responsive/warning_national.php",
    # Fallback: IMD RSS feed
    "https://mausam.imd.gov.in/rss.php",
]

STATE_CODE = "Telangana"


async def get_real_imd_alerts(city_name: str = None) -> Dict[str, Any]:
    """Fetches real official weather alerts / warnings from IMD public endpoints.
    Per agent_rules.md §1.3: If data is unavailable, show an honest empty or error state.
    Per agent_rules.md §1.4: Source name, last_updated, and status must be visible in the UI.
    """
    if city_name is None:
        city_name = settings.CITY_NAME

    cache_key = f"imd_alerts_{city_name.lower()}"
    cached = global_cache.get(cache_key)
    if cached:
        data, fetched_at, is_stale = cached
        return {
            "source": "IMD Public Weather Bulletin",
            "status": "stale" if is_stale else "live",
            "last_updated": fetched_at,
            "data": data,
            "error": None
        }

    headers = {
        "User-Agent": "VantaProtocol/1.0 (disaster-response-research)",
        "Accept": "application/json, text/html, text/xml, */*",
    }
    now_iso = datetime.now(timezone.utc).isoformat()

    # Try each endpoint in order
    for endpoint in IMD_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(endpoint, headers=headers)
                if resp.status_code != 200:
                    logger.debug(f"IMD endpoint {endpoint} returned {resp.status_code}")
                    continue

                content = resp.text.strip()
                if not content:
                    continue

                alerts = _parse_imd_response(endpoint, content, city_name)
                global_cache.set(cache_key, alerts, 1800, now_iso)
                return {
                    "source": "IMD Public Weather Bulletin",
                    "status": "live",
                    "last_updated": now_iso,
                    "data": alerts,
                    "error": None
                }

        except Exception as e:
            logger.debug(f"IMD endpoint {endpoint} error: {e}")
            continue

    # All endpoints failed — per rule §1.3, honest empty state, never fabricate
    logger.warning("All IMD endpoints unreachable or returned no content")
    return {
        "source": "IMD Public Weather Bulletin",
        "status": "failed",
        "last_updated": now_iso,
        "data": [],
        "error": "IMD public feeds currently unreachable. No warnings being displayed."
    }


def _parse_imd_response(endpoint: str, content: str, city_name: str) -> List[Dict]:
    """Attempts to extract structured alert info from whatever IMD returns.
    Returns an empty list rather than fabricating if no match found.
    """
    alerts = []

    if "json" in endpoint or content.startswith("{") or content.startswith("["):
        # Try JSON parse
        try:
            import json
            data = json.loads(content)
            if isinstance(data, list):
                for item in data[:5]:
                    if isinstance(item, dict):
                        alerts.append({
                            "headline": item.get("warning", item.get("headline", "IMD Warning")),
                            "severity": item.get("severity", "Watch"),
                            "description": str(item)[:200],
                            "source": "IMD"
                        })
            elif isinstance(data, dict):
                alerts.append({
                    "headline": data.get("warning", f"IMD Bulletin for {city_name}"),
                    "severity": "Watch",
                    "description": str(data)[:200],
                    "source": "IMD"
                })
        except Exception:
            pass

    if not alerts and ("<html" in content.lower() or "<rss" in content.lower()):
        # Extract text between common warning tags
        patterns = [
            r'<title>([^<]{10,200})</title>',
            r'warning[^>]*>([^<]{10,200})<',
            r'<description>([^<]{10,200})</description>',
        ]
        for pat in patterns:
            matches = re.findall(pat, content, re.IGNORECASE)
            for m in matches[:3]:
                text = m.strip()
                # Only include meaningful, non-boilerplate entries
                if len(text) > 15 and "India Meteorological" not in text and "mausam.imd" not in text:
                    alerts.append({
                        "headline": text[:120],
                        "severity": "Watch",
                        "description": text,
                        "source": "IMD"
                    })
            if alerts:
                break

    return alerts
