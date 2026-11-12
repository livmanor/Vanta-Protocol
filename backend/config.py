import os
from pydantic_settings import BaseSettings
from pydantic import SecretStr
from typing import Optional

class Settings(BaseSettings):
    CITY_NAME: str = "Chennai"
    DEFAULT_LAT: float = 13.0827
    DEFAULT_LNG: float = 80.2707
    BBOX_MIN_LAT: float = 12.90
    BBOX_MIN_LNG: float = 80.12
    BBOX_MAX_LAT: float = 13.20
    BBOX_MAX_LNG: float = 80.32

    OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_FLOOD_URL: str = "https://flood-api.open-meteo.com/v1/flood"
    OPEN_ELEVATION_URL: str = "https://api.open-elevation.com/api/v1/lookup"
    OVERPASS_API_URL: str = "https://overpass-api.de/api/interpreter"
    OSRM_ROUTE_URL: str = "https://router.project-osrm.org/route/v1/driving"

    WEATHER_CACHE_TTL: int = 900
    FLOOD_CACHE_TTL: int = 1800
    ELEVATION_CACHE_TTL: int = 86400
    OSM_CACHE_TTL: int = 3600

    GEMINI_API_KEY: Optional[SecretStr] = None
    GEMINI_MODEL: str = "gemini-3.8-flash"

    PORT: int = 8000
    HOST: str = "0.0.0.0"
    DATABASE_PATH: str = "vanta.db"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

