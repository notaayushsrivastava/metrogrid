"""Deterministic congestion estimation (PRD §9.7).

Congestion = demand / capacity per road tile:

* demand is the number of Residential zones clustered within a fixed
  Manhattan radius of the road tile (road usage proxy);
* capacity comes from ROAD_CAPACITIES (road subtype throughput).

The model is deterministic (no randomness, no iteration order dependence)
and reported as an additive ``traffic_detail`` in the calculate response —
the authoritative global ``traffic`` score is unchanged.
"""

from __future__ import annotations

from app import config
from app.models.tiles import is_road_tile
from app.services.geometry import manhattan_distance
from app.services.sparse import TileMap

# Residential zones within this radius are treated as demand for a road tile.
CONGESTION_DEMAND_RADIUS = 6

# Road tiles with demand/capacity above this ratio count as "congested".
CONGESTION_HIGH_THRESHOLD = 0.5


def estimate_congestion(tiles: TileMap) -> dict[str, float | int]:
    """Per-road-tile demand/capacity, plus summary stats.

    Returns:
        {
          "average_ratio": float,   # mean demand/capacity across roads
          "congested_roads": int,   # roads above the high threshold
          "road_count": int,        # road tiles evaluated
          "max_ratio": float,
        }
    """
    roads = sorted(
        (coord for coord, t in tiles.items() if is_road_tile(t)),
        key=lambda c: (c[1], c[0]),  # deterministic order
    )
    if not roads:
        return {
            "average_ratio": 0.0,
            "congested_roads": 0,
            "road_count": 0,
            "max_ratio": 0.0,
        }

    residential = [
        coord for coord, t in tiles.items() if t == config.RESIDENTIAL
    ]

    ratios: list[float] = []
    congested = 0
    for rx, ry in roads:
        demand = sum(
            1
            for hx, hy in residential
            if manhattan_distance(rx, ry, hx, hy) <= CONGESTION_DEMAND_RADIUS
        )
        capacity = config.ROAD_CAPACITIES[tiles[(rx, ry)]]
        ratio = demand / capacity if capacity else 0.0
        ratios.append(ratio)
        if ratio >= CONGESTION_HIGH_THRESHOLD:
            congested += 1

    return {
        "average_ratio": round(sum(ratios) / len(ratios), 4),
        "congested_roads": congested,
        "road_count": len(roads),
        "max_ratio": round(max(ratios), 4),
    }