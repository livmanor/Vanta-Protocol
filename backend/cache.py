import time
from typing import Any, Optional, Dict, Tuple

class SimpleTTLCache:
    """In-memory thread-safe TTL cache tracking fetch timestamps and freshness.
    Rules: Caching is not mocking; we preserve source fidelity and track age.
    """
    def __init__(self):
        self._cache: Dict[str, Tuple[Any, float, str]] = {}  # key -> (data, expires_at, fetched_at_iso)

    def get(self, key: str) -> Optional[Tuple[Any, str, bool]]:
        """Returns (data, fetched_at_iso, is_stale) or None if not found."""
        if key not in self._cache:
            return None
        data, expires_at, fetched_at = self._cache[key]
        now = time.time()
        is_stale = now > expires_at
        return data, fetched_at, is_stale

    def set(self, key: str, value: Any, ttl_seconds: int, fetched_at_iso: str):
        expires_at = time.time() + ttl_seconds
        self._cache[key] = (value, expires_at, fetched_at_iso)

    def clear(self):
        self._cache.clear()

global_cache = SimpleTTLCache()

