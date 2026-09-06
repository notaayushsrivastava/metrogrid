"""Resource proximity and livability pair statistics (PRD §9.2-§9.4)."""

from __future__ import annotations

from app import config
from app.services.geometry import within_manhattan_radius
from app.services.sparse import TileMap


def _coords_of_type(tiles: TileMap, tile_type: int) -> list[tuple[int, int]]:
    return sorted(coord for coord, t in tiles.items() if t == tile_type)


def resource_stats(tiles: TileMap) -> tuple[int, int]:
    """Count residential zones with a commercial tile within radius.

    A residential zone is "served" when at least one Commercial tile lies
    within ``RESOURCE_RADIUS`` Manhattan steps (PRD §9.2).

    Returns:
        ``(served, total_residential)``.
    """
    residential = _coords_of_type(tiles, config.RESIDENTIAL)
    if not residential:
        return 0, 0
    commercial = _coords_of_type(tiles, config.COMMERCIAL)
    if not commercial:
        return 0, len(residential)

    served = 0
    for rx, ry in residential:
        for cx, cy in commercial:
            if within_manhattan_radius(rx, ry, cx, cy, config.RESOURCE_RADIUS):
                served += 1
                break
    return served, len(residential)


def green_pair_count(tiles: TileMap) -> int:
    """(Green space, residential) pairs within GREEN_RADIUS (PRD §9.3).

    Every green space grants its bonus to each residential zone in range,
    so pairs — not unique residential zones — are counted.
    """
    residential = _coords_of_type(tiles, config.RESIDENTIAL)
    if not residential:
        return 0
    greens = _coords_of_type(tiles, config.GREEN)
    pairs = 0
    for gx, gy in greens:
        for rx, ry in residential:
            if within_manhattan_radius(gx, gy, rx, ry, config.GREEN_RADIUS):
                pairs += 1
    return pairs


def industrial_pair_count(tiles: TileMap) -> int:
    """(Industrial, residential) pairs within INDUSTRIAL_RADIUS (PRD §9.4).

    Every heavy industrial zone penalizes each residential zone in range.
    """
    residential = _coords_of_type(tiles, config.RESIDENTIAL)
    if not residential:
        return 0
    industrial = _coords_of_type(tiles, config.INDUSTRIAL)
    pairs = 0
    for ix, iy in industrial:
        for rx, ry in residential:
            if within_manhattan_radius(ix, iy, rx, ry, config.INDUSTRIAL_RADIUS):
                pairs += 1
    return pairs
