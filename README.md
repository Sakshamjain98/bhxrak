# WindLens

WindLens is a pilot dashboard for a UK energy utility buying power in the day-ahead market. It compares national wind generation actuals with the forecast that would have been available for a day-ahead decision and turns the historical error into a practical procurement buffer.

## What is included

- `frontend/` — React + Vite dashboard with Recharts visualisation and responsive styling.
- `backend/` — FastAPI service that retrieves Elexon BMRS `FUELHH` and `WINDFOR` streams, matches wind actuals, and computes MAE, RMSE, MAPE, bias, coverage, and a recommended buffer.
- `docker-compose.yml` — local two-container setup.
- `REint Full Stack SWE challenge v4 Shared.docx` — original challenge brief.

The pilot uses **18:00 UTC on the preceding day** as the decision cutoff. For each half-hour delivery interval, the latest `WINDFOR` record published by that cutoff is selected; if no record exists, the latest available record is selected and the coverage metric makes this visible. Actuals are restricted to `fuelType=WIND`.

## Run locally

With Docker:

```bash
docker compose up --build
```

Open `http://localhost:5173`.

Without Docker:

```bash
cd backend && python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# in another terminal
cd frontend
npm install
npm run dev
```

The Elexon API is public and the dashboard defaults to January 2026, as required by the brief. Set `VITE_API_URL` when the API is hosted separately. The backend has no secrets and exposes `/health` for deployment checks.

## Deployment

The app is containerised and can be deployed as two services: deploy `backend/` to a container host (for example Render, Fly.io, or Heroku) and deploy `frontend/` to Vercel with `VITE_API_URL` pointing to the backend URL. A public deployment URL should be added here after deployment.

## AI disclosure

AI tools were used to accelerate scaffolding, API integration, UI implementation, and review. The data-selection methodology and metric definitions were checked against the challenge requirements and the Elexon response shape.

## Sources

- [Elexon FUELHH stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)
- [Elexon WINDFOR stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)
