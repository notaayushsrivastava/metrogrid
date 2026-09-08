"""GIS rasterizer tests (PRD §7.3-7.5, §21, §25.1.11)."""

import pytest

from app import config
from app.services.rasterizer import (
    GeoBounds,
    GeoFeature,
    LAYER_AREA,
    LAYER_BUILDING,
    LAYER_ROAD,
    classify_feature,
    grid_span,
    lonlat_to_grid,
    rasterize_features,
    road_width_scale,
)

BOUNDS = GeoBounds(north=12.98, south=12.97, east=80.25, west=80.24)
ORIGIN = (0, 0)


def _feature(
    layer: int,
    tile_type: int,
    points,
    closed: bool,
    order: tuple = (0, 0),
) -> GeoFeature:
    return GeoFeature(
        layer=layer,
        tile_type=tile_type,
        points=tuple(points),
        closed=closed,
        order=order,
    )


class TestProjection:
    def test_deterministic_for_identical_inputs(self):
        lon, lat = 80.245, 12.975
        span_x, span_y = grid_span(BOUNDS)
        first = lonlat_to_grid(lon, lat, BOUNDS, ORIGIN, span_x, span_y)
        for _ in range(5):
            assert lonlat_to_grid(lon, lat, BOUNDS, ORIGIN, span_x, span_y) == first

    def test_corners_map_to_span_extremes(self):
        span_x, span_y = grid_span(BOUNDS)
        assert lonlat_to_grid(80.24, 12.98, BOUNDS, ORIGIN, span_x, span_y) == (0, 0)
        # y grows southward, x grows eastward.
        gx, gy = lonlat_to_grid(80.25, 12.97, BOUNDS, ORIGIN, span_x, span_y)
        assert gx == span_x - 1
        assert gy == span_y - 1

    def test_origin_offsets_the_grid(self):
        span_x, span_y = grid_span(BOUNDS)
        gx, gy = lonlat_to_grid(80.24, 12.98, BOUNDS, (100, -50), span_x, span_y)
        assert (gx, gy) == (100, -50)

    def test_grid_span_is_clamped_and_positive(self):
        tiny = GeoBounds(north=0.0001, south=0.0, east=0.0001, west=0.0)
        span_x, span_y = grid_span(tiny)
        assert config.MIN_GRID_SPAN <= span_x <= config.MAX_GRID_SPAN
        assert config.MIN_GRID_SPAN <= span_y <= config.MAX_GRID_SPAN


class TestMetadataMapping:
    """PRD §7.5 mapping table, including safe fallbacks."""

    @pytest.mark.parametrize(
        "highway,expected",
        [
            ("motorway", 43),
            ("trunk", 43),
            ("primary", 42),
            ("secondary", 42),
            ("tertiary", 41),
            ("residential", 41),
            ("service", 41),
            ("footway", 40),
            ("pedestrian", 40),
            ("steps", 40),
            ("unknown_road_class", 4),  # safe generic fallback
        ],
    )
    def test_road_classes(self, highway, expected):
        assert classify_feature({"highway": highway}) == (LAYER_ROAD, expected, False)

    @pytest.mark.parametrize(
        "building",
        [
            "apartments",
            "house",
            "retail",
            "office",
            "warehouse",
            "totally_unknown",
        ],
    )
    def test_building_classes_return_none(self, building):
        assert classify_feature({"building": building}) is None

    def test_building_no_is_not_a_feature(self):
        assert classify_feature({"building": "no"}) is None

    def test_green_spaces_return_none(self):
        assert classify_feature({"leisure": "park"}) is None
        assert classify_feature({"natural": "wood"}) is None
        assert classify_feature({"landuse": "grass"}) is None

    def test_landuse_zones_return_none(self):
        assert classify_feature({"landuse": "industrial"}) is None
        assert classify_feature({"landuse": "retail"}) is None
        assert classify_feature({"landuse": "residential"}) is None

    def test_unrelated_metadata_is_skipped(self):
        assert classify_feature({"amenity": "bench", "name": "x"}) is None

    def test_road_wins_over_other_tags(self):
        result = classify_feature({"highway": "primary", "building": "yes"})
        assert result == (LAYER_ROAD, 42, False)


