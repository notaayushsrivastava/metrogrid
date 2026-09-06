"""Layout persistence API contracts (PRD §17)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.services.persistence import MAX_NAME_LENGTH, sanitize_layout_name


class SaveLayoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    grid_state: dict[str, Any]

    @field_validator("name")
    @classmethod
    def _name_valid(cls, value: str) -> str:
        return sanitize_layout_name(value)


class LayoutSummary(BaseModel):
    id: str
    name: str
    created_at: Optional[Any] = None
    tile_count: int


class LayoutListResponse(BaseModel):
    storage: str
    layouts: list[LayoutSummary]


class LayoutDetail(BaseModel):
    id: str
    name: str
    created_at: Optional[Any] = None
    grid_state: dict[str, Any]
    tile_count: int


__all__ = [
    "LayoutDetail",
    "LayoutListResponse",
    "LayoutSummary",
    "SaveLayoutRequest",
    "MAX_NAME_LENGTH",
]