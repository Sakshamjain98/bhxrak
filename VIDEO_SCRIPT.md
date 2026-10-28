# Video talk track (max 10 min)

## Part 1: client pitch (≤5 min)

1. **Problem (30s).** Every morning the desk buys tomorrow's power before the day-ahead auction closes. What you need from the market is demand minus wind, and the wind figure is only a forecast.
2. **Decision-time forecast (60s).** Show the cutoff selector at 09:00. WindLens shows the forecast the desk *actually had* at that point, which was the 07:30 publish. Later publishes are never used. Open the Decision Day Explorer, pick a windy day, and point out the gap between the forecast and what happened.
3. **Accuracy in numbers (60s).** For January, MAE was about 2 GW, 18% of average wind output. The headline: the forecast ran about **1.7 GW high**. Wind under-delivered almost every day, so a desk that trusted the raw forecast was consistently short and buying the gap back at imbalance prices.
4. **Procurement signal (60s).** Hold a buffer of about 4.2 GW, which covers the shortfall in 9 out of 10 hours. Show the MAE-by-hour chart: early-morning hours are the least reliable.
5. **What-if (30s).** Move the cutoff to 18:00 to show that a later decision would cut the error. That puts a number on the value of a later auction or of intraday trading.
6. **Next steps (30s).** Add solar, compare forecasts with demand, run live daily, and track the buffer as data builds up.

## Part 2: tech lead walkthrough (≤5 min)

1. **Architecture (60s).** React + Vite + Recharts frontend, FastAPI backend, Elexon BMRS stream API. One endpoint, `/api/analysis`. The frontend calls `/api` on the same origin, which works through the Vite proxy in dev, nginx in Docker and rewrites on Vercel.
2. **Core logic (90s).** `backend/app/main.py` → `build_analysis`. Decision day D covers delivery D+1. For each target hour, take the latest forecast with `publishTime <= D 09:00`. If none exists there is no point, rather than a silent fallback. Error = forecast − actual. P10/P50/P90 use `statistics.quantiles`. Fetch: FUELHH by settlement date with `fuelType=WIND`; WINDFOR by publish window, starting 2 days early to cover the forecast horizon. Both fetches run in parallel with `asyncio.gather`, and the raw rows are cached in memory because January is historical.
3. **Data notes (30s).** WINDFOR is hourly and FUELHH is half-hourly, so they are matched on the exact `startTime`. Coverage is reported (100% for January).
4. **Tests and practices (60s).** `backend/tests`: cutoff and no-look-ahead, the missing-forecast case, filtering, metrics. Run `pytest`. Docker Compose for local runs, a single Vercel deploy, no secrets.
5. **Trade-offs and next steps (60s).** The in-process cache is fine for a fixed historical window; add a TTL or Redis cache for live data. Possible additions: error by forecast horizon, CI.
