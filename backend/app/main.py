"""MetroGrid FastAPI application (PRD §4.2, §12, §20.2).

Endpoints
---------
* ``GET  /api/health``    — Phase 0 health check.
* ``POST /api/calculate`` — deterministic scoring; accepts both the Advanced
  Edition sparse contract (§12.1) and the prototype matrix contract (§13).

The scoring engine itself lives in ``app.services`` and never touches HTTP.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app import config
from app.api.layouts import router as layouts_router
from app.errors import ApiError
from app.models.requests import (
    CalculateRequest,
    CalculateResponse,
    GlobalScores,
    LatestAction,
    PrototypeCalculateRequest,
)
from app.services.congestion import estimate_congestion
from app.services.scoring import compute_local_delta, compute_scores
from app.services.sparse import InvalidTileKey, matrix_to_sparse, parse_key

app = FastAPI(
    title="MetroGrid API",
    version=config.APP_VERSION,
    description="Deterministic urban simulation scoring for MetroGrid.",
)

app.include_router(layouts_router)


def _cors_origins() -> list[str]:
    raw = os.environ.get("METROGRID_CORS_ORIGINS")
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return list(config.DEFAULT_CORS_ORIGINS)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """FastAPI/Pydantic validation failures → 422 without stack traces."""
    errors = exc.errors()
    # Pydantic stores the raised exception object in ctx.error, which is not
    # JSON-serializable; drop ctx so the detail is safe to return.
    for err in errors:
        err.pop("ctx", None)
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(ApiError)
async def _api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Phase 0 health check (PRD §1.3)."""
    return {"status": "ok", "version": config.APP_VERSION}


def _sparse_from_advanced(req: CalculateRequest) -> dict[tuple[int, int], int]:
    tiles: dict[tuple[int, int], int] = {}
    for key, tile in req.tiles.items():
        try:
            x, y = parse_key(key)
        except InvalidTileKey as exc:
            raise ApiError(400, f"Invalid tile key: {exc}") from exc
        tiles[(x, y)] = tile.type
    return tiles


def _parse_body(
    payload: object,
) -> tuple[dict[tuple[int, int], int], LatestAction | None]:
    """Validate the raw payload and produce (sparse tiles, latest action).

    Accepts both the Advanced Edition sparse contract and the prototype
    matrix contract on the same endpoint (PRD §13).
    """
    if not isinstance(payload, dict):
        raise ApiError(400, "Request body must be a JSON object")

    try:
        if "grid_state" in payload:
            proto = PrototypeCalculateRequest.model_validate(payload)
            tiles = matrix_to_sparse(proto.grid_state)
            action = None
            if proto.latest_placement is not None:
                action = LatestAction(
                    x=proto.latest_placement.x,
                    y=proto.latest_placement.y,
                    type=proto.latest_placement.type,
                )
            return tiles, action
        advanced = CalculateRequest.model_validate(payload)
    except ValidationError as exc:
        # Surface Pydantic validation failures as 422 (PRD §20.2).
        raise ApiError(422, f"Validation failed: {exc.errors()}") from exc

    return _sparse_from_advanced(advanced), advanced.latest_action


@app.post("/api/calculate", response_model=CalculateResponse)
async def calculate(request: Request) -> CalculateResponse:
    """Deterministic scoring endpoint (PRD §12.1)."""
    try:
        payload = await request.json()
    except Exception as exc:  # malformed JSON
        raise ApiError(400, "Request body must be valid JSON") from exc

    tiles, action = _parse_body(payload)

    scores = compute_scores(tiles)
    delta = compute_local_delta(tiles, action)

    return CalculateResponse(
        global_scores=GlobalScores(**scores),
        local_deltas=delta,  # type: ignore[arg-type]
        traffic_detail=estimate_congestion(tiles),
    )
