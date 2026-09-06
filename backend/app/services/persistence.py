"""Layout persistence (PRD §17, Phase 3).

Save/load of the sparse tile map through Supabase PostgreSQL. When
``SUPABASE_URL`` and ``SUPABASE_SERVICE_ROLE_KEY`` are not configured the
store degrades to an in-memory dictionary so local development and tests
keep working; responses include ``storage`` so the UI can communicate this.

Secrets live only server-side (env) — never in client code (PRD §22.1-3).
"""

from __future__ import annotations

import os
import re
import time
from typing import Any

from app.services.sparse import InvalidTileKey, TileMap, parse_key

SUPABASE_URL_ENV = "SUPABASE_URL"
SUPABASE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY"
CITY_PLANS_TABLE = "city_plans"

# Layout name/size guards (PRD §22.5).
MAX_NAME_LENGTH = 80
MAX_GRID_ENTRIES = 200_000

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_layout_name(name: str) -> str:
    """Trim, strip control characters, and enforce a sane length."""
    cleaned = _CONTROL_CHARS.sub("", name).strip()
    if not cleaned:
        raise ValueError("Layout name must not be empty")
    if len(cleaned) > MAX_NAME_LENGTH:
        cleaned = cleaned[:MAX_NAME_LENGTH]
    return cleaned


def validate_grid_state_payload(grid_state: Any) -> TileMap:
    """Validate a serialized sparse tile map from a client/DB payload."""
    if not isinstance(grid_state, dict):
        raise ValueError("grid_state must be an object")
    if len(grid_state) > MAX_GRID_ENTRIES:
        raise ValueError("grid_state exceeds the allowed tile count")

    tiles: TileMap = {}
    for key, value in grid_state.items():
        x, y = parse_key(str(key))  # raises InvalidTileKey
        if not isinstance(value, dict) or "type" not in value:
            raise ValueError(f"grid_state[{key!r}] must be a tile object")
        from app.models.tiles import is_valid_tile_type

        if not is_valid_tile_type(int(value["type"])):
            raise ValueError(f"grid_state[{key!r}] has an unsupported tile type")
        tiles[(x, y)] = int(value["type"])
    return tiles


class LayoutStore:
    """Persistence backend chosen at startup from the environment."""

    def __init__(self) -> None:
        self.url = os.environ.get(SUPABASE_URL_ENV, "").strip()
        self.key = os.environ.get(SUPABASE_KEY_ENV, "").strip()
        self._client: Any = None
        self._memory: dict[str, dict[str, Any]] = {}

    @property
    def storage(self) -> str:
        return "supabase" if (self.url and self.key) else "memory"

    @property
    def _db(self) -> Any:
        if self._client is None:
            if not (self.url and self.key):
                raise RuntimeError("Supabase is not configured (missing env vars)")
            from supabase import create_client

            self._client = create_client(self.url, self.key)
        return self._client

    def list_layouts(self) -> list[dict[str, Any]]:
        if self.storage != "supabase":
            return [
                {
                    "id": layout["id"],
                    "name": layout["name"],
                    "created_at": layout["created_at"],
                    "tile_count": layout["tile_count"],
                }
                for layout in sorted(self._memory.values(), key=lambda r: r["created_at"])
            ]

        response = (
            self._db.table(CITY_PLANS_TABLE)
            .select("id,name,created_at,grid_state")
            .order("created_at")
            .execute()
        )
        rows: list[dict[str, Any]] = []
        for item in response.data or []:
            grid = item.get("grid_state") or {}
            rows.append(
                {
                    "id": item["id"],
                    "name": item["name"],
                    "created_at": item.get("created_at"),
                    "tile_count": len(grid),
                }
            )
        return rows

    def save_layout(self, name: str, grid_state: dict[str, Any]) -> dict[str, Any]:
        name = sanitize_layout_name(name)
        tiles = validate_grid_state_payload(grid_state)
        payload_grid = {
            f"{x},{y}": {"type": t} for (x, y), t in sorted(tiles.items())
        }

        if self.storage != "supabase":
            layout_id = f"mem-{int(time.time() * 1000)}"
            row = {
                "id": layout_id,
                "name": name,
                "created_at": int(time.time() * 1000),
                "grid_state": payload_grid,
                "tile_count": len(tiles),
            }
            self._memory[layout_id] = row
            return row

        response = (
            self._db.table(CITY_PLANS_TABLE)
            .insert({"name": name, "grid_state": payload_grid})
            .execute()
        )
        item = response.data[0] if response.data else {}
        saved_grid = item.get("grid_state") or payload_grid
        return {
            "id": item["id"],
            "name": item["name"],
            "created_at": item.get("created_at"),
            "grid_state": saved_grid,
            "tile_count": len(saved_grid),
        }

    def load_layout(self, layout_id: str) -> dict[str, Any]:
        if self.storage != "supabase":
            row = self._memory.get(layout_id)
            if row is None:
                raise KeyError(layout_id)
            return dict(row)

        response = (
            self._db.table(CITY_PLANS_TABLE)
            .select("id,name,created_at,grid_state")
            .eq("id", layout_id)
            .limit(1)
            .execute()
        )
        items = response.data or []
        if not items:
            raise KeyError(layout_id)
        item = items[0]
        grid = item.get("grid_state") or {}
        return {
            "id": item["id"],
            "name": item["name"],
            "created_at": item.get("created_at"),
            "grid_state": grid,
            "tile_count": len(grid),
        }