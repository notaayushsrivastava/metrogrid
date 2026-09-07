"""Weighted A* pathfinding over the road graph (PRD §8, §9.6).

Model
-----
* Every road tile is a graph node; orthogonally adjacent road tiles are edges.
* Stepping onto a road tile costs ``ROAD_STEP_COST_BASE / speed_weight`` so
  faster roads yield cheaper paths (never score bonuses, PRD §9.6).
* ``h(n)`` is the Manhattan distance to the nearest goal multiplied by the
  minimum possible step cost, which keeps the heuristic admissible.
* Express highways (type 43) are access-restricted (PRD §8.3): zone tiles
  (residential/commercial) may only connect directly to non-highway roads.
  Highway tiles remain traversable from other road tiles.

All traversal orders are fixed so results are fully deterministic.
"""

from __future__ import annotations

import heapq
from itertools import count

from app import config
from app.models.tiles import is_road_tile, road_speed_weight
from app.services.sparse import TileMap

# Orthogonal neighbor offsets in a fixed order (deterministic expansion).
NEIGHBOR_OFFSETS: tuple[tuple[int, int], ...] = ((0, -1), (-1, 0), (1, 0), (0, 1))

# Road types a zone tile may connect to directly (PRD §8.3).
_ZONE_CONNECTABLE_ROADS = frozenset(
    t for t in config.ROAD_SPEED_WEIGHTS if t != config.ROAD_HIGHWAY
)


def step_cost(entering_tile_type: int) -> float:
    """Deterministic cost of entering a road tile based on its speed weight."""
    return config.ROAD_STEP_COST_BASE / road_speed_weight(entering_tile_type)


def build_road_adjacency(tiles: TileMap) -> dict[tuple[int, int], tuple[tuple[int, int], ...]]:
    """Build the road graph: road tile nodes with sorted road neighbors."""
    roads = {coord for coord, tile_type in tiles.items() if is_road_tile(tile_type)}
    adjacency: dict[tuple[int, int], tuple[tuple[int, int], ...]] = {}
    for x, y in roads:
        neighbors = []
        for dx, dy in NEIGHBOR_OFFSETS:
            neighbor = (x + dx, y + dy)
            if neighbor in roads:
                neighbors.append(neighbor)
        adjacency[(x, y)] = tuple(neighbors)
    return adjacency


def zone_adjacent_road_nodes(
    tiles: TileMap, zone_coords: set[tuple[int, int]]
) -> list[tuple[int, int]]:
    """Road tiles that a zone tile may directly connect to.

    Highway tiles are excluded: zone tiles access the network through
    regular roads, never straight onto an express highway (PRD §8.3).
    Results are sorted for determinism.
    """
    entry_nodes: set[tuple[int, int]] = set()
    for zx, zy in zone_coords:
        for dx, dy in NEIGHBOR_OFFSETS:
            neighbor = (zx + dx, zy + dy)
            neighbor_type = tiles.get(neighbor)
            if neighbor_type is not None and neighbor_type in _ZONE_CONNECTABLE_ROADS:
                entry_nodes.add(neighbor)
    return sorted(entry_nodes)


def _min_step_cost() -> float:
    """Cheapest possible single step across any road tile."""
    return config.ROAD_STEP_COST_BASE / max(config.ROAD_SPEED_WEIGHTS.values())


def astar_path_cost(
    adjacency: dict[tuple[int, int], tuple[tuple[int, int], ...]],
    tiles: TileMap,
    starts: list[tuple[int, int]],
    goals: list[tuple[int, int]],
) -> float | None:
    """Weighted A* cost from any start node to any goal node.

    Args:
        adjacency: road graph produced by :func:`build_road_adjacency`.
        tiles: sparse tile map (used for per-tile entering costs).
        starts: candidate entry nodes.
        goals: candidate goal nodes; the search stops at the cheapest one.

    Returns:
        The minimal accumulated cost, or ``None`` when no path exists.
    """
    if not starts or not goals:
        return None

    goal_set = frozenset(goals)
    heuristic_base = _min_step_cost()

    def heuristic(node: tuple[int, int]) -> float:
        # Admissible: Manhattan distance × cheapest possible step.
        return heuristic_base * min(
            abs(node[0] - gx) + abs(node[1] - gy) for gx, gy in goals
        )

    tie_breaker = count()
    open_heap: list[tuple[float, float, int, tuple[int, int]]] = []
    best_known: dict[tuple[int, int], float] = {}

    for start in starts:
        if start not in adjacency:
            continue
        g = 0.0
        best_known[start] = g
        heapq.heappush(open_heap, (heuristic(start), g, next(tie_breaker), start))

    while open_heap:
        _f, g, _order, node = heapq.heappop(open_heap)
        if g > best_known.get(node, float("inf")):
            continue  # stale heap entry
        if node in goal_set:
            return g
        for neighbor in adjacency[node]:
            new_g = g + step_cost(tiles[neighbor])
            if new_g < best_known.get(neighbor, float("inf")):
                best_known[neighbor] = new_g
                heapq.heappush(
                    open_heap,
                    (new_g + heuristic(neighbor), new_g, next(tie_breaker), neighbor),
                )

    return None
