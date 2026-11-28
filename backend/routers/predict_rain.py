"""GET /api/predict/rain and /api/predict/rain/scorecard."""
from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.db import get_rain_forecast_scorecard
from backend.services.ml_model import predict_live

router = APIRouter(prefix="/api", tags=["Predict"])
logger = logging.getLogger("vanta.predict_rain")


@router.get("/predict/rain")
async def rain_prediction():
    """Return next-day rainfall prediction from the trained ML model.

    Cached for ~1 hour. Returns 503 when the model bundle does not exist.
    """
    result = await predict_live()
    if result is None:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "ML model not trained yet. Run scripts/train_rainfall_forecaster.py first.",
                "trained": False,
            },
        )
    return {**result, "trained": True}


@router.get("/predict/rain/scorecard")
async def rain_prediction_scorecard():
    """Return logged prediction counts and MAE comparison (no winner before 30 days)."""
    return await get_rain_forecast_scorecard()
