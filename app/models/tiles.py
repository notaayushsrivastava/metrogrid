"""Tile type definitions and validation (PRD §5.4)."""

from __future__ import annotations

from enum import IntEnum

from app import config


class TileType(IntEnum):
    """Supported tile types. Values mirror the PRD exactly."""

    EMPTY = 0
    RESIDENTIAL = 1
    COMMERCIAL = 2
    GREEN = 3
    ROAD = 4  # legacy generic road
    INDUSTRIAL = 5
    ROAD_PEDESTRIAN = 40
    ROAD_LOCAL = 41
    ROAD_AVENUE = 42
    ROAD_HIGHWAY = 43


def is_valid_tile_type(value: int) -> bool:
    """True when `value` is a tile type supported by the engine."""
    return int(value) in config.VALID_TILE_TYPES


def road_speed_weight(tile_type: int) -> int:
    """Speed weight for a road tile (PRD §8.2).

    Non-road types raise ValueError; callers must only use this on tiles the
    traffic engine classified as road.
    """
    try:
        return config.ROAD_SPEED_WEIGHTS[int(tile_type)]
    except KeyError as exc:  # pragma: no cover - guarded by is_road_tile
        raise ValueError(f"tile type {tile_type} is not a road") from exc


def is_road_tile(tile_type: int) -> bool:
    return int(tile_type) in config.ROAD_SPEED_WEIGHTS
