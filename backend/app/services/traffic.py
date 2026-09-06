"""Traffic connectivity between Residential and Commercial zones (PRD §9.5).

A residential zone counts as connected when a weighted road path exists from
a road tile adjacent to it (respecting highway access restrictions) to a
road tile adjacent to any commercial zone.
"""

from __future__ import annotations

from app import config
from app.services.pathfinding import (
    astar_path_cost,
    build_road_adjacency,
    zone_adjacent_road_nodes,
)
from app.services.sparse import TileMap


def collect_zone_coords(tiles: TileMap, zone_type: int) -> set[tuple[int, int]]:
    """All coordinates of a given zone type, sorted for determinism."""
    return {coord for coord, tile_type in tiles.items() if tile_type == zone_type}


def is_zone_road_connected(
    tiles: TileMap,
    adjacency: dict[tuple[int, int], tuple[tuple[int, int], ...]],
    zone_coords: set[tuple[int, int]],
    targets: set[tuple[int, int]],
) -> bool:
    """True when `zone_coords` (one zone) reaches any of `targets` by road.

    Callers pass a single-element set for the originating zone; `targets`
    holds every zone of the destination type so A* stops at the cheapest.
    """
    starts = zone_adjacent_road_nodes(tiles, zone_coords)
    goals = zone_adjacent_road_nodes(tiles, targets)
    return astar_path_cost(adjacency, tiles, starts, goals) is not None


def road_connected_residential_stats(tiles: TileMap) -> tuple[int, int]:
    """Count residential zones connected by road to a commercial zone.

    Returns:
        ``(connected, total)`` residential counts (PRD §9.5).
    """
    residential = collect_zone_coords(tiles, config.RESIDENTIAL)
    if not residential:
        return 0, 0

    commercial = collect_zone_coords(tiles, config.COMMERCIAL)
    if not commercial:
        return 0, len(residential)

    adjacency = build_road_adjacency(tiles)
    goals = zone_adjacent_road_nodes(tiles, commercial)
    if not goals:
        return 0, len(residential)

    connected = 0
    # Deterministic order: sort by coordinate before evaluating.
    for coord in sorted(residential):
        starts = zone_adjacent_road_nodes(tiles, {coord})
        if starts and astar_path_cost(adjacency, tiles, starts, goals) is not None:
            connected += 1
    return connected, len(residential)
