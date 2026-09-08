"""Tests for the scoring engine (PRD §25.1 #3, #4, #5, #9 + local delta §11)."""

from app import config
from app.models.requests import LatestAction, SpatialRoadPayload, SpatialRoadPoint, SpatialZonePayload
from app.services.scoring import (
    compute_local_delta,
    compute_raw_scores,
    compute_scores,
    freeform_livability_pair_factors,
    normalize_score,
    rasterize_freeform_roads_to_tiles,
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


def _road(type_, points, width):
    return SpatialRoadPayload(
        id="r",
        type=type_,
        points=[SpatialRoadPoint(x=float(x), y=float(y)) for x, y in points],
        width=float(width),
    )


class TestRoadRasterizationProportionality:
    """Road points are CELL coordinates (length proportional to the grid);
    only WIDTH is in meters and converts to cells via ÷10."""

    def test_cell_points_produce_proportional_length(self):
        # A road spanning cells 0..20 must paint cells across that whole width,
        # not a tiny 0..2 corridor.
        road = _road(config.ROAD_LOCAL, [(0.0, 0.0), (20.0, 0.0)], 8.0)
        tiles = rasterize_freeform_roads_to_tiles([road], {})
        xs = {x for (x, y) in tiles}
        assert min(xs) == 0
        assert max(xs) == 20
        assert len(xs) > 10

    def test_width_meters_convert_to_cell_thickness(self):
        # 8 m local road → 1 cell thick; 20 m highway → 2 cells thick.
        local = _road(config.ROAD_LOCAL, [(0.0, 0.0), (10.0, 0.0)], 8.0)
        wide = _road(config.ROAD_HIGHWAY, [(0.0, 0.0), (10.0, 0.0)], 20.0)
        thin = rasterize_freeform_roads_to_tiles([local], {})
        thick = rasterize_freeform_roads_to_tiles([wide], {})
        ys_thin = {y for (x, y) in thin}
        ys_thick = {y for (x, y) in thick}
        assert max(ys_thin) - min(ys_thin) == 0  # 1 cell (8/10 → 1)
        assert max(ys_thick) - min(ys_thick) == 1  # 2 cells (20/10 → 2)


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
    """Freeform livability is proximity-based (PRD §9.3, §9.4), matching the
    grid pair counts — not total square meterage."""

    def _zone(self, zid, ztype, x, y, area=100.0, attrs=None):
        from app.models.requests import Footprint, SpatialZonePayload

        return SpatialZonePayload(
            id=zid,
            type=ztype,
            position={"x": x, "y": y},
            footprint=Footprint(width=10, depth=10),
            area=area,
            attributes=attrs,
        )

    def test_green_bonus_is_proximity_based(self):
        # Two green zones within GREEN_RADIUS (Manhattan ≤ 3) of the residential
        # zone each add the bonus; a distant green adds nothing.
        inside = [
            self._zone("r", config.RESIDENTIAL, 0, 0),
            self._zone("g1", config.GREEN, 2, 0),
            self._zone("g2", config.GREEN, 0, 3),
            self._zone("g_far", config.GREEN, 50, 50),
        ]
        scores_inside = compute_scores({}, zones=inside, is_freeform=True)
        assert (
            scores_inside["livability"]
            == config.LIVABILITY_BASE + 2 * config.GREEN_BONUS
        )

    def test_industrial_penalty_is_proximity_based(self):
        # The user-facing bug: a factory far from any residential zone must NOT
        # dent livability. Only industrial zones within INDUSTRIAL_RADIUS
        # (Manhattan ≤ 4) of a residential zone apply the penalty.
        far_factory = [
            self._zone("r", config.RESIDENTIAL, 0, 0),
            self._zone("i_far", config.INDUSTRIAL, 50, 50),
        ]
        near_factory = [
            self._zone("r", config.RESIDENTIAL, 0, 0),
            self._zone("i_near", config.INDUSTRIAL, 3, 0),
        ]
        scores_far = compute_scores({}, zones=far_factory, is_freeform=True)
        scores_near = compute_scores({}, zones=near_factory, is_freeform=True)

        assert scores_far["livability"] == config.LIVABILITY_BASE
        assert (
            scores_near["livability"]
            == config.LIVABILITY_BASE - config.INDUSTRIAL_PENALTY
        )

    def test_green_and_industrial_near_residential_stack(self):
        zones = [
            self._zone("r", config.RESIDENTIAL, 0, 0),
            self._zone("g", config.GREEN, 1, 0),      # within GREEN_RADIUS
            self._zone("i", config.INDUSTRIAL, 2, 0),  # within INDUSTRIAL_RADIUS
        ]
        scores = compute_scores({}, zones=zones, is_freeform=True)
        assert (
            scores["livability"]
            == config.LIVABILITY_BASE + config.GREEN_BONUS - config.INDUSTRIAL_PENALTY
        )

    def test_freeform_scoring_scales_resources_by_commercial_square_meterage(self):
        small_com = [
            self._zone("r", config.RESIDENTIAL, 0, 0, area=100.0),
            self._zone("c", config.COMMERCIAL, 10, 0, area=25.0),
        ]
        large_com = [
            self._zone("r", config.RESIDENTIAL, 0, 0, area=100.0),
            self._zone("c", config.COMMERCIAL, 10, 0, area=400.0),
        ]
        scores_small = compute_scores({}, zones=small_com, is_freeform=True)
        scores_large = compute_scores({}, zones=large_com, is_freeform=True)
        assert scores_large["resources"] > scores_small["resources"]

    def test_freeform_pair_factors_helper(self):
        zones = [
            self._zone("r", config.RESIDENTIAL, 0, 0),
            self._zone("g", config.GREEN, 1, 0),
            self._zone("i_near", config.INDUSTRIAL, 2, 0),
            self._zone("i_far", config.INDUSTRIAL, 100, 100),
        ]
        green_factor, ind_factor = freeform_livability_pair_factors(zones)
        assert green_factor == 1.0
        assert ind_factor == 1.0
