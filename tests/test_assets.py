"""Asset upload API tests (PRD §12.3, Phase 5)."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest
import supabase
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _glb_bytes() -> bytes:
    # Minimal GLB header: magic + version + total length, then padding.
    import struct

    header = struct.pack("<4sII", b"glTF", 2, 12)
    return header + b"\x00" * 4


def _gltf_bytes() -> bytes:
    return b'{"asset":{"version":"2.0"}}'


@pytest.fixture(autouse=True)
def _supabase_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
    monkeypatch.setenv("SUPABASE_SERVICE_UNIT_KEY", "x")
    # The route reads SUPABASE_SERVICE_ROLE_KEY; set it too.
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")


def _mock_client(content_type: str):
    """Build a mocked Supabase client whose storage.upload works and whose
    get_public_url returns a deterministic URL."""
    storage = MagicMock()
    storage.from_.return_value = storage
    storage.get_public_url.return_value = "https://unit.test/models/x.glb"

    supabase = MagicMock()
    supabase.storage = storage
    return supabase, storage


class TestUploadValidation:
    def test_rejects_unsupported_extension(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")
        response = client.post(
            "/api/assets/upload",
            files={"file": ("model.obj", b"anything", "model/obj")},
        )
        assert response.status_code == 400
        assert "Unsupported" in response.json()["detail"]

    def test_rejects_empty_file(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")
        response = client.post(
            "/api/assets/upload",
            files={"file": ("empty.glb", b"", "model/gltf-binary")},
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    def test_rejects_oversized_file(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")
        # Patch the max-bytes constant to a tiny value for the test.
        monkeypatch.setattr("app.config.ASSET_MAX_BYTES", 10)
        response = client.post(
            "/api/assets/upload",
            files={"file": ("big.glb", _glb_bytes(), "model/gltf-binary")},
        )
        assert response.status_code == 413

    def test_rejects_glb_with_wrong_magic(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")
        response = client.post(
            "/api/assets/upload",
            files={"file": ("fake.glb", b"NOT_A_GLB_FILE____", "model/gltf-binary")},
        )
        assert response.status_code == 400
        assert "magic" in response.json()["detail"].lower()

    def test_rejects_gltf_with_wrong_content(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")
        response = client.post(
            "/api/assets/upload",
            files={"file": ("fake.gltf", b"not json at all__", "model/gltf+json")},
        )
        assert response.status_code == 400


class TestUploadSuccess:
    def test_uploads_valid_glb(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")
        mock_supabase, storage = _mock_client("model/gltf-binary")
        with patch.object(supabase, "create_client", return_value=mock_supabase):
            response = client.post(
                "/api/assets/upload",
                files={"file": ("building.glb", _glb_bytes(), "model/gltf-binary")},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["filename"] == "building.glb"
        assert body["content_type"] == "model/gltf-binary"
        assert body["size_bytes"] == len(_glb_bytes())
        assert body["model_url"] == "https://unit.test/models/x.glb"
        storage.upload.assert_called_once()

    def test_uploads_valid_gltf(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://unit.test")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-key")
        mock_supabase, _ = _mock_client("model/gltf+json")
        with patch.object(supabase, "create_client", return_value=mock_supabase):
            response = client.post(
                "/api/assets/upload",
                files={"file": ("scene.gltf", _gltf_bytes(), "model/gltf+json")},
            )
        assert response.status_code == 200
        assert response.json()["content_type"] == "model/gltf+json"


class TestUploadDegradation:
    def test_503_when_storage_unconfigured(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
        response = client.post(
            "/api/assets/upload",
            files={"file": ("building.glb", _glb_bytes(), "model/gltf-binary")},
        )
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"].lower()
