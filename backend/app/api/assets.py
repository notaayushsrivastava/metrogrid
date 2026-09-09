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
    if not (url and key) or "your-project" in url or "your-service-role-key" in key:
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


ARCHIVE_MESSAGE = (
    "This project is now archived. Some Features are now read only. Thank you."
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

    _verify_type(file.filename or "model.glb", raw[:16])

    _client()  # verifies Supabase is configured; raises 503 if not

    # Model uploads to Supabase are disabled because project is archived.
    raise ApiError(
        http.HTTP_403_FORBIDDEN,
        ARCHIVE_MESSAGE,
    )
