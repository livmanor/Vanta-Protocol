"""Leak-free evaluation script for the Hyderabad next-day rainfall forecaster.

Fetches real Open-Meteo data, retrains in memory on data strictly before
2024-01-01 using the exact same hyperparameters as training, and evaluates on
2024-01-01 onward. Never loads or evaluates the saved model.joblib.

Usage:
    python -m scripts.evaluate_rainfall
"""
from __future__ import annotations

import sys

from scripts.train_rainfall_forecaster import HEAVY_MM, evaluate_and_optionally_save


def main() -> int:
    code, _ = evaluate_and_optionally_save(heavy_mm=HEAVY_MM, save=False)
    return code


if __name__ == "__main__":
    sys.exit(main())
