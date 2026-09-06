"""Sparse-grid helpers (PRD §5.1, §13).

The authoritative internal representation of the city is a sparse mapping of
``(x, y)`` integer tuples to tile type integers. The API exchanges the JSON
form ``{"x,y": {"type": n}}``; these helpers convert between the two shapes
strictly and deterministically.
"""

from __future__ import annotations

from app import config

TileMap = dict[tuple[int, int], int]


class InvalidTileKey(ValueError):
    """Raised when a sparse-map key is not a strict "x,y" integer pair."""


def format_key(x: int, y: int) -> str:
    """Serialize a coordinate to the canonical "x,y" sparse-map key."""
    return f"{x},{y}"


def parse_key(key: str) -> tuple[int, int]:
    """Parse a strict "x,y" integer key into an int32 coordinate tuple.

    Raises:
        InvalidTileKey: when the key is malformed or coordinates fall
            outside the signed 32-bit range (PRD §5.2).
    """
    if not isinstance(key, str):
        raise InvalidTileKey(f"tile key must be a string, got {type(key).__name__}")

    parts = key.split(",")
    if len(parts) != 2:
        raise InvalidTileKey(f"tile key {key!r} must have exactly two parts: 'x,y'")

    x_part, y_part = parts[0].strip(), parts[1].strip()
    try:
        x, y = int(x_part), int(y_part)
    except ValueError as exc:
        raise InvalidTileKey(f"tile key {key!r} must contain integers") from exc

    for name, value in (("x", x), ("y", y)):
        if not (config.MIN_COORD <= value <= config.MAX_COORD):
            raise InvalidTileKey(
                f"tile key {key!r}: {name} coordinate out of signed 32-bit range"
            )

    return x, y


def matrix_to_sparse(matrix: list[list[int]]) -> TileMap:
    """Convert a prototype 20×20-style matrix into sparse coordinates.

    Row index maps to y, column index maps to x. Empty (type 0) cells are
    skipped: empty tiles never persist in the sparse map (PRD §6.3).

    Raises:
        ValueError: when a cell holds an unsupported tile type.
    """
    from app.models.tiles import is_valid_tile_type

    sparse: TileMap = {}
    for y, row in enumerate(matrix):
        for x, value in enumerate(row):
            value = int(value)
            if value == config.EMPTY:
                continue
            if not is_valid_tile_type(value):
                raise ValueError(f"unsupported tile type in matrix: {value!r}")
            sparse[(x, y)] = value
    return sparse


def sparse_to_sorted_items(tiles: TileMap) -> list[tuple[int, int, int]]:
    """Return sparse tiles as a deterministically ordered list.

    Ordered by (y, x) so that iteration order — and therefore any output
    derived from it — is stable regardless of dict insertion order.
    """
    return [(x, y, tile_type) for (x, y), tile_type in sorted(tiles.items())]


def sparse_to_json(tiles: TileMap) -> dict[str, dict[str, int]]:
    """Serialize the sparse map to the PRD JSON shape: {"x,y": {"type": n}}."""
    return {
        format_key(x, y): {"type": tile_type}
        for x, y, tile_type in sparse_to_sorted_items(tiles)
    }
