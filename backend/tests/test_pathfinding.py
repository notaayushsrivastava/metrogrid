"""Tests for the weighted road graph and A* (PRD §25.1 #6, #7, #8)."""

import pytest

from app import config
from app.services.pathfinding import (
    astar_path_cost,
    build_road_adjacency,
    step_cost,
    zone_adjacent_road_nodes,
)
from app.services.sparse import TileMap
from app.services.traffic import road_connected_residential_stats

approx = pytest.approx


class TestRoadWeights:
    def test_step_cost_is_inverse_of_speed_weight(self):
        assert step_cost(config.ROAD_PEDESTRIAN) == approx(10.0)
        assert step_cost(config.ROAD_LOCAL) == approx(10 / 3)
        assert step_cost(config.ROAD_AVENUE) == approx(2.0)
        assert step_cost(config.ROAD_HIGHWAY) == approx(1.0)

    def test_faster_road_yields_cheaper_path(self):
        # Two routes from (0,0) to (2,0):
        #   direct pedestrian lane: enter (1,0)=10.0, enter (2,0)=10/3 ≈ 13.33
        #   avenue detour: enter 3 avenues (2.0 each) + enter (2,0) local
        #     (10/3) ≈ 9.33
        # A* must find the avenue route even though it has more steps —
        # road speed weights shape the path (PRD §9.6).
        tiles: TileMap = {
            (0, 0): config.ROAD_LOCAL,
            (1, 0): config.ROAD_PEDESTRIAN,
            (2, 0): config.ROAD_LOCAL,
            (0, 1): config.ROAD_AVENUE,
            (1, 1): config.ROAD_AVENUE,
            (2, 1): config.ROAD_AVENUE,
        }
        adjacency = build_road_adjacency(tiles)
        cost = astar_path_cost(adjacency, tiles, starts=[(0, 0)], goals=[(2, 0)])
        assert cost == approx(3 * 2.0 + 10 / 3)


class TestAStar:
    def test_finds_path_through_road_line(self):
        tiles: TileMap = {
            (0, 0): config.ROAD_LOCAL,
            (1, 0): config.ROAD_LOCAL,
            (2, 0): config.ROAD_LOCAL,
        }
        adjacency = build_road_adjacency(tiles)
        cost = astar_path_cost(adjacency, tiles, [(0, 0)], [(2, 0)])
        # Two entering steps, each onto a local road (weight 3).
        assert cost == approx(2 * (10 / 3))

    def test_no_path_returns_none(self):
        tiles: TileMap = {
            (0, 0): config.ROAD_LOCAL,
            (5, 5): config.ROAD_LOCAL,
        }
        adjacency = build_road_adjacency(tiles)
        assert astar_path_cost(adjacency, tiles, [(0, 0)], [(5, 5)]) is None

    def test_adjacency_only_orthogonal_road_neighbors(self):
        tiles: TileMap = {
            (0, 0): config.ROAD_LOCAL,
            (1, 0): config.ROAD_LOCAL,
            (1, 1): config.RESIDENTIAL,  # not a road
            (0, 1): config.ROAD_LOCAL,
        }
        adjacency = build_road_adjacency(tiles)
        assert set(adjacency[(0, 0)]) == {(1, 0), (0, 1)}
        assert (1, 1) not in adjacency


class TestHighwayRestrictions:
    def test_zones_cannot_enter_highway_directly(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.ROAD_HIGHWAY,
            (2, 0): config.ROAD_HIGHWAY,
        }
        entry = zone_adjacent_road_nodes(tiles, {(0, 0)})
        assert entry == []  # highway is not directly accessible (PRD §8.3)

    def test_highway_reachable_through_regular_road(self):
        # Residential → local road → highway → local road → Commercial.
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.ROAD_LOCAL,
            (2, 0): config.ROAD_HIGHWAY,
            (3, 0): config.ROAD_HIGHWAY,
            (4, 0): config.ROAD_LOCAL,
            (5, 0): config.COMMERCIAL,
        }
        connected, total = road_connected_residential_stats(tiles)
        assert (connected, total) == (1, 1)


class TestConnectivityStats:
    def test_unconnected_residential_counted(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (4, 0): config.COMMERCIAL,
            # roads exist but do not link the two zones
            (1, 0): config.ROAD_LOCAL,
            (6, 0): config.ROAD_LOCAL,
        }
        connected, total = road_connected_residential_stats(tiles)
        assert (connected, total) == (0, 1)

    def test_no_roads_means_unconnected(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (2, 0): config.COMMERCIAL,
        }
        assert road_connected_residential_stats(tiles) == (0, 1)

    def test_no_commercial_means_unconnected(self):
        tiles: TileMap = {(0, 0): config.RESIDENTIAL, (1, 0): config.ROAD_LOCAL}
        assert road_connected_residential_stats(tiles) == (0, 1)

    def test_connected_via_road_path(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.ROAD_LOCAL,
            (2, 0): config.ROAD_LOCAL,
            (3, 0): config.COMMERCIAL,
        }
        assert road_connected_residential_stats(tiles) == (1, 1)

