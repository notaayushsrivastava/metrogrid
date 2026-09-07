"""API integration tests: /api/health and /api/calculate (PRD §12, §25.3)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _advanced_payload(tiles: dict, action: dict | None = None) -> dict:
    payload: dict = {"tiles": tiles}
    if action is not None:
        payload["latest_action"] = action
    return payload


class TestHealth:
    def test_health_ok(self):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestAdvancedContract:
    def test_empty_city_baseline(self):
        response = client.post("/api/calculate", json={"tiles": {}})
        assert response.status_code == 200
        body = response.json()
        assert body["global_scores"] == {"livability": 70, "resources": 50, "traffic": 100}
        assert body["local_deltas"] is None

    def test_isolated_residential_scores_and_delta(self):
        response = client.post(
            "/api/calculate",
            json=_advanced_payload(
                {"0,0": {"type": 1}},
                {"x": 0, "y": 0, "type": 1},
            ),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["global_scores"] == {"livability": 70, "resources": 30, "traffic": 95}
        assert body["local_deltas"] == {"x": 0, "y": 0, "value": -20, "metric": "resources"}

    def test_sparse_coordinates_beyond_20x20(self):
        # Negative and far coordinates must work (PRD §5.2).
        response = client.post(
            "/api/calculate",
            json=_advanced_payload(
                {"-30,15": {"type": 1}, "-28,15": {"type": 2}},
                {"x": -28, "y": 15, "type": 2},
            ),
        )
        assert response.status_code == 200
        assert response.json()["global_scores"]["resources"] == 60

    def test_invalid_tile_type_rejected_422(self):
        response = client.post(
            "/api/calculate", json=_advanced_payload({"0,0": {"type": 99}})
        )
        assert response.status_code == 422

    def test_invalid_tile_key_rejected_400(self):
        response = client.post(
            "/api/calculate", json=_advanced_payload({"not-a-key": {"type": 1}})
        )
        assert response.status_code == 400
        assert "detail" in response.json()

    def test_malformed_json_rejected_400(self):
        response = client.post(
            "/api/calculate",
            content=b"{not json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_unknown_field_rejected_422(self):
        response = client.post(
            "/api/calculate",
            json={"tiles": {}, "mystery_field": 1},
        )
        assert response.status_code == 422

    def test_determinism_across_repeated_requests(self):
        payload = _advanced_payload(
            {
                "0,0": {"type": 1},
                "1,0": {"type": 4},
                "2,0": {"type": 4},
                "3,0": {"type": 2},
                "0,1": {"type": 3},
            },
            {"x": 0, "y": 1, "type": 3},
        )
        first = client.post("/api/calculate", json=payload).json()
        for _ in range(3):
            assert client.post("/api/calculate", json=payload).json() == first


class TestPrototypeContract:
    def test_matrix_request_converts_to_sparse(self):
        grid = [[0] * 4 for _ in range(4)]
        grid[0][0] = 1  # residential
        grid[0][1] = 4  # road
        grid[0][2] = 2  # commercial
        response = client.post(
            "/api/calculate",
            json={
                "grid_state": grid,
                "latest_placement": {"x": 0, "y": 0, "type": 1},
            },
        )
        assert response.status_code == 200
        body = response.json()
        # Residential connected via road to commercial.
        assert body["global_scores"]["traffic"] == 100

    def test_invalid_matrix_cell_422(self):
        response = client.post(
            "/api/calculate", json={"grid_state": [[0, 99]]}
        )
        assert response.status_code == 422

    def test_ragged_matrix_422(self):
        response = client.post(
            "/api/calculate", json={"grid_state": [[0, 1], [0]]}
        )
        assert response.status_code == 422


class TestIntegrationFlow:
    """The PRD §25.3 demo flow, end to end through the API."""

    def test_full_progression(self):
        # 1. Place a residential zone → resources poor (30).
        r1 = client.post(
            "/api/calculate",
            json=_advanced_payload({"5,5": {"type": 1}}, {"x": 5, "y": 5, "type": 1}),
        ).json()
        assert r1["global_scores"]["resources"] == 30

        # 2. Place a commercial nearby → resources improve to 60.
        r2 = client.post(
            "/api/calculate",
            json=_advanced_payload(
                {"5,5": {"type": 1}, "7,5": {"type": 2}},
                {"x": 7, "y": 5, "type": 2},
            ),
        ).json()
        assert r2["global_scores"]["resources"] > r1["global_scores"]["resources"]
        assert r2["global_scores"]["resources"] == 60

        # 3. Place a green space near the residential → livability improves.
        r3 = client.post(
            "/api/calculate",
            json=_advanced_payload(
                {"5,5": {"type": 1}, "7,5": {"type": 2}, "4,5": {"type": 3}},
                {"x": 4, "y": 5, "type": 3},
            ),
        ).json()
        assert r3["global_scores"]["livability"] > r2["global_scores"]["livability"]
        assert r3["global_scores"]["livability"] == 80

        # 4. Road path exists → traffic perfect.
        tiles_step4 = {
            "5,5": {"type": 1},
            "7,5": {"type": 2},
            "4,5": {"type": 3},
            "6,5": {"type": 4},
        }
        r4 = client.post(
            "/api/calculate",
            json=_advanced_payload(tiles_step4, {"x": 6, "y": 5, "type": 4}),
        ).json()
        assert r4["global_scores"]["traffic"] == 100

        # 5. Disconnect the road → traffic decreases (−5 penalty).
        tiles_step5 = {"5,5": {"type": 1}, "7,5": {"type": 2}, "4,5": {"type": 3}}
        r5 = client.post(
            "/api/calculate",
            json=_advanced_payload(
                tiles_step5,
                {"x": 6, "y": 5, "type": 0, "previous_type": 4},
            ),
        ).json()
        assert r5["global_scores"]["traffic"] < r4["global_scores"]["traffic"]
        assert r5["global_scores"]["traffic"] == 95

    def test_freeform_roads_calculation(self):
        payload = {
            "is_freeform": True,
            "zones": [
                {
                    "id": "z1",
                    "type": 1,
                    "position": {"x": 0.0, "y": 0.0},
                    "footprint": {"width": 10.0, "depth": 10.0},
                },
                {
                    "id": "z2",
                    "type": 2,
                    "position": {"x": 30.0, "y": 0.0},
                    "footprint": {"width": 10.0, "depth": 10.0},
                },
            ],
            "roads": [
                {
                    "id": "r1",
                    "type": 41,
                    "points": [{"x": 0.0, "y": 0.0}, {"x": 30.0, "y": 0.0}],
                    "width": 8.0,
                }
            ],
        }
        response = client.post("/api/calculate", json=payload)
        assert response.status_code == 200
        scores = response.json()["global_scores"]
        assert scores["traffic"] == 100

