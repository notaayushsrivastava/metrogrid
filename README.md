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
│   │   ├── main.py           # /api/health, /api/calculate, CORS, errors
│   │   ├── config.py         # ALL scoring constants centralized (PRD §21)
│   │   ├── models/           # Tile types + API contracts (PRD §5, §12, §13)
│   │   └── services/
│   │       ├── scoring.py    # aggregation, normalization, local delta
│   │       ├── resources.py  # proximity scans (PRD §9.2-9.4)
│   │       ├── traffic.py    # residential↔commercial road connectivity
│   │       ├── pathfinding.py# weighted A* road graph (PRD §8, §9.6)
│   │       ├── geometry.py   # Manhattan distance
│   │       └── sparse.py     # "x,y" sparse map parsing/serialization
│   └── tests/                # pytest: scoring, A*, API, PRD §25.3 flow
└── frontend/                 # React 19 + TypeScript + Vite + Tailwind v4
    └── src/
        ├── state/cityState.ts        # authoritative sparse Map state
        ├── services/api.ts           # backend client (backend is authoritative)
        ├── utils/coordinates.ts      # screen↔grid via getBoundingClientRect
        ├── config/                   # tile + score-threshold tokens (once)
        └── components/               # CityCanvas, TilePalette, Dashboard
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

Set `VITE_API_BASE` in the frontend env to point somewhere other than
`http://localhost:8000`. Backend CORS origins default to the Vite dev ports;
override with `METROGRID_CORS_ORIGINS` (comma-separated).

### Tests

```bash
cd backend && ../.venv/Scripts/python -m pytest      # 66 tests
cd frontend && npm test                              # 11 tests (vitest)
cd frontend && npm run build                         # typecheck + build
```

## API

| Endpoint         | Method | Purpose                                   |
|------------------|--------|-------------------------------------------|
| `/api/health`    | GET    | Phase 0 health check                      |
| `/api/calculate` | POST   | Deterministic scoring (PRD §12.1)         |

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

`V` select · `1` residential · `2` commercial · `3` park · `4` industrial ·
`5` road · `X` erase

## Roadmap (PRD §1.3)

- [x] **Phase 0** — app shell, palette, score panel, empty/error states
- [x] **Phase 1** — 20×20 bounded grid, placement/erase, deterministic
      `/api/calculate`, dashboard, local feedback, tests
- [ ] **Phase 2** — pan/zoom viewport, signed 32-bit coords, chunk culling
      (sparse map already in place)
- [ ] **Phase 3** — road subtypes UI, congestion, Supabase save/load
- [ ] **Phase 4** — GIS import (`/api/gis/import`)
- [ ] **Phase 5** — optional 3D (`.glb`/`.gltf`, React Three Fiber)
- [ ] **Phase 6** — polish, a11y audit, demo seed city
