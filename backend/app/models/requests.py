"""Pydantic contracts for `/api/calculate` (PRD §12.1, §13).

Two request shapes are accepted on the same endpoint:

* Advanced Edition: sparse ``tiles`` dict keyed by ``"x,y"`` plus optional
  ``active_bounds`` and ``latest_action``.
* Prototype (§13): ``grid_state`` 2-D matrix plus optional ``latest_placement``.
  The prototype payload is converted to sparse coordinates before scoring.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app import config
from app.models.tiles import TileType, is_valid_tile_type


def _ensure_int32_coord(value: int, field: str) -> int:
    if not (config.MIN_COORD <= value <= config.MAX_COORD):
        raise ValueError(
            f"{field} must be a signed 32-bit integer "
            f"({config.MIN_COORD}..{config.MAX_COORD})"
        )
    return value


class Bounds(BaseModel):
    """Active viewport bounds (PRD §12.1)."""

    model_config = ConfigDict(extra="forbid")

    min_x: int = Field(ge=config.MIN_COORD, le=config.MAX_COORD)
    max_x: int = Field(ge=config.MIN_COORD, le=config.MAX_COORD)
    min_y: int = Field(ge=config.MIN_COORD, le=config.MAX_COORD)
    max_y: int = Field(ge=config.MIN_COORD, le=config.MAX_COORD)

    @model_validator(mode="after")
    def _ordered(self) -> "Bounds":
        if self.min_x > self.max_x or self.min_y > self.max_y:
            raise ValueError("active_bounds min values must not exceed max values")
        return self


class TileObject(BaseModel):
    """A single sparse-map tile (PRD §5.3)."""

    model_config = ConfigDict(extra="forbid")

    type: int
    model_url: Optional[str] = None

    @field_validator("type")
    @classmethod
    def _valid_type(cls, value: int) -> int:
        if not is_valid_tile_type(value):
            raise ValueError(f"unsupported tile type: {value!r}")
        return value


class LatestAction(BaseModel):
    """The latest user action driving local decision feedback (PRD §11).

    ``previous_type`` is an optional extension used by the erase flow so the
    backend can reconstruct the pre-action state and report why removing a
    tile changed the score (PRD §1.3 Phase 1 exit criteria).
    """

    model_config = ConfigDict(extra="forbid")

    x: int
    y: int
    type: int
    previous_type: Optional[int] = None

    @field_validator("x", "y")
    @classmethod
    def _int32(cls, value: int, info) -> int:
        return _ensure_int32_coord(value, info.field_name)

    @field_validator("type", "previous_type")
    @classmethod
    def _valid_type(cls, value: Optional[int]) -> Optional[int]:
        if value is None or is_valid_tile_type(value):
            return value
        raise ValueError(f"unsupported tile type: {value!r}")


class PrototypePlacement(BaseModel):
    """Prototype-contract placement (PRD §13)."""

    model_config = ConfigDict(extra="forbid")

    x: int
    y: int
    type: int

    @field_validator("x", "y")
    @classmethod
    def _int32(cls, value: int, info) -> int:
        return _ensure_int32_coord(value, info.field_name)

    @field_validator("type")
    @classmethod
    def _valid_type(cls, value: int) -> int:
        if not is_valid_tile_type(value):
            raise ValueError(f"unsupported tile type: {value!r}")
        return value


class CalculateRequest(BaseModel):
    """Advanced Edition scoring request (PRD §12.1)."""

    model_config = ConfigDict(extra="forbid")

    active_bounds: Optional[Bounds] = None
    tiles: dict[str, TileObject] = Field(default_factory=dict)
    latest_action: Optional[LatestAction] = None


class PrototypeCalculateRequest(BaseModel):
    """Backward-compatible prototype scoring request (PRD §13)."""

    model_config = ConfigDict(extra="forbid")

    grid_state: list[list[int]]
    latest_placement: Optional[PrototypePlacement] = None

    @field_validator("grid_state")
    @classmethod
    def _matrix_of_valid_types(cls, matrix: list[list[int]]) -> list[list[int]]:
        if not matrix:
            raise ValueError("grid_state must not be empty")
        width = len(matrix[0])
        for row in matrix:
            if len(row) != width:
                raise ValueError("grid_state rows must all have the same length")
            for value in row:
                if not is_valid_tile_type(value):
                    raise ValueError(f"unsupported tile type in grid_state: {value!r}")
        return matrix


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


class GlobalScores(BaseModel):
    """Normalized 0-100 scores (PRD §10)."""

    livability: int
    traffic: int
    resources: int


class LocalDelta(BaseModel):
    """Local decision feedback at the latest action (PRD §11)."""

    x: int
    y: int
    value: int
    metric: Literal["livability", "traffic", "resources"]


class CalculateResponse(BaseModel):
    global_scores: GlobalScores
    local_deltas: Optional[LocalDelta] = None
    traffic_detail: Optional[dict[str, float | int]] = None


__all__ = [
    "Bounds",
    "CalculateRequest",
    "CalculateResponse",
    "GlobalScores",
    "LatestAction",
    "LocalDelta",
    "PrototypeCalculateRequest",
    "PrototypePlacement",
    "TileObject",
    "TileType",
]
