"""Part 5: Quantify train/serve feature mismatch and test historical-forecast API.

1. Fetches the last 60 complete days from both Open-Meteo archive API and
   Open-Meteo forecast API, builds features identically, and prints the
   mean absolute difference for each feature.
2. Tests historical-forecast-api.open-meteo.com from 2022-01-01 onward in
   1-year chunks; if it works, evaluates whether training on it improves
   the 2024+ held-out metrics.
"""
from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.train_rainfall_forecaster import (
    DAILY,
    FEATURES,
    HEAVY_MM,
    LAT,
    LON,
    build,
    evaluate_and_optionally_save,
)


def check_60d_mismatch() -> None:
    today = date.today()
    end_archive = today - timedelta(days=5)
    start_archive = end_archive - timedelta(days=105)  # 30d warmup + 60+ overlapping days

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r_arch = client.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": LAT,
                "longitude": LON,
                "start_date": start_archive.isoformat(),
                "end_date": end_archive.isoformat(),
                "daily": ",".join(DAILY),
                "timezone": "Asia/Kolkata",
            },
        )
        r_arch.raise_for_status()
        d_arch = pd.DataFrame(r_arch.json()["daily"]).rename(columns={"time": "date"})
        d_arch["date"] = pd.to_datetime(d_arch["date"])
        d_arch = d_arch.set_index("date").sort_index()

        # Forecast API allows past_days up to 92
        r_fc = client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": LAT,
                "longitude": LON,
                "daily": ",".join(DAILY),
                "past_days": 92,
                "forecast_days": 1,
                "timezone": "Asia/Kolkata",
            },
        )
        r_fc.raise_for_status()
        d_fc = pd.DataFrame(r_fc.json()["daily"]).rename(columns={"time": "date"})
        d_fc["date"] = pd.to_datetime(d_fc["date"])
        d_fc = d_fc.set_index("date").sort_index().iloc[:-1]  # drop today

    f_arch = build(d_arch, for_inference=True)
    f_fc = build(d_fc, for_inference=True)

    common = f_arch.index.intersection(f_fc.index)
    if len(common) > 60:
        common = common[-60:]

    print("=" * 70)
    print(f"TRAIN/SERVE FEATURE MISMATCH (last {len(common)} overlapping complete days)")
    print(f"Window: {common[0].date()} -> {common[-1].date()}")
    print(f"  {'Feature':<32} | {'Mean Abs Diff':>14} | {'Archive Mean':>12} | {'Forecast Mean':>13}")
    print("  " + "-" * 78)
    for col in FEATURES:
        a = f_arch.loc[common, col].astype(float)
        b = f_fc.loc[common, col].astype(float)
        mad = float(np.nanmean(np.abs(a - b)))
        print(f"  {col:<32} | {mad:>14.4f} | {float(np.nanmean(a)):>12.4f} | {float(np.nanmean(b)):>13.4f}")
    print("=" * 70)


def check_historical_forecast_chunks() -> None:
    print("\nTesting historical-forecast-api.open-meteo.com from 2022-01-01 in 1-year chunks …")
    end_date = date.today() - timedelta(days=1)
    chunks = []
    cur = date(2022, 1, 1)
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        while cur <= end_date:
            chunk_end = min(date(cur.year, 12, 31), end_date)
            try:
                r = client.get(
                    "https://historical-forecast-api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": LAT,
                        "longitude": LON,
                        "start_date": cur.isoformat(),
                        "end_date": chunk_end.isoformat(),
                        "daily": ",".join(DAILY),
                        "timezone": "Asia/Kolkata",
                    },
                )
                r.raise_for_status()
                daily = r.json().get("daily", {})
                if not daily.get("time"):
                    print(f"  Chunk {cur}..{chunk_end}: empty")
                    cur = date(cur.year + 1, 1, 1)
                    continue
                df_c = pd.DataFrame(daily).rename(columns={"time": "date"})
                df_c["date"] = pd.to_datetime(df_c["date"])
                df_c = df_c.set_index("date").sort_index()
                print(f"  Chunk {cur}..{chunk_end}: {len(df_c)} rows OK")
                chunks.append(df_c)
            except Exception as exc:
                print(f"  Chunk {cur}..{chunk_end} FAILED: {exc}")
                return
            time.sleep(0.5)
            cur = date(cur.year + 1, 1, 1)

    if not chunks:
        print("No chunks succeeded.")
        return

    full_hf = pd.concat(chunks).sort_index()
    full_hf = full_hf[~full_hf.index.duplicated(keep="last")]
    print(f"\nEvaluating model trained on historical-forecast ({full_hf.index[0].date()} -> {full_hf.index[-1].date()}):")
    evaluate_and_optionally_save(
        heavy_mm=HEAVY_MM,
        save=False,
        raw_df=full_hf,
        source_url="https://historical-forecast-api.open-meteo.com/v1/forecast",
        data_source_label="historical-forecast",
    )


if __name__ == "__main__":
    check_60d_mismatch()
    check_historical_forecast_chunks()
