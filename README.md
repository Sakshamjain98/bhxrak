# WindLens

WindLens is a pilot dashboard for a UK energy utility's day-ahead trading desk. For every purchase decision made in **January 2026** it shows the national wind forecast the desk actually had at decision time, compares it with what the wind actually generated, and turns the measured error into a procurement buffer.

**Live app:** _add Vercel URL here after deploying_

## What it answers

1. **What was the latest wind forecast when I had to decide?** For each delivery hour, the latest Elexon `WINDFOR` forecast published at or before the decision cutoff on the previous day. Forecasts published after the cutoff are never used, so there is no look-ahead.
2. **How accurate is that forecast?** MAE, RMSE, bias, normalised MAE, the P10/P90 error band, MAE by hour of day, and a recommended shortfall buffer (the P90 of forecast − actual).

### Methodology

| Item | Choice |
|---|---|
| Decision window | Decision days 1–31 Jan 2026 → delivery days 2 Jan – 1 Feb 2026 |
| Decision cutoff | 09:00 UK on D-1 by default, just before the GB day-ahead auction gate closures (EPEX 09:20, N2EX 09:50). You can change it in the UI. In January UK time = UTC. |
| Actuals | `FUELHH` stream, `fuelType=WIND`, half-hourly `generation` (MW) |
| Forecasts | `WINDFOR` stream. Hourly targets, about 8 publishes a day (02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC) |
| Matching | Each hourly forecast `startTime` is paired with the actual whose `startTime` matches exactly (the HH:00 half-hour) |
| Error | `forecast − actual`. Positive means the forecast was too high and the desk is short of wind. |
| Buffer | P90 of the error: covers the wind shortfall in 9 of 10 hours |

**Key pilot finding (09:00 cutoff):** MAE ≈ 2.0 GW (18% of mean output). The forecast ran about **1.7 GW high** on average, and the P90 shortfall was about **4.2 GW**.

## Repository layout

```
backend/
  app/main.py            FastAPI app: Elexon fetch, forecast selection, error metrics (/api/analysis, /health)
  tests/test_analysis.py pytest unit tests for the selection and metric logic
  Dockerfile, requirements.txt
frontend/
  src/main.jsx           React dashboard (Recharts): cutoff selector, KPIs, decision-day explorer,
                         monthly profile, MAE by hour, methodology
  src/styles.css
  nginx.conf             serves the SPA and proxies /api to the backend container
  Dockerfile, vite.config.js (dev proxy /api -> :8000)
api/index.py             Vercel Python function entry; re-exports backend/app/main.py
vercel.json              Vercel config: builds frontend, routes /api/* to the Python function
requirements.txt         Python dependencies for the Vercel function
docker-compose.yml       local two-container setup
VIDEO_SCRIPT.md          talk track for the demo video
```

## Run locally

With Docker:

```bash
docker compose up --build      # open http://localhost:5173
```

Without Docker:

```bash
cd backend && python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# in another terminal
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :8000)
```

Tests:

```bash
cd backend && pip install pytest && python -m pytest -q
```

API: `GET /api/analysis?start=2026-01-01&end=2026-01-31&cutoff_hour=9`. `start` and `end` are decision days (at most 31 days); `cutoff_hour` is a UTC hour from 0 to 23. The Elexon API is public, so no secrets are needed.

## Deploy (Vercel)

Everything deploys as one Vercel project: a static React build plus a Python serverless function for `/api/*`.

```bash
npx vercel login
npx vercel --prod
```

Or import the GitHub repo in the Vercel dashboard. `vercel.json` already sets the build, the output directory and the routing.

## AI disclosure

AI tools (Claude Code) were used to help with scaffolding, Elexon API integration, the UI, tests and documentation. The data-selection method and metric definitions were checked against the challenge brief and real Elexon responses.

## Sources

- [Elexon FUELHH stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)
- [Elexon WINDFOR stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)
