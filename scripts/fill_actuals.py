"""Fill actual_rain_mm in rain_forecast_log from Open-Meteo archive API.

Usage:
    python scripts/fill_actuals.py
"""
from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import aiosqlite
import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.db import DB_PATH, init_db
from scripts.train_rainfall_forecaster import LAT, LON


async def fill_actuals() -> int:
    await init_db()
    today_str = date.today().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT for_date FROM rain_forecast_log "
            "WHERE actual_rain_mm IS NULL AND for_date < ? ORDER BY for_date ASC",
            (today_str,),
        ) as cursor:
            pending = [row["for_date"] for row in await cursor.fetchall()]

    if pending:
        start_d = pending[0]
        end_d = pending[-1]
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(
                "https://archive-api.open-meteo.com/v1/archive",
                params={
                    "latitude": LAT,
                    "longitude": LON,
                    "start_date": start_d,
                    "end_date": end_d,
                    "daily": "precipitation_sum",
                    "timezone": "Asia/Kolkata",
                },
            )
            r.raise_for_status()
            daily = r.json().get("daily", {})

        by_date = {
            d: float(v)
            for d, v in zip(daily.get("time") or [], daily.get("precipitation_sum") or [])
            if v is not None
        }

        now_iso = datetime.now(timezone.utc).isoformat()
        updated = 0
        async with aiosqlite.connect(DB_PATH) as db:
            for d in pending:
                if d in by_date:
                    await db.execute(
                        "UPDATE rain_forecast_log SET actual_rain_mm = ?, actual_filled_at = ? WHERE for_date = ?",
                        (by_date[d], now_iso, d),
                    )
                    updated += 1
            await db.commit()
        print(f"Filled actual_rain_mm for {updated}/{len(pending)} pending past date(s).")
    else:
        print("No pending past dates to fill.")

    # Print MAE comparison once 14+ days are filled
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT for_date, ml_rain_mm, open_meteo_rain_mm, actual_rain_mm "
            "FROM rain_forecast_log WHERE actual_rain_mm IS NOT NULL ORDER BY for_date ASC"
        ) as cursor:
            filled = await cursor.fetchall()

    print(f"Total days with actuals: {len(filled)}")
    if len(filled) >= 14:
        ml_mae = sum(abs(float(r["ml_rain_mm"]) - float(r["actual_rain_mm"])) for r in filled) / len(filled)
        om_mae = sum(abs(float(r["open_meteo_rain_mm"]) - float(r["actual_rain_mm"])) for r in filled) / len(filled)
        pers_errs = [
            abs(float(filled[i - 1]["actual_rain_mm"]) - float(filled[i]["actual_rain_mm"]))
            for i in range(1, len(filled))
        ]
        pers_mae = sum(pers_errs) / len(pers_errs)
        print(f"MAE over {len(filled)} filled days:")
        print(f"  ML MAE          : {ml_mae:.3f} mm")
        print(f"  Open-Meteo MAE  : {om_mae:.3f} mm")
        print(f"  Persistence MAE : {pers_mae:.3f} mm")
    else:
        print(f"Need at least 14 filled days for MAE comparison (currently {len(filled)}).")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(fill_actuals()))
