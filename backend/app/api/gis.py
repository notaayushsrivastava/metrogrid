"""GIS import route (PRD §7, §12.2).

``POST /api/gis/import`` — fetch features from the configured GIS pipeline,
rasterize them deterministically into sparse grid coordinates relative to the
requested origin, and return the imported tile map. The backend is stateless:
merging into the user's city happens on the client, so a failed import can
never corrupt or replace existing city state (PRD Phase 4 exit criteria).
"""

from __future__ import annotations

import asyncio

import httpx
from fastapi import APIRouter

from app.errors import ApiError
from app.models.gis import GisImportRequest, GisImportResponse
from app.services import gis as gis_service
from app.services.rasterizer import GeoBounds, rasterize_features
from app.services.sparse import sparse_to_json

router = APIRouter(tags=["gis"])


@router.post("/api/gis/import", response_model=GisImportResponse)
async def gis_import(payload: GisImportRequest) -> GisImportResponse:
    """Deterministic GIS bounding-box import (PRD §12.2)."""
    try:
        provider = gis_service.get_provider()
    except ValueError as exc:
        raise ApiError(400, str(exc)) from exc

    bounds = GeoBounds(
        north=payload.bounds.north,
        south=payload.bounds.south,
        east=payload.bounds.east,
        west=payload.bounds.west,
    )

    try:
        # The provider does blocking httpx I/O (up to ~60 s per endpoint with
        # mirror fallbacks). Running it on a worker thread keeps the event
        # loop responsive — health checks, CORS preflights, and scoring
        # requests are never stalled behind an import.
        features = await asyncio.to_thread(provider.fetch_features, bounds)
    except gis_service.GisSourceUnavailable as exc:
        raise ApiError(504 if exc.timeout else 502, str(exc)) from exc
    except httpx.HTTPError as exc:  # defensive: provider bugs must not 500
        raise ApiError(502, "The map data source failed. Retry shortly.") from exc

    origin = (payload.grid_origin.x, payload.grid_origin.y)
    tiles = rasterize_features(features, bounds, origin)

    return GisImportResponse(
        tiles_imported=len(tiles),
        updated_grid=sparse_to_json(tiles),
    )
