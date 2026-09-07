"""Tests for the scoring engine (PRD §25.1 #3, #4, #5, #9 + local delta §11)."""

from app import config
from app.models.requests import LatestAction
from app.services.scoring import (
    compute_local_delta,
    compute_raw_scores,
    compute_scores,
    normalize_score,
)
from app.services.sparse import TileMap


class TestResourceScoring:
    def test_residential_without_commercial_is_penalized(self):
        tiles: TileMap = {(0, 0): config.RESIDENTIAL}
        raw = compute_raw_scores(tiles)
        assert raw["resources"] == config.RESOURCES_BASE - config.RESOURCE_PENALTY

    def test_commercial_within_radius_grants_bonus(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (2, 0): config.COMMERCIAL,  # Manhattan distance 2 ≤ 4
        }
        raw = compute_raw_scores(tiles)
        assert raw["resources"] == config.RESOURCES_BASE + config.RESOURCE_BONUS

    def test_resource_radius_boundary_is_inclusive_at_4(self):
        near: TileMap = {(0, 0): config.RESIDENTIAL, (4, 0): config.COMMERCIAL}
        far: TileMap = {(0, 0): config.RESIDENTIAL, (5, 0): config.COMMERCIAL}
        assert compute_raw_scores(near)["resources"] == config.RESOURCES_BASE + config.RESOURCE_BONUS
        assert compute_raw_scores(far)["resources"] == config.RESOURCES_BASE - config.RESOURCE_PENALTY

    def test_each_residential_scored_independently(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,  # served by (1,0)
            (10, 0): config.RESIDENTIAL,  # unserved
            (1, 0): config.COMMERCIAL,
        }
        raw = compute_raw_scores(tiles)
        expected = config.RESOURCES_BASE + config.RESOURCE_BONUS - config.RESOURCE_PENALTY
        assert raw["resources"] == expected


class TestLivabilityScoring:
    def test_empty_city_is_baseline(self):
        raw = compute_raw_scores({})
        assert raw == {
            "livability": config.LIVABILITY_BASE,
            "resources": config.RESOURCES_BASE,
            "traffic": config.TRAFFIC_BASE,
        }

    def test_green_space_bonus(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.GREEN,
        }
        raw = compute_raw_scores(tiles)
        assert raw["livability"] == config.LIVABILITY_BASE + config.GREEN_BONUS

    def test_green_radius_boundary(self):
        inside: TileMap = {(0, 0): config.RESIDENTIAL, (3, 0): config.GREEN}
        outside: TileMap = {(0, 0): config.RESIDENTIAL, (4, 0): config.GREEN}
        assert compute_raw_scores(inside)["livability"] == config.LIVABILITY_BASE + config.GREEN_BONUS
        assert compute_raw_scores(outside)["livability"] == config.LIVABILITY_BASE

    def test_industrial_penalty(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 1): config.INDUSTRIAL,  # Manhattan distance 2 ≤ 4
        }
        raw = compute_raw_scores(tiles)
        assert raw["livability"] == config.LIVABILITY_BASE - config.INDUSTRIAL_PENALTY

    def test_industrial_outside_radius_has_no_effect(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (5, 0): config.INDUSTRIAL,  # Manhattan distance 5 > 4
        }
        assert compute_raw_scores(tiles)["livability"] == config.LIVABILITY_BASE

    def test_green_and_industrial_effects_stack(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.GREEN,
            (2, 0): config.GREEN,
            (1, 1): config.INDUSTRIAL,
        }
        raw = compute_raw_scores(tiles)
        expected = config.LIVABILITY_BASE + 2 * config.GREEN_BONUS - config.INDUSTRIAL_PENALTY
        assert raw["livability"] == expected


class TestTrafficScoring:
    def test_residential_without_roads_is_penalized(self):
        tiles: TileMap = {(0, 0): config.RESIDENTIAL}
        raw = compute_raw_scores(tiles)
        assert raw["traffic"] == config.TRAFFIC_BASE - config.TRAFFIC_DISCONNECT_PENALTY

    def test_connected_residential_has_no_penalty(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.ROAD_LOCAL,
            (2, 0): config.ROAD_LOCAL,
            (3, 0): config.COMMERCIAL,
        }
        assert compute_raw_scores(tiles)["traffic"] == config.TRAFFIC_BASE


class TestNormalization:
    def test_clamps_to_zero_and_hundred(self):
        assert normalize_score(-50) == 0
        assert normalize_score(150) == 100
        assert normalize_score(0) == 0
        assert normalize_score(100) == 100

    def test_half_up_rounding(self):
        assert normalize_score(72.4) == 72
        assert normalize_score(72.5) == 73

    def test_scores_always_within_range(self):
        # A pathological city must still produce 0-100 integers (PRD §10).
        tiles: TileMap = {(x, 0): config.INDUSTRIAL for x in range(20)}
        tiles[(19, 0)] = config.RESIDENTIAL
        for metric, value in compute_scores(tiles).items():
            assert isinstance(value, int)
            assert 0 <= value <= 100, metric


class TestDeterminism:
    def test_identical_inputs_identical_outputs(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.ROAD_LOCAL,
            (2, 0): config.ROAD_LOCAL,
            (3, 0): config.COMMERCIAL,
            (0, 1): config.GREEN,
            (5, 5): config.INDUSTRIAL,
        }
        first = compute_scores(tiles)
        for _ in range(5):
            assert compute_scores(tiles) == first


