import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr
from typing import Optional

class Settings(BaseSettings):
    CITY_NAME: str = "Hyderabad"
    DEFAULT_LAT: float = 17.3914
    DEFAULT_LNG: float = 78.4702
    BBOX_MIN_LAT: float = 17.15
    BBOX_MIN_LNG: float = 78.30
    BBOX_MAX_LAT: float = 17.50
    BBOX_MAX_LNG: float = 78.57

    # Regional & National Bounding Boxes
    INDIA_BBOX_MIN_LAT: float = 6.5
    INDIA_BBOX_MAX_LAT: float = 37.5
    INDIA_BBOX_MIN_LON: float = 68.0
    INDIA_BBOX_MAX_LON: float = 98.0

    OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_ARCHIVE_URL: str = "https://archive-api.open-meteo.com/v1/archive"
    OPEN_METEO_FLOOD_URL: str = "https://flood-api.open-meteo.com/v1/flood"
    OPEN_ELEVATION_URL: str = "https://api.open-elevation.com/api/v1/lookup"
    OVERPASS_API_URL: str = "https://overpass-api.de/api/interpreter"
    OSRM_ROUTE_URL: str = "https://router.project-osrm.org/route/v1/driving"
    # A route this close to an officer-reported closure is treated as crossing it.
    BLOCKED_ROAD_BUFFER_M: float = 30
    # IMD heatwave screen for plains. Used only as a separate heat heuristic.
    HEAT_PLAIN_THRESHOLD_C: float = 40
    HEAT_SEVERE_APPARENT_THRESHOLD_C: float = 45

    WEATHER_CACHE_TTL: int = 900
    FLOOD_CACHE_TTL: int = 1800
    ELEVATION_CACHE_TTL: int = 86400
    OSM_CACHE_TTL: int = 3600

    GEMINI_API_KEY: Optional[SecretStr] = None
    # gemini-2.5-flash still answers today; Google documents a reroute on 2026-12-01.
    GEMINI_MODEL: str = "gemini-2.5-flash"
    # Comma-separated fallbacks tried after the primary model (empty body, schema mismatch, 429/5xx).
    GEMINI_FALLBACK_MODELS: str = "gemini-2.0-flash,gemini-flash-latest"
    GROQ_API_KEY: Optional[SecretStr] = None
    GROQ_MODEL: str = "openai/gpt-oss-20b"

    SMS_PROVIDER: str = "twilio"
    SMS_TEST_MODE: bool = True
    SMS_SENDER: str = ""
    SMS_HELPLINE: str = "[HELPLINE]"
    SMS_DLT_TEMPLATE_ID: str = ""
    SMS_STATUS_CALLBACK_URL: str = ""
    TWILIO_ACCOUNT_SID: Optional[SecretStr] = None
    TWILIO_AUTH_TOKEN: Optional[SecretStr] = None
    MSG91_AUTH_KEY: Optional[SecretStr] = None
    MSG91_TEMPLATE_ID: str = ""

    CORS_ORIGINS: str = "http://127.0.0.1:5173,http://localhost:5173"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    DATABASE_PATH: str = "vanta.db"

    # Local officer login. Passwords are bcrypt-hashed in SQLite; never logged.
    AUTH_REQUIRED: bool = True
    BOOTSTRAP_OFFICER_USERNAME: str = ""
    BOOTSTRAP_OFFICER_PASSWORD: Optional[SecretStr] = None
    BOOTSTRAP_OFFICER_DISPLAY_NAME: str = "Watch Officer"
    SESSION_TTL_HOURS: int = 12
    AUTH_COOKIE_SECURE: bool = False

    # CAP 1.2 alerts (NDMA SACHET primary; IMD CAP RSS also polled when non-empty).
    CAP_RSS_URLS: str = (
        "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml,"
        "https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml"
    )
    CAP_ALLOWED_HOSTS: str = "sachet.ndma.gov.in,cap-sources.s3.amazonaws.com"
    CAP_POLL_SECONDS: int = 300
    CAP_HTTP_TIMEOUT_SECONDS: float = 5.0
    CAP_MAX_BODY_BYTES: int = 1048576
    CAP_MAX_ITEMS_PER_POLL: int = 40
    # LGD district codes for Greater Hyderabad / GHMC–ORR overlap.
    CAP_HYD_DISTRICT_CODES: str = "507,700,518,691"
    CAP_FLOOR_ORANGE: str = "watch"
    CAP_FLOOR_RED: str = "heavy"

    # Grid resolution and boundary (overridable per deployment).
    # Defaults reproduce the original 10×12=120 cell GHMC layout.
    # Changing these changes the cell count; existing elevation cache entries remain
    # valid because elevation is keyed by cell id which encodes row/col.
    GRID_LAT_MIN: float = 17.30
    GRID_LAT_MAX: float = 17.56
    GRID_LON_MIN: float = 78.30
    GRID_LON_MAX: float = 78.62
    GRID_LAT_COUNT: int = 10
    GRID_LON_COUNT: int = 12

    # Optional DEM file for slope/terrain features.
    DEM_FILE_PATH: str = ""
    HTP_WATERLOGGING_URL: str = "https://echallan.tspolice.gov.in/htp/water_logging.html"
    HTP_ZONE_FILTER: str = "all"
    HTP_POLL_SECONDS: int = 900
    HTP_HTTP_TIMEOUT_SECONDS: float = 15.0
    HTP_MAX_BODY_BYTES: int = 2_000_000
    HTP_WEATHER_CONCURRENCY: int = 8

    # Tier A Hazard APIs
    MAP_KEY: str = ""
    NASA_FIRMS_MAP_KEY: str = ""
    USGS_EARTHQUAKE_URL: str = "https://earthquake.usgs.gov/fdsnws/event/1/query"
    IBTRACS_DATA_PATH: str = "data/ibtracs_active.json"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

# pydantic may leave an unset optional SecretStr as None
if settings.BOOTSTRAP_OFFICER_PASSWORD is None:
    from pydantic import SecretStr as _SecretStr

    settings.BOOTSTRAP_OFFICER_PASSWORD = _SecretStr("")

