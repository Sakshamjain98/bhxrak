from __future__ import annotations

import asyncio
import os
from datetime import date, datetime, time, timedelta, timezone
from statistics import quantiles
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ELEXON_API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
UTC = timezone.utc
# Decision (trading) days. Each decision buys power for the following delivery day.
DEFAULT_START = date(2026, 1, 1)
DEFAULT_END = date(2026, 1, 31)
# 09:00 UK, just ahead of the GB day-ahead auction gate closures (EPEX 09:20, N2EX 09:50).
# January is GMT, so UK time == UTC for the default range.
DEFAULT_CUTOFF_HOUR = 9
# WINDFOR horizons reach ~2 days ahead, so pull publishes from 2 days before the first decision.
FORECAST_LOOKBACK_DAYS = 2

app = FastAPI(title="WindLens API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)

# shortcut: unbounded in-process cache of raw Elexon rows; fine because the range is capped
# to historical windows of <=31 days. Swap for Redis/TTL cache if live ranges are added.
_cache: dict[tuple[date, date], tuple[list[dict[str, Any]], list[dict[str, Any]]]] = {}


async def fetch_dataset(
    client: httpx.AsyncClient, dataset: str, params: dict[str, str]
) -> list[dict[str, Any]]:
    response = await client.get(f"{ELEXON_API}/{dataset}/stream", params=params)
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else payload.get("data", [])


async def fetch_rows(start: date, end: date) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if (start, end) not in _cache:
        async with httpx.AsyncClient(timeout=45) as client:
            _cache[(start, end)] = await asyncio.gather(
                fetch_dataset(client, "FUELHH", {
                    "settlementDateFrom": (start + timedelta(days=1)).isoformat(),
                    "settlementDateTo": (end + timedelta(days=1)).isoformat(),
                    "fuelType": "WIND",
                }),
                fetch_dataset(client, "WINDFOR", {
                    "publishDateTimeFrom": datetime.combine(
                        start - timedelta(days=FORECAST_LOOKBACK_DAYS), time.min, UTC).isoformat(),
                    "publishDateTimeTo": datetime.combine(
                        end + timedelta(days=1), time.min, UTC).isoformat(),
                }),
            )
    return _cache[(start, end)]


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0


def build_analysis(
    actual_rows: list[dict[str, Any]],
    forecast_rows: list[dict[str, Any]],
    start: date,
    end: date,
    cutoff_hour: int = DEFAULT_CUTOFF_HOUR,
) -> dict[str, Any]:
    """Pair each delivery hour with the latest WINDFOR forecast published by the decision cutoff.

    A decision made on day D (at cutoff_hour UTC) covers delivery day D+1. Forecasts published
    after the cutoff are ignored so the analysis never uses information the trader did not have.
    """
    actuals: dict[datetime, float] = {}
    for row in actual_rows:
        if row.get("fuelType") == "WIND" and row.get("startTime") and row.get("generation") is not None:
            actuals[parse_time(row["startTime"])] = float(row["generation"])

    first_delivery, last_delivery = start + timedelta(days=1), end + timedelta(days=1)
    chosen: dict[datetime, tuple[datetime, float]] = {}
    for row in forecast_rows:
        if not row.get("startTime") or not row.get("publishTime") or row.get("generation") is None:
            continue
        target, published = parse_time(row["startTime"]), parse_time(row["publishTime"])
        if not first_delivery <= target.date() <= last_delivery:
            continue
        cutoff = datetime.combine(target.date() - timedelta(days=1), time(cutoff_hour), UTC)
        if published <= cutoff and (target not in chosen or published > chosen[target][0]):
            chosen[target] = (published, float(row["generation"]))

    points: list[dict[str, Any]] = []
    for target in sorted(chosen):
        actual = actuals.get(target)
        if actual is None:
            continue
        published, forecast = chosen[target]
        points.append({
            "startTime": iso(target),
            "decisionDate": (target.date() - timedelta(days=1)).isoformat(),
            "publishTime": iso(published),
            "horizonHours": round((target - published).total_seconds() / 3600, 1),
            "forecast": round(forecast, 1),
            "actual": round(actual, 1),
            # Positive error = forecast too high = wind shortfall the trader must cover.
            "error": round(forecast - actual, 1),
        })

    errors = [p["error"] for p in points]
    p10, p50, p90 = quantiles(errors, n=10, method="inclusive")[::4] if len(errors) > 1 else (0, 0, 0)
    by_hour = [
        {"hour": h, "mae": round(mean([abs(p["error"]) for p in points if p["startTime"][11:13] == f"{h:02d}"]), 1)}
        for h in range(24)
    ]
    mean_actual = mean([p["actual"] for p in points])
    mae = mean([abs(e) for e in errors])
    expected_hours = ((end - start).days + 1) * 24
    return {
        "metadata": {
            "decisionStart": start.isoformat(),
            "decisionEnd": end.isoformat(),
            "deliveryStart": first_delivery.isoformat(),
            "deliveryEnd": last_delivery.isoformat(),
            "cutoffHour": cutoff_hour,
            "intervals": len(points),
            "actualSource": "Elexon FUELHH (fuelType=WIND)",
            "forecastSource": "Elexon WINDFOR",
        },
        "metrics": {
            "mae": round(mae, 1),
            "rmse": round(mean([e * e for e in errors]) ** 0.5, 1),
            "bias": round(mean(errors), 1),
            "nmae": round(mae / mean_actual * 100, 1) if mean_actual else 0,
            "p10": round(p10, 1),
            "p50": round(p50, 1),
            "p90": round(p90, 1),
            "meanActual": round(mean_actual, 1),
            "coverage": round(len(points) / expected_hours * 100, 1),
            # Cover the shortfall in 9 of 10 hours: the 90th percentile of over-forecast error.
            "recommendedBuffer": round(max(p90, 0)),
        },
        "byHour": by_hour,
        "points": points,
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/analysis")
async def analysis(
    start: date = Query(DEFAULT_START, description="First decision day"),
    end: date = Query(DEFAULT_END, description="Last decision day"),
    cutoff_hour: int = Query(DEFAULT_CUTOFF_HOUR, ge=0, le=23, description="Decision cutoff, UTC hour on D-1"),
) -> dict[str, Any]:
    if start > end or (end - start).days > 30:
        raise HTTPException(status_code=400, detail="Choose a range of up to 31 days.")
    try:
        actual_rows, forecast_rows = await fetch_rows(start, end)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"Elexon API request failed: {error}") from error
    return build_analysis(actual_rows, forecast_rows, start, end, cutoff_hour)