class TestLocalDelta:
    def test_none_when_no_action(self):
        assert compute_local_delta({}, None) is None

    def test_placement_reports_resource_penalty(self):
        # Placing an isolated residential: resources drop 50 → 30.
        tiles: TileMap = {(0, 0): config.RESIDENTIAL}
        action = LatestAction(x=0, y=0, type=config.RESIDENTIAL)
        delta = compute_local_delta(tiles, action)
        assert delta == {"x": 0, "y": 0, "value": -20, "metric": "resources"}

    def test_erase_reports_recovered_resources(self):
        # Erasing the isolated residential: resources recover 30 → 50.
        tiles: TileMap = {}
        action = LatestAction(
            x=0, y=0, type=config.EMPTY, previous_type=config.RESIDENTIAL
        )
        delta = compute_local_delta(tiles, action)
        assert delta == {"x": 0, "y": 0, "value": 20, "metric": "resources"}

    def test_park_reports_livability_bonus(self):
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.GREEN,
        }
        action = LatestAction(x=1, y=0, type=config.GREEN)
        delta = compute_local_delta(tiles, action)
        assert delta == {"x": 1, "y": 0, "value": 10, "metric": "livability"}

    def test_largest_absolute_change_wins(self):
        # Placing residential near park and industry: livability 70 → 65
        # (-5), resources 50 → 30 (-20), traffic 100 → 95 (-5). Resources
        # moves the most and is reported (PRD §11: most relevant change).
        tiles: TileMap = {
            (0, 0): config.RESIDENTIAL,
            (1, 0): config.GREEN,
            (1, 1): config.INDUSTRIAL,
        }
        action = LatestAction(x=0, y=0, type=config.RESIDENTIAL)
        delta = compute_local_delta(tiles, action)
        assert delta is not None
        assert delta["metric"] == "resources"
        assert delta["value"] == -20

    def test_no_change_reports_zero(self):
        # Placing a tile that changes nothing (green with no residents).
        tiles: TileMap = {(5, 5): config.GREEN}
        action = LatestAction(x=5, y=5, type=config.GREEN)
        delta = compute_local_delta(tiles, action)
        assert delta == {"x": 5, "y": 5, "value": 0, "metric": "livability"}


class TestFreeformAreaScoring:
    def test_freeform_scoring_scales_livability_by_green_square_meterage(self):
        from app.models.requests import Footprint, SpatialZonePayload

        small_green = [
            SpatialZonePayload(
                id="z1", type=config.RESIDENTIAL, position={"x": 0, "y": 0}, footprint=Footprint(width=10, depth=10), area=100.0
            ),
            SpatialZonePayload(
                id="z2", type=config.GREEN, position={"x": 10, "y": 0}, footprint=Footprint(width=10, depth=10), area=100.0
            ),
        ]
        large_green = [
            SpatialZonePayload(
                id="z1", type=config.RESIDENTIAL, position={"x": 0, "y": 0}, footprint=Footprint(width=10, depth=10), area=100.0
            ),
            SpatialZonePayload(
                id="z2", type=config.GREEN, position={"x": 10, "y": 0}, footprint=Footprint(width=30, depth=30), area=900.0
            ),
        ]

        scores_small = compute_scores({}, zones=small_green, is_freeform=True)
        scores_large = compute_scores({}, zones=large_green, is_freeform=True)

        assert scores_large["livability"] > scores_small["livability"]

    def test_freeform_scoring_scales_resources_by_commercial_square_meterage(self):
        from app.models.requests import Footprint, SpatialZonePayload

        small_com = [
            SpatialZonePayload(
                id="z1", type=config.RESIDENTIAL, position={"x": 0, "y": 0}, footprint=Footprint(width=10, depth=10), area=100.0
            ),
            SpatialZonePayload(
                id="z2", type=config.COMMERCIAL, position={"x": 10, "y": 0}, footprint=Footprint(width=5, depth=5), area=25.0
            ),
        ]
        large_com = [
            SpatialZonePayload(
                id="z1", type=config.RESIDENTIAL, position={"x": 0, "y": 0}, footprint=Footprint(width=10, depth=10), area=100.0
            ),
            SpatialZonePayload(
                id="z2", type=config.COMMERCIAL, position={"x": 10, "y": 0}, footprint=Footprint(width=20, depth=20), area=400.0
            ),
        ]

        scores_small = compute_scores({}, zones=small_com, is_freeform=True)
        scores_large = compute_scores({}, zones=large_com, is_freeform=True)

        assert scores_large["resources"] > scores_small["resources"]

    def test_freeform_scoring_scales_by_zone_attributes(self):
        from app.models.requests import Footprint, SpatialZonePayload

        single_floor_green = [
            SpatialZonePayload(
                id="z1", type=config.RESIDENTIAL, position={"x": 0, "y": 0}, footprint=Footprint(width=10, depth=10), area=100.0
            ),
            SpatialZonePayload(
                id="z2",
                type=config.GREEN,
                position={"x": 10, "y": 0},
                footprint=Footprint(width=10, depth=10),
                area=100.0,
                attributes={"floors": 1, "density": 1.0},
            ),
        ]
        multi_floor_green = [
            SpatialZonePayload(
                id="z1", type=config.RESIDENTIAL, position={"x": 0, "y": 0}, footprint=Footprint(width=10, depth=10), area=100.0
            ),
            SpatialZonePayload(
                id="z2",
                type=config.GREEN,
                position={"x": 10, "y": 0},
                footprint=Footprint(width=10, depth=10),
                area=100.0,
                attributes={"floors": 10, "density": 2.0},
            ),
        ]

        scores_base = compute_scores({}, zones=single_floor_green, is_freeform=True)
        scores_multi = compute_scores({}, zones=multi_floor_green, is_freeform=True)

        assert scores_multi["livability"] > scores_base["livability"]
