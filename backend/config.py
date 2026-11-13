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

    WEATHER_CACHE_TTL: int = 900
    FLOOD_CACHE_TTL: int = 1800
    ELEVATION_CACHE_TTL: int = 86400
    OSM_CACHE_TTL: int = 3600

    GEMINI_API_KEY: Optional[SecretStr] = None
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GROQ_API_KEY: Optional[SecretStr] = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    PORT: int = 8000
    HOST: str = "0.0.0.0"
    DATABASE_PATH: str = "vanta.db"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

