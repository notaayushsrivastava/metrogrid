"""Tests for congestion estimation (PRD §9.7)."""

from app import config
from app.services.congestion import estimate_congestion
from app.services.sparse import TileMap


def test_no_roads_returns_zero():
    tiles: TileMap = {(0, 0): config.RESIDENTIAL}
    result = estimate_congestion(tiles)
    assert result == {
        "average_ratio": 0.0,
        "congested_roads": 0,
        "road_count": 0,
        "max_ratio": 0.0,
    }


def test_road_with_no_residential_has_zero_demand():
    tiles: TileMap = {(0, 0): config.ROAD_LOCAL}
    result = estimate_congestion(tiles)
    assert result["road_count"] == 1
    assert result["average_ratio"] == 0.0


def test_congestion_scales_with_residential_density():
    # One local road (capacity 60) with 6 residential zones within radius 6.
    tiles: TileMap = {(0, 0): config.ROAD_LOCAL}
    for i in range(6):
        tiles[(i + 1, 0)] = config.RESIDENTIAL
    result = estimate_congestion(tiles)
    assert result["road_count"] == 1
    assert result["average_ratio"] == round(6 / 60, 4)
    assert result["max_ratio"] == round(6 / 60, 4)


def test_highway_handles_more_demand_than_local_road():
    # Same demand, different capacities → highway ratio is lower.
    demand_coords = [(i + 1, 0) for i in range(10)]
    local: TileMap = {(0, 0): config.ROAD_LOCAL}
    highway: TileMap = {(0, 0): config.ROAD_HIGHWAY}
    for coord in demand_coords:
        local[coord] = config.RESIDENTIAL
        highway[coord] = config.RESIDENTIAL

    local_result = estimate_congestion(local)
    highway_result = estimate_congestion(highway)
    assert highway_result["average_ratio"] < local_result["average_ratio"]


def test_congested_roads_threshold_count():
    # Local road capacity 60; enough residential within the demand radius
    # (6 cells) to push demand/capacity over the 0.5 high-congestion threshold.
    tiles: TileMap = {(0, 0): config.ROAD_LOCAL}
    # 6 residential zones within Manhattan distance 6 of the road at (0,0).
    residential_coords = [(1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0)]
    for coord in residential_coords:
        tiles[coord] = config.RESIDENTIAL
    result = estimate_congestion(tiles)
    # demand 6 / capacity 60 = 0.1 -> below threshold. Use a pedestrian path
    # (capacity 20) instead so 6/20 = 0.3; still below 0.5, so place more.
    # Recompute with a pedestrian path at capacity 20 and 11 residential:
    # 11/20 = 0.55 >= 0.5.
    tiles2: TileMap = {(0, 0): config.ROAD_PEDESTRIAN}
    for i, coord in enumerate(
        [(1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0), (0, 1), (0, 2), (0, 3), (0, 4), (0, 5)]
    ):
        tiles2[coord] = config.RESIDENTIAL
    result2 = estimate_congestion(tiles2)
    assert result2["road_count"] == 1
    assert result2["congested_roads"] == 1
    assert result2["max_ratio"] >= 0.5
