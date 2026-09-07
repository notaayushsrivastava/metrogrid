"""Tests for Phase 8 Terrain & Elevation backend scoring and slope penalties."""

from app import config
from app.models.requests import CalculateRequest, TileObject
from app.services import pathfinding, scoring


def test_terrain_scenic_view_bonus():
    # Residential tile on flat terrain vs elevated terrain (elevation >= 5.0m)
    tiles = {"0,0": TileObject(type=config.RESIDENTIAL)}

    req_flat = CalculateRequest(tiles=tiles, terrain={"0,0": 0.0})
    req_elev = CalculateRequest(tiles=tiles, terrain={"0,0": 8.0})

    raw_flat = scoring.compute_raw_scores(
        {(0, 0): config.RESIDENTIAL}, terrain=req_flat.terrain
    )
    raw_elev = scoring.compute_raw_scores(
        {(0, 0): config.RESIDENTIAL}, terrain=req_elev.terrain
    )

    assert raw_elev["livability"] == raw_flat["livability"] + config.SCENIC_VIEW_BONUS


def test_terrain_slope_pathfinding_penalty():
    # Road network from (0,0) to (1,0)
    tiles = {
        (0, 0): config.ROAD_LOCAL,
        (1, 0): config.ROAD_LOCAL,
    }
    adjacency = pathfinding.build_road_adjacency(tiles)

    # Flat cost
    cost_flat = pathfinding.astar_path_cost(
        adjacency, tiles, starts=[(0, 0)], goals=[(1, 0)], terrain=None
    )
    assert cost_flat is not None

    # Steep terrain slope between (0,0) and (1,0)
    terrain_slope = {"0,0": 0.0, "1,0": 10.0}
    cost_steep = pathfinding.astar_path_cost(
        adjacency, tiles, starts=[(0, 0)], goals=[(1, 0)], terrain=terrain_slope
    )
    assert cost_steep is not None
    assert cost_steep == cost_flat + (10.0 * config.SLOPE_PENALTY_WEIGHT)
