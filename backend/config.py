import os
from pydantic_settings import BaseSettings
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
    # Current Flash id. gemini-2.5-flash is limited to existing users and reroutes on 2026-12-01.
    GEMINI_MODEL: str = "gemini-3.8-flash"
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

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

