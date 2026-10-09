# Mining Safety AI

**Visibility-aware predictive collision prevention for mining vehicles.** This is a functional full-stack proof of concept for operating a mining safety control room under dust, fog, smoke, darkness, and poor-visibility conditions.

## What is implemented

The application is a React + TypeScript control-room console backed by a typed tRPC server and a deterministic simulation engine. It does not depend on a GPU, camera, LiDAR, Radar, paid API, or hard-coded frontend API key. The simulation produces live telemetry so the interface remains usable for a hackathon demo and can later be replaced by real sensor/model adapters.

The backend calculates visibility bands, TTC, adaptive forward/lateral/rear safety bubbles, worker intent, fused sensor uncertainty, risk scores, alert escalation, near-miss events, fleet safety scores, and analytics. The database schema is migration-ready for a MySQL/TiDB deployment and includes `vehicles`, `objects`, `detections`, `risk_events`, `near_misses`, `alerts`, `environment`, and `zones` tables.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Useful commands:

```bash
pnpm run check       # TypeScript validation
pnpm test -- --run   # Vitest unit tests
pnpm run build       # Production client + server bundle
```

## Docker

```bash
docker compose up --build
```

The single Node service serves the React preview and tRPC backend on port `3000`. Set `DATABASE_URL` if you want to use the provisioned MySQL/TiDB database; the safety simulation continues using local state when it is absent.

## Demo scenario

1. Start on **Dashboard**. The simulation begins in the truck/worker path-intersection scenario.
2. Watch visibility decline from clear/good conditions toward poor conditions while the forward safety bubble expands.
3. The worker changes to `CROSSING`, then `ENTERING DANGER ZONE`; the risk score rises as TTC contracts and confidence falls.
4. Use **Pause**, **Start**, **Step**, or **Reset** from the top bar or Settings.
5. When the simulated truck brakes, the backend records a `NEAR MISS` event and the event appears in **Near Misses**.
6. Use the page navigation to inspect live tracking, risk factors, the safety map, fleet telemetry, analytics, and integration readiness.

## Backend procedures

The primary typed procedures are:

- `safety.snapshot` — live telemetry snapshot containing vehicles, tracked objects, environment, risk trend, alerts, events, heatmap, and analytics.
- `safety.control` — `start`, `pause`, `reset`, or `step` the simulation.
- `safety.acknowledge` — acknowledge a deduplicated alert.

The server architecture is intentionally adapter-friendly. The current local simulator can later be replaced by a YOLO/Roboflow detector and real Camera/LiDAR/Radar/GPS adapters without changing the UI contract.

## Environment variables

Copy `.env.example` to `.env` for optional integrations. Missing keys are handled gracefully and do not prevent the local demo from running.

## Design language

The console uses black, white, and grayscale only. Risk is communicated through contrast, border weight, monochrome intensity, icons, and layout rather than color. The visual system is designed to feel like an industrial mining operations center rather than a gaming dashboard.
