"""Asset upload API contracts (PRD §12.3, Phase 5)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict

from app import config


class AssetUploadResponse(BaseModel):
    """Successful upload response (PRD §12.3)."""

    model_config = ConfigDict(extra="forbid")

    filename: str
    model_url: str
    size_bytes: int
    content_type: str


class AssetUploadRequest(BaseModel):
    """Validation helper for multipart upload metadata."""

    model_config = ConfigDict(extra="forbid")

    filename: str

    @property
    def extension(self) -> str:
        name = self.filename.lower()
        # Composite extensions like .gltf, .gltf.bin are not accepted;
        # require the canonical single extension.
        if name.endswith(".glb"):
            return ".glb"
        if name.endswith(".gltf"):
            return ".gltf"
        return ""


__all__ = [
    "AssetUploadResponse",
    "AssetUploadRequest",
]
