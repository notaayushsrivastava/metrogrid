"""Tests for OSM multi-level road and overpass/underpass extraction."""

from app.services.rasterizer import (
    GeoBounds,
    GeoFeature,
    LAYER_ROAD,
    classify_road_level_and_ramp,
    rasterize_features,
)
from app.services.gis import overpass_elements_to_features


def test_classify_road_level_ground():
    tags = {"highway": "residential"}
    level, elevation, is_ramp = classify_road_level_and_ramp(tags)
    assert level == 0
    assert elevation == 0.0
    assert not is_ramp


def test_classify_road_bridge():
    tags = {"highway": "secondary", "bridge": "yes"}
    level, elevation, is_ramp = classify_road_level_and_ramp(tags)
    assert level == 1
    assert elevation == 6.0
    assert not is_ramp


def test_classify_road_tunnel():
    tags = {"highway": "primary", "tunnel": "yes"}
    level, elevation, is_ramp = classify_road_level_and_ramp(tags)
    assert level == -1
    assert elevation == -6.0
    assert not is_ramp


def test_classify_road_layer_override():
    tags = {"highway": "motorway", "bridge": "yes", "layer": "2"}
    level, elevation, is_ramp = classify_road_level_and_ramp(tags)
    assert level == 2
    assert elevation == 12.0

    tags_neg = {"highway": "service", "tunnel": "yes", "layer": "-2"}
    level_neg, elev_neg, is_ramp_neg = classify_road_level_and_ramp(tags_neg)
    assert level_neg == -2
    assert elev_neg == -12.0


def test_classify_road_ramps():
    tags = {"highway": "motorway_link", "bridge": "yes"}
    level, elevation, is_ramp = classify_road_level_and_ramp(tags)
    assert level == 1
    assert elevation == 6.0
    assert is_ramp is True


def test_overpass_elements_to_features_multi_level():
    elements = [
        {
            "id": 101,
            "type": "way",
            "tags": {"highway": "primary", "bridge": "yes", "layer": "1"},
            "geometry": [{"lat": 37.77, "lon": -122.41}, {"lat": 37.78, "lon": -122.41}],
        },
        {
            "id": 102,
            "type": "way",
            "tags": {"highway": "residential", "tunnel": "yes"},
            "geometry": [{"lat": 37.77, "lon": -122.42}, {"lat": 37.78, "lon": -122.42}],
        },
    ]

    features = overpass_elements_to_features(elements)
    assert len(features) == 2
    f_bridge = next(f for f in features if f.order == (101, 0))
    f_tunnel = next(f for f in features if f.order == (102, 0))

    assert f_bridge.level == 1
    assert f_bridge.elevation == 6.0
    assert f_tunnel.level == -1
    assert f_tunnel.elevation == -6.0


def test_rasterize_features_produces_multi_level_spatial_roads():
    bounds = GeoBounds(north=37.8, south=37.7, east=-122.3, west=-122.5)
    origin = (0, 0)
    features = [
        GeoFeature(
            layer=LAYER_ROAD,
            tile_type=43,
            points=((-122.45, 37.75), (-122.35, 37.75)),
            closed=False,
            order=(1, 0),
            level=1,
            elevation=6.0,
            is_ramp=True,
        ),
        GeoFeature(
            layer=LAYER_ROAD,
            tile_type=41,
            points=((-122.40, 37.71), (-122.40, 37.79)),
            closed=False,
            order=(2, 0),
            level=-1,
            elevation=-6.0,
            is_ramp=False,
        ),
    ]

    tiles, zones, roads = rasterize_features(features, bounds, origin)
    assert len(roads) == 2
    r_elev = next(r for r in roads if r.level == 1)
    assert r_elev.elevation == 6.0
    assert r_elev.is_ramp is True
    assert all(p.z == 6.0 for p in r_elev.points)

    r_under = next(r for r in roads if r.level == -1)
    assert r_under.elevation == -6.0
    assert r_under.is_ramp is False
    assert all(p.z == -6.0 for p in r_under.points)

