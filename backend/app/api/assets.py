"""Asset upload route (PRD §12.3, Phase 5).

``POST /api/assets/upload`` — accept a ``.glb`` / ``.gltf`` model, verify its
type by inspecting leading bytes (never trusting the client MIME type), enforce
a size cap, and store it in Supabase Storage's ``models`` bucket. Returns a
stable URL that the frontend attaches to a tile as ``model_url``.

The route degrades gracefully when Supabase is not configured: it raises a
clear 503 so the UI can explain that model storage is unavailable rather than
silently dropping the file.
"""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, File, UploadFile
from fastapi import status as http

from app import config
from app.errors import ApiError
from app.models.assets import AssetUploadResponse

router = APIRouter(tags=["assets"])


def _client():
    """Return the Supabase client or raise 503 when storage is unconfigured."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not (url and key):
        raise ApiError(
            http.HTTP_503_SERVICE_UNAVAILABLE,
            "Model storage is not configured. Set SUPABASE_URL + "
            "SUPABASE_SERVICE_ROLE_KEY to enable uploads.",
        )
    from supabase import create_client

    return create_client(url, key)


def _verify_type(filename: str, head: bytes) -> str:
    """Return the canonical content-type after verifying ``head`` bytes.

    Raises ApiError(400) for unsupported types. We check the file extension
    AND the magic bytes — never the client-supplied MIME type alone (§12.3).
    """
    lower = filename.lower()
    if lower.endswith(".glb"):
        if not head.startswith(config.GLB_MAGIC):
            raise ApiError(
                http.HTTP_400_BAD_REQUEST,
                "File does not appear to be a valid GLB (magic bytes mismatch).",
            )
        return "model/gltf-binary"
    if lower.endswith(".gltf"):
        # glTF JSON may start with a UTF-8 BOM or "{".
        if not (head.startswith(config.GLTF_JSON_START) or head.startswith(b"\xef\xbb\xbf")):
            raise ApiError(
                http.HTTP_400_BAD_REQUEST,
                "File does not appear to be valid glTF JSON.",
            )
        return "model/gltf+json"
    raise ApiError(
        http.HTTP_400_BAD_REQUEST,
        f"Unsupported asset type. Accepted: {', '.join(sorted(config.ASSET_ALLOWED_EXTENSIONS))}.",
    )


@router.post("/api/assets/upload", response_model=AssetUploadResponse)
async def upload_asset(file: UploadFile = File(...)) -> AssetUploadResponse:
    """Upload a 3D model to Supabase Storage (PRD §12.3)."""
    raw = await file.read()

    if not raw:
        raise ApiError(http.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")

    if len(raw) > config.ASSET_MAX_BYTES:
        raise ApiError(
            http.HTTP_413_CONTENT_TOO_LARGE,
            f"File exceeds the {config.ASSET_MAX_BYTES // (1024 * 1024)} MB limit.",
        )

    content_type = _verify_type(file.filename or "model.glb", raw[:16])

    client = _client()
    # Deterministic, collision-resistant object key.
    ext = ".glb" if content_type == "model/gltf-binary" else ".gltf"
    object_key = f"{uuid.uuid4().hex}{ext}"

    client.storage.from_(config.ASSET_BUCKET).upload(
        object_key,
        raw,
        file_options={"content-type": content_type, "upsert": False},
    )

    model_url = client.storage.from_(config.ASSET_BUCKET).get_public_url(object_key)

    return AssetUploadResponse(
        filename=file.filename or object_key,
        model_url=model_url,
        size_bytes=len(raw),
        content_type=content_type,
    )
