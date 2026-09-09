"""Layout save/load routes (PRD §17.3-17.4, Phase 3)."""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import ApiError
from app.models.layouts import (
    LayoutDetail,
    LayoutListResponse,
    SaveLayoutRequest,
)
from app.services.persistence import (
    LayoutStore,
    validate_grid_state_payload,
)
from app.services.sparse import InvalidTileKey

router = APIRouter(prefix="/api/layouts", tags=["layouts"])

store = LayoutStore()


ARCHIVE_MESSAGE = (
    "This project is now archived. Some Features are now read only. Thank you."
)


@router.get("", response_model=LayoutListResponse)
async def list_layouts() -> LayoutListResponse:
    """List saved layouts (summaries, no grid payloads)."""
    return LayoutListResponse(storage=store.storage, layouts=store.list_layouts())


@router.post("", response_model=LayoutDetail, status_code=201)
async def save_layout(payload: SaveLayoutRequest) -> LayoutDetail:
    """Save the current sparse tile map under a sanitized name."""
    if store.storage == "supabase":
        raise ApiError(403, ARCHIVE_MESSAGE)
    try:
        validate_grid_state_payload(payload.grid_state)
        row = store.save_layout(payload.name, payload.grid_state)
    except (ValueError, InvalidTileKey) as exc:
        # Tiles, zones, roads, and terrain all validate inside save_layout.
        raise ApiError(400, f"Invalid grid: {exc}") from exc
    return LayoutDetail(
        id=row["id"],
        name=row["name"],
        created_at=row.get("created_at"),
        grid_state=row["grid_state"],
        tile_count=row.get("tile_count", len(row["grid_state"])),
    )


@router.get("/{layout_id}", response_model=LayoutDetail)
async def load_layout(layout_id: str) -> LayoutDetail:
    """Fetch one saved layout with its full grid_state."""
    if store.storage == "supabase":
        raise ApiError(403, ARCHIVE_MESSAGE)
    try:
        row = store.load_layout(layout_id)
    except KeyError as exc:
        raise ApiError(404, "Layout not found") from exc
    return LayoutDetail(
        id=row["id"],
        name=row["name"],
        created_at=row.get("created_at"),
        grid_state=row["grid_state"],
        tile_count=row.get("tile_count", len(row["grid_state"])),
    )