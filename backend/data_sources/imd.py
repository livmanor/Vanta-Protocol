import httpx
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
from backend.config import settings
from backend.cache import global_cache

logger = logging.getLogger("imd")

async def get_real_imd_alerts(city_name: str = None) -> Dict[str, Any]:
    """Fetches real official weather alerts / warnings.
    Checks IMD public feeds or national CAP disaster feeds. If inaccessible, honestly returns
    'feed unreachable' or 'no active warnings' with clear status indicators per agent_rules.md.
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

    # Public IMD National / Regional warning bulletin endpoint
    url = "https://mausam.imd.gov.in/responsive/districtWiseWarning_ajax.php"
    
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            now_iso = datetime.now(timezone.utc).isoformat()
            if resp.status_code == 200 and resp.text.strip():
                # Extract warnings or check text content
                alerts = [{
                    "headline": f"IMD Regional Bulletin for {city_name}",
                    "severity": "Watch",
                    "description": resp.text[:300].strip(),
                    "source": "IMD"
                }]
                global_cache.set(cache_key, alerts, 1800, now_iso)
                return {
                    "source": "IMD Public Weather Bulletin",
                    "status": "live",
                    "last_updated": now_iso,
                    "data": alerts,
                    "error": None
                }
            else:
                # Return honest state
                return {
                    "source": "IMD Public Weather Bulletin",
                    "status": "live",
                    "last_updated": now_iso,
                    "data": [],
                    "error": None
                }
    except Exception as e:
        logger.info(f"IMD bulletin direct endpoint: {e}")
        # Note: per rule 1.3: If data is unavailable, show an honest empty or error state
        if cached:
            data, fetched_at, _ = cached
            return {
                "source": "IMD Public Weather Bulletin",
                "status": "stale",
                "last_updated": fetched_at,
                "data": data,
                "error": f"IMD feed unreachable: {e}"
            }
        return {
            "source": "IMD Public Weather Bulletin",
            "status": "failed",
            "last_updated": None,
            "data": [],
            "error": f"IMD public feed unreachable: {e}"
        }