class TestRasterization:
    def test_polygon_fills_expected_cells(self):
        # A square covering a quarter of the bbox in projected space.
        feature = _feature(
            LAYER_BUILDING,
            2,
            (
                (80.24, 12.98),
                (80.245, 12.98),
                (80.245, 12.975),
                (80.24, 12.975),
            ),
            closed=True,
        )
        tiles, zones, roads = rasterize_features([feature], BOUNDS, ORIGIN)
        assert tiles
        assert len(zones) == 0  # Building zones scrapped from map import
        assert all(t == 2 for t in tiles.values())

        # Everything stays inside the projected span.
        span_x, span_y = grid_span(BOUNDS)
        for (x, y) in tiles:
            assert 0 <= x < span_x and 0 <= y < span_y

    def test_polyline_marks_cells_along_path(self):
        feature = _feature(
            LAYER_ROAD,
            41,
            ((80.24, 12.98), (80.25, 12.98)),  # west → east straight road
            closed=False,
        )
        tiles, zones, roads = rasterize_features([feature], BOUNDS, ORIGIN)
        assert tiles
        assert len(roads) == 1
        assert roads[0].type == 41
        assert all(t == 41 for t in tiles.values())
        ys = {y for (_, y) in tiles}
        assert len(ys) == 1  # a straight road stays on one row

    def test_wide_road_paints_two_cell_corridor(self):
        feature = _feature(
            LAYER_ROAD,
            43,
            ((80.24, 12.98), (80.25, 12.98)),
            closed=False,
        )
        tiles, *_ = rasterize_features([feature], BOUNDS, ORIGIN)
        assert tiles
        ys = {y for (_, y) in tiles}
        assert len(ys) >= 2  # highway corridor is ≥ 2 cells wide

    def test_roads_paint_over_buildings(self):
        building = _feature(
            LAYER_BUILDING,
            1,
            ((80.244, 12.979), (80.246, 12.979), (80.246, 12.977), (80.244, 12.977)),
            closed=True,
        )
        road = _feature(
            LAYER_ROAD,
            41,
            ((80.24, 12.978), (80.25, 12.978)),
            closed=False,
            order=(1, 0),
        )
        tiles, *_ = rasterize_features([building, road], BOUNDS, ORIGIN)
        assert tiles
        # Roads paint last, so every cell on the road's row is road
        # regardless of the building underneath it.
        road_rows = {y for (_, y), t in tiles.items() if t == 41}
        assert road_rows
        assert len(road_rows) == 1
        for (x, y), t in tiles.items():
            if y in road_rows:
                assert t == 41

    def test_determinism_across_feature_orders(self):
        building = _feature(
            LAYER_BUILDING,
            1,
            ((80.244, 12.979), (80.246, 12.979), (80.246, 12.977), (80.244, 12.977)),
            closed=True,
        )
        park = _feature(
            LAYER_AREA,
            3,
            ((80.241, 12.979), (80.243, 12.979), (80.243, 12.977), (80.241, 12.977)),
            closed=True,
            order=(1, 0),
        )
        a = rasterize_features([building, park], BOUNDS, ORIGIN)
        b = rasterize_features([park, building], BOUNDS, ORIGIN)
        assert a == b

    def test_import_cap_is_enforced_deterministically(self, monkeypatch):
        monkeypatch.setattr(config, "MAX_IMPORTED_TILES", 5)
        features = [
            _feature(
                LAYER_BUILDING,
                1,
                (
                    (80.2400 + i * 0.002, 12.9790),
                    (80.2404 + i * 0.002, 12.9790),
                    (80.2404 + i * 0.002, 12.9750),
                    (80.2400 + i * 0.002, 12.9750),
                ),
                closed=True,
                order=(i, 0),
            )
            for i in range(5)
        ]
        tiles, *_ = rasterize_features(features, BOUNDS, ORIGIN)
        assert len(tiles) <= 5


def _road_feature(lon_lat_points, tile_type=41, closed=False):
    return _feature(LAYER_ROAD, tile_type, lon_lat_points, closed=closed)


class TestRoadWidthScaling:
    """Spatial road widths should shrink on sparse imports (few tiles)."""

    def test_scale_full_at_and_above_threshold(self):
        assert road_width_scale(30, 20) == 1.0
        assert road_width_scale(100, 100) == 1.0
        assert road_width_scale(30, 30) == 1.0

    def test_scale_minimum_on_tiny_grid(self):
        # Below the threshold the scale ramps down to the floor.
        assert road_width_scale(1, 1) == config.GIS_ROAD_WIDTH_SCALE_MIN
        assert road_width_scale(4, 4) == config.GIS_ROAD_WIDTH_SCALE_MIN

    def test_scale_monotone_with_span(self):
        small = road_width_scale(5, 5)
        mid = road_width_scale(15, 15)
        full = road_width_scale(60, 60)
        assert small <= mid <= full
        assert small < full

    def test_dense_import_keeps_full_road_width(self):
        # BOUNDS is a 0.01° box → clamped dense span → scale 1.0.
        feature = _road_feature(((80.24, 12.98), (80.25, 12.98)), tile_type=43)
        *_, roads = rasterize_features([feature], BOUNDS, ORIGIN)
        assert roads
        assert roads[0].width == 16.0  # highway, full scale

    def test_sparse_import_scales_road_width_down(self, monkeypatch):
        # Raise the full-scale threshold above the actual grid span so the
        # import is treated as sparse and widths shrink below real-world size.
        monkeypatch.setattr(config, "GIS_ROAD_WIDTH_SCALE_TILES", 1000.0)
        feature = _road_feature(((80.24, 12.98), (80.25, 12.98)), tile_type=43)
        span_x, span_y = grid_span(BOUNDS)
        expected_scale = road_width_scale(span_x, span_y)
        *_, roads = rasterize_features([feature], BOUNDS, ORIGIN)
        assert roads
        assert roads[0].width == round(16.0 * expected_scale, 2)
        assert roads[0].width < 16.0


class TestRoadLengthProportionality:
    """Imported road points are in CELL units so their rasterized length stays
    proportional to the imported grid (regression: points were divided by 10,
    making every road ~10× too short)."""

    def test_full_width_road_spans_the_imported_grid(self):
        # A straight highway from the west edge to the east edge of the bbox.
        feature = _road_feature(((80.24, 12.98), (80.25, 12.98)), tile_type=43)
        span_x, span_y = grid_span(BOUNDS)
        *_, roads = rasterize_features([feature], BOUNDS, ORIGIN)
        assert roads
        xs = sorted(p.x for p in roads[0].points)
        ys = sorted(p.y for p in roads[0].points)
        length_cells = xs[-1] - xs[0]
        # Points are in cells: the road spans ~the full grid width.
        assert length_cells > 10  # clearly NOT ÷10 (would be ~3.6)
        assert abs(length_cells - span_x) < 0.5
        # Rasterizing (÷1 in cells) yields a corridor along that whole width.
        from app.services.scoring import rasterize_freeform_roads_to_tiles

        tiles = rasterize_freeform_roads_to_tiles(roads, {})
        x_cells = {x for (x, y) in tiles}
        assert len(x_cells) > 10
        assert min(x_cells) <= 0.0
        assert max(x_cells) >= span_x - 1
