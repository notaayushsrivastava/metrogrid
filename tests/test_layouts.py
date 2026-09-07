"""Tests for layout persistence (PRD §17)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.persistence import (
    LayoutStore,
    sanitize_layout_name,
    validate_grid_state_payload,
)


def test_sanitize_layout_name_strips_and_trims():
    assert sanitize_layout_name("  My City  ") == "My City"


def test_sanitize_layout_name_rejects_empty():
    with pytest.raises(ValueError):
        sanitize_layout_name("   ")


def test_sanitize_layout_name_caps_length():
    long = "x" * 200
    assert len(sanitize_layout_name(long)) == 80


def test_validate_grid_state_payload_accepts_valid():
    tiles = validate_grid_state_payload({"0,0": {"type": 1}, "1,0": {"type": 4}})
    assert tiles == {(0, 0): 1, (1, 0): 4}


def test_validate_grid_state_payload_rejects_bad_type():
    with pytest.raises(ValueError, match="unsupported tile type"):
        validate_grid_state_payload({"0,0": {"type": 99}})


def test_validate_grid_state_payload_rejects_bad_key():
    with pytest.raises(Exception):
        validate_grid_state_payload({"not-a-key": {"type": 1}})


class TestLayoutStore:
    def test_memory_save_and_load(self):
        store = LayoutStore()
        assert store.storage == "memory"
        saved = store.save_layout("Test City", {"0,0": {"type": 1}})
        assert saved["name"] == "Test City"
        loaded = store.load_layout(saved["id"])
        assert loaded["grid_state"] == {"0,0": {"type": 1}}

    def test_memory_list_layouts(self):
        store = LayoutStore()
        a = store.save_layout("A", {"0,0": {"type": 1}})
        store.save_layout("B", {"1,1": {"type": 2}})
        layouts = store.list_layouts()
        assert {row["id"] for row in layouts} == {a["id"], a["id"]} or len(layouts) == 2

    def test_memory_load_missing_raises(self):
        store = LayoutStore()
        with pytest.raises(KeyError):
            store.load_layout("does-not-exist")


client = TestClient(app)


class TestLayoutRoutes:
    def test_list_layouts(self):
        response = client.get("/api/layouts")
        assert response.status_code == 200
        body = response.json()
        assert body["storage"] in {"memory", "supabase"}
        assert isinstance(body["layouts"], list)

    def test_save_and_load_round_trip(self):
        save_response = client.post(
            "/api/layouts",
            json={"name": "Round Trip", "grid_state": {"0,0": {"type": 1}, "5,5": {"type": 4}}},
        )
        assert save_response.status_code == 201
        layout_id = save_response.json()["id"]

        load_response = client.get(f"/api/layouts/{layout_id}")
        assert load_response.status_code == 200
        assert load_response.json()["grid_state"] == {
            "0,0": {"type": 1},
            "5,5": {"type": 4},
        }

    def test_save_rejects_empty_name(self):
        response = client.post(
            "/api/layouts", json={"name": "   ", "grid_state": {}}
        )
        assert response.status_code == 422

    def test_save_rejects_invalid_tile(self):
        response = client.post(
            "/api/layouts",
            json={"name": "Bad", "grid_state": {"0,0": {"type": 99}}},
        )
        # Invalid tile type is a semantic (content) validation → 400.
        assert response.status_code == 400

    def test_load_missing_returns_404(self):
        response = client.get("/api/layouts/does-not-exist")
        assert response.status_code == 404
