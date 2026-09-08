# MetroGrid

Interactive urban simulation and city-layout planner. Design cities on a grid
by placing residential, commercial, green, industrial, and road tiles — and
get immediate, deterministic algorithmic feedback on **Livability**,
**Traffic**, and **Resources** (each normalized 0–100).

Implements the PRD's progressive strategy: **Phase 0 (UX skeleton) + Phase 1
(functional core prototype)** are complete; Phase 2+ extensions are deferred
by design (see [Roadmap](#roadmap)).

## Architecture

```
CITY STATE  →  SIMULATION  →  SCORES  →  VISUALIZATION      (PRD §31)
```

```
metrogrid/
├── backend/                  # FastAPI + Pydantic (Python 3.10+)
│   ├── app/
│   │   ├── main.py           # /api/health, /api/calculate, /api/gis/import, /api/assets/upload, CORS, errors
│   │   ├── config.py         # ALL scoring + GIS + asset constants centralized (PRD §21)
│   │   ├── models/           # Tile types + API + GIS contracts (PRD §5, §7, §12)
│   │   └── services/
│   │       ├── scoring.py    # aggregation, normalization, local delta
│   │       ├── resources.py  # proximity scans (PRD §9.2-9.4)
│   │       ├── traffic.py    # residential↔commercial road connectivity
│   │       ├── pathfinding.py# weighted A* road graph (PRD §8, §9.6)
│   │       ├── geometry.py   # Manhattan distance
│   │       ├── rasterizer.py # deterministic lat/lon→grid rasterization (PRD §7.4-7.5)
│   │       ├── gis.py        # configured GIS pipeline (Overpass/OSM + sample)
│   │       ├── assets.py     # 3D-model upload → Supabase Storage (PRD §12.3)
│   │       └── sparse.py     # "x,y" sparse map parsing/serialization
│   └── tests/                # pytest: scoring, A*, API, PRD §25.3 flow
└── frontend/                 # React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + R3F
    └── src/
        ├── state/cityState.ts        # authoritative sparse Map state
        ├── services/api.ts           # backend client (backend is authoritative)
        ├── utils/coordinates.ts      # screen↔grid via getBoundingClientRect
        ├── utils/gis.ts              # client-side bounds validation + merge policy
        ├── lib/motion.ts             # restrained anime.js micro-interactions
        ├── lib/alpine.ts             # Alpine.js status-bar island (zero-render ticker)
        ├── hooks/useTheme.ts         # dark/light theme state + persistence
        ├── config/                   # tile + score-threshold tokens (once)
        ├── types/spatial.ts          # spatial extension types (freeform roads, models)
        ├── components/ui/            # shadcn/ui primitives (Button, Sheet, Dialog…)
        └── components/               # CityCanvas, CityCanvas3D, TilePalette, Dashboard, GISImport
```

- **Authoritative city state** is a sparse `Map<string, TileObject>` keyed by
  `"x,y"` (PRD §5.1, §19) on both sides — ready for Phase 2 coordinates
  beyond 20×20.
- **Native HTML5 Canvas** rendering; no Fabric.js/PixiJS (PRD §4.1).
- **Backend is authoritative for scores** (PRD §22.9-10); the frontend only
  renders.

## Running

Backend (uses the repo-root `.venv`):

```bash
.venv/Scripts/python -m pip install -r backend/requirements.txt   # once
cd backend
../.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Frontend:

```bash
cd frontend
npm install        # once
npm run dev        # http://localhost:5173
```

Set `VITE_API_BASE` in the frontend env to point somewhere other than the
default. By default the frontend uses **same-origin relative** `/api/*` URLs and,
in dev, the Vite server proxies `/api`, `/docs`, and `/openapi.json` to the
backend at `http://localhost:8000` — so you get the exact same-origin behavior
locally as the combined Vercel deployment. This means `npm run dev` + the
backend on 8000 "just works" with no CORS concerns. Backend CORS origins default
to the Vite dev ports (plus any `localhost`/`127.0.0.1` port via regex, so dev
port drift is safe); override with `METROGRID_CORS_ORIGINS` (comma-separated).
If you don't want the proxy, start Vite with the backend elsewhere and set
`VITE_API_BASE` (which bypasses the proxy by calling that origin directly).

GIS import env vars: `METROGRID_OVERPASS_URL` (primary Overpass endpoint),
`METROGRID_GIS_TIMEOUT_S` (per-endpoint budget, default 60), and
`METROGRID_GIS_PROVIDER` (`osm` default, `sample` for offline demos). The
importer tries the primary endpoint, then public mirrors
(kumi.systems, maps.mail.ru) on timeout/429/5xx; the route runs the upstream
fetch on a worker thread so the event loop stays responsive.

### Tests

```bash
cd backend && ../.venv/Scripts/python -m pytest      # 131 tests
cd frontend && npm test                              # 30 tests (vitest)
cd frontend && npm run build                         # typecheck + build
```

## API

| Endpoint         | Method | Purpose                                   |
|------------------|--------|-------------------------------------------|
| `/api/health`    | GET    | Phase 0 health check                      |
| `/api/calculate` | POST   | Deterministic scoring (PRD §12.1)         |
| `/api/gis/import`| POST   | Deterministic GIS bounding-box import (PRD §7, §12.2) |

`/api/gis/import` imports a geographic area into editable grid tiles:

```json
{ "bounds": { "north": 48.866, "south": 48.858, "east": 2.384, "west": 2.369 },
  "grid_origin": { "x": 0, "y": 0 } }
```

```json
{ "tiles_imported": 1678,
  "updated_grid": { "0,0": { "type": 42 }, "4,3": { "type": 1 } } }
```

The backend is stateless here: it rasterizes the area relative to `grid_origin` and returns the imported tile map; the frontend merges it (empty cells only, so hand-placed tiles always win). Configure the provider with `METROGRID_GIS_PROVIDER` (`osm` for real OpenStreetMap data via Overpass, or `offline` for the deterministic sample city). Provider failures return `502`/`504` and never corrupt the city.

`/api/calculate` accepts both contracts:

- **Advanced (PRD §12.1)**: `{"tiles": {"x,y": {"type": n}}, "active_bounds": …, "latest_action": {x, y, type}}`
- **Prototype (PRD §13)**: `{"grid_state": [[…]], "latest_placement": {x, y, type}}`

Response:

```json
{
  "global_scores": {"livability": 82, "traffic": 74, "resources": 91},
  "local_deltas": {"x": 0, "y": 0, "value": 10, "metric": "livability"}
}
```

Errors: `400` malformed input/JSON, `404` unknown route, `413/422`
validation, `500` unexpected — never stack traces (PRD §20.2).

## Scoring model (PRD §9)

All constants live in `backend/app/config.py`. The PRD fixes modifiers and
radii; the base values are MetroGrid's documented default calibration.

| Metric      | Formula (raw, then clamped 0–100)                                        |
|-------------|--------------------------------------------------------------------------|
| Livability  | `70 + 10×(green–residential pairs within Manhattan ≤ 3) − 15×(industrial–residential pairs within ≤ 4)` |
| Resources   | `50 + 10×(residential with commercial within ≤ 4) − 20×(residential without)` |
| Traffic     | `100 − 5×(residential not road-connected to any commercial)`             |

Road network: road tiles are graph nodes; stepping onto a road costs
`10 / speed_weight` (40→1, 41/4→3, 42→5, 43→10), so faster roads yield
cheaper A* paths — never score bonuses (PRD §9.6). Express highways (43) are
access-restricted: zones connect only via non-highway roads (PRD §8.3).

**Local delta**: the backend recomputes scores on the pre-action map and
reports the metric with the largest absolute change (fixed tie-break order).
Erasing carries `previous_type` in `latest_action` (one optional, additive
field beyond the PRD contract) so removals explain why the score changed.

## Keyboard shortcuts

`V` select · `X` erase · Zones: `1` Res, `2` Com, `3` Park, `4` Ind ·
Roads: `5` Local, `6` Transit, `7` Highway

## Roadmap (PRD §1.3)

- [x] **Phase 0** — app shell, palette, score panel, empty/error states
- [x] **Phase 1** — 20×20 bounded grid, placement/erase, deterministic
      `/api/calculate`, dashboard, local feedback, tests
- [x] **Phase 2** — unbounded sparse canvas: pan (drag/middle/Space/touch),
      zoom (wheel/pinch/controls), chunked viewport culling, signed 32-bit
      coords, live coordinate readout, active-bounds sent on every request
- [x] **Phase 3** — congestion estimation (PRD §9.7) surfaced as
      ``traffic_detail``; layout save/list/load via Supabase with in-memory
      fallback (PRD §17, migration ``001_city_plans.sql``); Save/Load panel
- [x] **Phase 4** — GIS import (`/api/gis/import`): deterministic
      lat/lon→grid rasterization (PRD §7.4-7.5), OpenStreetMap via Overpass +
      offline sample provider, compact Leaflet bbox picker, premium minimal UI
      (shadcn/ui, anime.js micro-interactions), spatial extension types for
      future freeform roads / oriented models; 131 backend + 30 frontend tests
- [x] **Phase 5** — optional 3D visualization (PRD §16): React Three Fiber
      canvas with instanced tile meshes + lazy GLTF/GLB loading (error-boundary
      fallback, never corrupts state); `POST /api/assets/upload` → Supabase
      Storage with magic-byte type verification + 25 MB cap; 2D/3D view toggle;
      model upload + arm-for-placement workflow
- [x] **Phase 5 (Day 2)** — freeform spatial placement (PRD line 495): zones at
      arbitrary world coordinates with rotation + footprint; pure geometry layer
      (`utils/spatial.ts`) rasterizes zones into the unchanged scoring engine via
      `deriveTileMap`; move/rotate/resize handles + Delete; ghost preview with
      R-to-rotate; amber collision feedback (advisory, never blocking); undo/redo
      for spatial edits; v2 layout wrapper persists zones without a DB migration;
      Freeform toggle + Undo/Redo in the tool rail; 150 backend + 44 frontend tests
- [ ] **Phase 6** — polish, a11y audit, demo seed city

## Deploying to Vercel (combined frontend + backend)

MetroGrid ships as a **single Vercel project** that serves both the React SPA and
the FastAPI backend on one domain. The frontend talks to the backend through
same-origin `/api/*` URLs, so there is no cross-origin CORS setup and no separate
backend deployment.

### How it's wired

- `vercel.json` — routes `/api/*`, `/docs`, and `/openapi.json` to the
  `api/index.py` Python function; every other path is served as the SPA
  (`index.html`) for client-side routing (`/`, `/planner?t=1`, `/build`, …).
- `api/index.py` — Vercel Python-runtime entrypoint; re-exports the FastAPI app
  from `backend.app.main` (adds `backend/` to `sys.path`).
- `main.py` (repo root) — identical re-export so Vercel's FastAPI auto-detect and
  any root ASGI invocation resolve the same app.
- `requirements.txt` (repo root) — backend deps installed by the Python runtime.
- `frontend/vite.config.ts` — dev proxy so local `npm run dev` mirrors the
  production same-origin layout.
- CORS stays permissive **only** for localhost (see *Running*); same-origin
  production requests need no CORS.

### Deploy

1. Push the repo to GitHub.
2. In Vercel, **Import Project** → pick the repo → framework preset **Other**.
   MetroGrid's `vercel.json` already defines the build (`@vercel/static-build`
   for the frontend via `npm run build`, `@vercel/python` for the API), so the
   default settings work.
3. Set the **Environment Variables** the backend needs in the project settings:
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (persistence + 3D asset
   uploads), plus the optional GIS overrides
   (`METROGRID_OVERPASS_URL`, `METROGRID_GIS_TIMEOUT_S`, `METROGRID_GIS_PROVIDER`).
4. Deploy. The SPA loads at `/` and the API is live at `/api/health`.

> ⚠️ **Serverless note:** the GIS importer calls OpenStreetMap's Overpass (up to
> ~60 s upstream + mirrors) and model uploads can be up to 25 MB. Vercel
> functions default to a 10 s/4.5 MB limit; `vercel.json` raises `maxDuration`
> to 60 s, and you may need a **Pro/Enterprise plan** for the size and timeout
> ceilings those operations require. Core planning/scoring (the main flow)
> works on the free plan.
