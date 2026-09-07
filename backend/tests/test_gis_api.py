"""GIS import API tests (PRD §7, §12.2, §20.2, §25.1.11)."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import gis as gis_service
from app.services.persistence import (
    LayoutStore,
    validate_grid_state_payload,
    validate_zones_payload,
)
from app.services.rasterizer import GeoBounds

client = TestClient(app)

BOUNDS = {"north": 12.98, "south": 12.97, "east": 80.25, "west": 80.24}


@pytest.fixture(autouse=True)
def _sample_provider(monkeypatch):
    """Pin the deterministic sample provider for every API test."""
    monkeypatch.setattr(config, "GIS_DEFAULT_PROVIDER", "sample")


class TestGisImportContract:
    def test_import_returns_prd_response_shape(self):
        response = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}},
        )
        assert response.status_code == 200
        body = response.json()
        assert set(body.keys()) == {"tiles_imported", "updated_grid"}
        assert body["tiles_imported"] > 0
        assert isinstance(body["updated_grid"], dict)
        for key, tile in body["updated_grid"].items():
            x_str, y_str = key.split(",")
            int(x_str), int(y_str)  # keys are "x,y"
            assert set(tile.keys()) == {"type"}
            assert isinstance(tile["type"], int)

    def test_import_is_deterministic(self):
        payload = {"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}}
        first = client.post("/api/gis/import", json=payload).json()
        for _ in range(3):
            assert client.post("/api/gis/import", json=payload).json() == first

    def test_origin_shifts_grid_coordinates(self):
        at_zero = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}},
        ).json()
        at_offset = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 500, "y": -500}},
        ).json()
        assert at_zero["tiles_imported"] == at_offset["tiles_imported"]
        first_key = next(iter(at_zero["updated_grid"]))
        first_offset_key = next(iter(at_offset["updated_grid"]))
        x0, y0 = map(int, first_key.split(","))
        x1, y1 = map(int, first_offset_key.split(","))
        assert (x1 - x0, y1 - y0) == (500, -500)

    def test_all_imported_types_are_supported(self):
        body = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}},
        ).json()
        for tile in body["updated_grid"].values():
            assert tile["type"] in config.VALID_TILE_TYPES


class TestGisImportValidation:
    def test_inverted_bounds_rejected_422(self):
        response = client.post(
            "/api/gis/import",
            json={
                "bounds": {
                    "north": 12.97,
                    "south": 12.98,
                    "east": 80.25,
                    "west": 80.24,
                },
                "grid_origin": {"x": 0, "y": 0},
            },
        )
        assert response.status_code == 422

    def test_oversized_area_rejected_422(self):
        response = client.post(
            "/api/gis/import",
            json={
                "bounds": {
                    "north": 13.98,
                    "south": 12.97,
                    "east": 80.25,
                    "west": 80.24,
                },
                "grid_origin": {"x": 0, "y": 0},
            },
        )
        assert response.status_code == 422

    def test_out_of_range_latitude_rejected_422(self):
        response = client.post(
            "/api/gis/import",
            json={
                "bounds": {
                    "north": 200.0,
                    "south": 12.97,
                    "east": 80.25,
                    "west": 80.24,
                },
                "grid_origin": {"x": 0, "y": 0},
            },
        )
        assert response.status_code == 422

    def test_unknown_field_rejected_422(self):
        response = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}, "extra": True},
        )
        assert response.status_code == 422

    def test_unknown_provider_rejected_400(self, monkeypatch):
        monkeypatch.setattr(config, "GIS_DEFAULT_PROVIDER", "bogus")
        response = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}},
        )
        assert response.status_code == 400
        assert "provider" in response.json()["detail"].lower()

    def test_source_unavailable_maps_to_502(self, monkeypatch):
        provider = gis_service.SampleProvider()

        def fail(_bounds):
            raise gis_service.GisSourceUnavailable("map data source is unreachable")

        monkeypatch.setattr(provider, "fetch_features", fail)
        monkeypatch.setattr(gis_service, "get_provider", lambda: provider)
        response = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}},
        )
        assert response.status_code == 502
        assert isinstance(response.json()["detail"], str)

    def test_source_timeout_maps_to_504(self, monkeypatch):
        provider = gis_service.SampleProvider()

        def fail(_bounds):
            raise gis_service.GisSourceUnavailable("timed out", timeout=True)

        monkeypatch.setattr(provider, "fetch_features", fail)
        monkeypatch.setattr(gis_service, "get_provider", lambda: provider)
        response = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}},
        )
        assert response.status_code == 504

    def test_empty_results_return_zero_tiles(self, monkeypatch):
        provider = gis_service.SampleProvider()
        monkeypatch.setattr(provider, "fetch_features", lambda _bounds: [])
        monkeypatch.setattr(gis_service, "get_provider", lambda: provider)
        response = client.post(
            "/api/gis/import",
            json={"bounds": BOUNDS, "grid_origin": {"x": 0, "y": 0}},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["tiles_imported"] == 0
        assert body["updated_grid"] == {}


class TestOverpassParsing:
    def test_elements_convert_to_features_deterministically(self):
        elements = [
            {
                "type": "way",
                "id": 2,
                "tags": {"highway": "motorway"},
                "geometry": [
                    {"lon": 80.24, "lat": 12.98},
                    {"lon": 80.25, "lat": 12.98},
                ],
            },
            {
                "type": "way",
                "id": 1,
                "tags": {"building": "yes"},
                "geometry": [
                    {"lon": 80.241, "lat": 12.975},
                    {"lon": 80.242, "lat": 12.975},
                    {"lon": 80.242, "lat": 12.974},
                    {"lon": 80.241, "lat": 12.974},
                ],
            },
        ]
        features = gis_service.overpass_elements_to_features(elements)
        # Sorted by element id regardless of input order.
        assert [f.order[0] for f in features] == [1, 2]
        assert features[0].closed is True
        assert features[0].tile_type == config.RESIDENTIAL
        assert features[1].closed is False
        assert features[1].tile_type == config.ROAD_HIGHWAY

        # HTTP 429 maps to GisSourceUnavailable.
        class FakeResponse:
            status_code = 429

        provider = gis_service.OverpassProvider(urls=["http://unit.test"], timeout=1)
        original_post = httpx.post
        try:
            httpx.post = lambda *a, **k: FakeResponse()
            with pytest.raises(gis_service.GisSourceUnavailable):
                provider.fetch_features(GeoBounds(north=1, south=0, east=1, west=0))
        finally:
            httpx.post = original_post

    def test_unrelated_elements_are_skipped(self):
        elements = [
            {"type": "node", "id": 1, "lat": 12.97, "lon": 80.24},
            {"type": "way", "id": 2, "tags": {"waterway": "river"}, "geometry": []},
        ]
        assert gis_service.overpass_elements_to_features(elements) == []


class TestV2LayoutWrapper:
    """Phase 5 (Day 2): freeform zones persist via the v2 layout wrapper."""

    def _v2_payload(self) -> dict:
        return {
            "version": 2,
            "tiles": {"0,0": {"type": 1}},
            "zones": [
                {
                    "id": "z1",
                    "type": 2,
                    "position": {"x": 10.5, "y": 12.25},
                    "rotation": 45.0,
                    "footprint": {"width": 3.0, "depth": 2.0},
                    "attributes": {},
                }
            ],
        }

    def test_v2_wrapper_validates_and_yields_tiles(self):
        tiles = validate_grid_state_payload(self._v2_payload())
        assert tiles == {(0, 0): 1}

    def test_v2_zones_validate(self):
        zones = validate_zones_payload(self._v2_payload()["zones"])
        assert zones[0]["id"] == "z1"
        assert zones[0]["footprint"]["width"] == 3.0

    def test_v2_zone_rejects_road_type(self):
        payload = self._v2_payload()
        payload["zones"][0]["type"] = 41
        with pytest.raises(ValueError):
            validate_zones_payload(payload["zones"])

    def test_v2_zone_rejects_bad_geometry(self):
        payload = self._v2_payload()
        payload["zones"][0]["footprint"] = {"width": 0, "depth": 2}
        with pytest.raises(ValueError):
            validate_zones_payload(payload["zones"])

    def test_legacy_layouts_still_validate(self):
        tiles = validate_grid_state_payload({"0,0": {"type": 1}})
        assert tiles == {(0, 0): 1}

    def test_save_roundtrips_zones_through_memory_store(self):
        store = LayoutStore()
        row = store.save_layout("V2 City", self._v2_payload())
        loaded = store.load_layout(row["id"])
        grid = loaded["grid_state"]
        assert grid["version"] == 2
        assert grid["tiles"] == {"0,0": {"type": 1}}
        assert grid["zones"][0]["id"] == "z1"
        assert loaded["tile_count"] == 1


class TestOverpassMirrorFallback:
    """Falls back to mirrors when the primary times out or is rate-limited."""

    def _bounds(self) -> GeoBounds:
        return GeoBounds(north=12.98, south=12.97, east=80.25, west=80.24)

    def _ok_response(self) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "way",
                        "id": 1,
                        "tags": {"highway": "residential"},
                        "geometry": [
                            {"lon": 80.240, "lat": 12.975},
                            {"lon": 80.245, "lat": 12.975},
                        ],
                    }
                ]
            },
            request=httpx.Request("POST", "http://mirror.test"),
        )

    def test_falls_back_to_mirror_on_primary_timeout(self, monkeypatch):
        provider = gis_service.OverpassProvider(
            urls=["http://primary.test", "http://mirror.test"], timeout=1
        )
        attempted: list[str] = []

        def fake_post(url, **_kwargs):
            attempted.append(url)
            if url == "http://primary.test":
                raise httpx.ReadTimeout("timed out", request=None)
            return self._ok_response()

        monkeypatch.setattr(httpx, "post", fake_post)
        features = provider.fetch_features(self._bounds())
        assert [f.tile_type for f in features] == [config.ROAD_LOCAL]
        assert attempted == ["http://primary.test", "http://mirror.test"]

    def test_falls_back_on_429_rate_limit(self, monkeypatch):
        provider = gis_service.OverpassProvider(
            urls=["http://primary.test", "http://mirror.test"], timeout=1
        )
        calls = {"n": 0}

        def fake_post(url, **_kwargs):
            calls["n"] += 1
            if url == "http://primary.test":
                return httpx.Response(429, request=httpx.Request("POST", url))
            return self._ok_response()

        monkeypatch.setattr(httpx, "post", fake_post)
        features = provider.fetch_features(self._bounds())
        assert features
        assert calls["n"] == 2

    def test_all_endpoints_timeout_reports_timeout_flag(self, monkeypatch):
        provider = gis_service.OverpassProvider(
            urls=["http://a.test", "http://b.test"], timeout=1
        )

        def fake_post(url, **_kwargs):
            raise httpx.ReadTimeout("timed out", request=None)

        monkeypatch.setattr(httpx, "post", fake_post)
        with pytest.raises(gis_service.GisSourceUnavailable) as exc_info:
            provider.fetch_features(self._bounds())
        assert exc_info.value.timeout is True

    def test_primary_env_override_keeps_mirrors(self, monkeypatch):
        monkeypatch.setenv(config.OVERPASS_URL_ENV, "http://custom.test")
        provider = gis_service.OverpassProvider()
        assert provider.urls[0] == "http://custom.test"
        assert len(provider.urls) == 1 + len(config.OVERPASS_FALLBACK_URLS)

    def test_timeout_env_override(self, monkeypatch):
        monkeypatch.setenv(config.GIS_TIMEOUT_ENV, "90")
        provider = gis_service.OverpassProvider()
        assert provider.timeout == 90.0

