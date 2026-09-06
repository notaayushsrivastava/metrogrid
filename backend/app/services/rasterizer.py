"""Deterministic GIS → grid rasterization (PRD §7.3-7.5, §21).

Pipeline: geographic bounds → aspect-corrected equirectangular projection
→ integer grid cells → tile types via metadata mapping (§7.5).

Every function here is pure: identical bounds, origin, and source geometry
always produce identical output (PRD §7.4, §21). Unknown metadata falls back
safely to supported tile types — never to unsupported values (§7.5).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app import config
from app.services.sparse import TileMap

# Mean meters-per-degree approximations. Geodesic accuracy is not required —
# determinism is (PRD §7.4) — and these constants are centralized.
METERS_PER_DEG_LAT = 110_574.0
METERS_PER_DEG_LON = 111_320.0

# Paint layers, lowest first (PRD §7.3): area land-use under buildings,
# roads on top so networks always cut through blocks.
LAYER_AREA = 0
LAYER_BUILDING = 1
LAYER_ROAD = 2


@dataclass(frozen=True)
class GeoBounds:
    """Geographic bounding box in decimal degrees."""

    north: float
    south: float
    east: float
    west: float


@dataclass(frozen=True)
class GeoFeature:
    """One classified GIS feature ready for rasterization.

    ``points`` are (lon, lat) pairs in source order; ``closed`` marks polygon
    features (buildings / land-use) versus polylines (roads). ``order`` is
    the deterministic tie-break key inside a paint layer.
    """

    layer: int
    tile_type: int
    points: tuple[tuple[float, float], ...]
    closed: bool
    order: tuple


# ---------------------------------------------------------------------------
# Metadata → tile mapping (PRD §7.5)
# ---------------------------------------------------------------------------

# OSM building=* → MetroGrid zone type. Unknown building classes fall back
# safely to Residential (1) rather than producing unsupported types (§7.5).
_BUILDING_TO_TILE: dict[str, int] = {
    "apartments": 1,
    "residential": 1,
    "detached": 1,
    "house": 1,
    "semidetached_house": 1,
    "terrace": 1,
    "terrace_house": 1,
    "bungalow": 1,
    "dormitory": 1,
    "hotel": 1,
    "commercial": 2,
    "retail": 2,
    "office": 2,
    "supermarket": 2,
    "kiosk": 2,
    "civic": 2,
    "public": 2,
    "government": 2,
    "school": 2,
    "university": 2,
    "hospital": 2,
    "train_station": 2,
    "industrial": 5,
    "warehouse": 5,
    "factory": 5,
    "service": 5,
}

# OSM highway=* → road subtype (§7.5): highway 43, avenue 42, local 41,
# pedestrian 40. Unknown classes fall back to the generic road (4).
_ROAD_CLASS_TO_TILE: dict[str, int] = {
    "motorway": 43,
    "motorway_link": 43,
    "trunk": 43,
    "trunk_link": 43,
    "primary": 42,
    "primary_link": 42,
    "secondary": 42,
    "secondary_link": 42,
    "tertiary": 41,
    "tertiary_link": 41,
    "residential": 41,
    "unclassified": 41,
    "living_street": 41,
    "service": 41,
    "road": 41,
    "footway": 40,
    "path": 40,
    "pedestrian": 40,
    "steps": 40,
    "cycleway": 40,
    "track": 40,
    "bridleway": 40,
}

_GREEN_LEISURE = frozenset(
    {"park", "garden", "pitch", "playground", "grass", "common", "village_green"}
)
_GREEN_LANDUSE = frozenset(
    {"grass", "village_green", "recreation_ground", "meadow", "forest"}
)
_GREEN_NATURAL = frozenset({"park", "wood", "scrub", "tree_row", "grassland"})

_CLASSIFY_LANDUSE = {"residential": 1, "industrial": 5, "retail": 2, "commercial": 2}


def classify_feature(tags: dict[str, str]) -> tuple[int, int, bool] | None:
    """Map GIS/OSM metadata to ``(layer, tile_type, closed)`` (PRD §7.5).

    Returns ``None`` for features MetroGrid does not represent. Roads are
    checked first (a tagged way is a road even if it carries other metadata),
    then buildings, then area land-use.
    """
    highway = tags.get("highway")
    if highway is not None:
        tile_type = _ROAD_CLASS_TO_TILE.get(str(highway), config.ROAD)
        return (LAYER_ROAD, tile_type, False)

    building = tags.get("building")
    if building is not None and building != "no":
        tile_type = _BUILDING_TO_TILE.get(str(building), config.RESIDENTIAL)
        return (LAYER_BUILDING, tile_type, True)

    landuse = tags.get("landuse")
    if landuse in _CLASSIFY_LANDUSE:
        return (LAYER_AREA, _CLASSIFY_LANDUSE[str(landuse)], True)
    if landuse in _GREEN_LANDUSE:
        return (LAYER_AREA, config.GREEN, True)

    leisure = tags.get("leisure")
    if leisure in _GREEN_LEISURE:
        return (LAYER_AREA, config.GREEN, True)

    natural = tags.get("natural")
    if natural in _GREEN_NATURAL:
        return (LAYER_AREA, config.GREEN, True)

    return None


# ---------------------------------------------------------------------------
# Projection (PRD §7.4)
# ---------------------------------------------------------------------------


def grid_span(bounds: GeoBounds) -> tuple[int, int]:
    """Tiles across the bbox along x/y, aspect-corrected and clamped.

    One cell ≈ ``config.GIS_TILE_METERS`` on the ground; spans are clamped to
    ``[MIN_GRID_SPAN, MAX_GRID_SPAN]`` so rasterization is always bounded.
    """
    mid_lat = (bounds.north + bounds.south) / 2.0
    lat_m = (bounds.north - bounds.south) * METERS_PER_DEG_LAT
    lon_m = (
        (bounds.east - bounds.west)
        * METERS_PER_DEG_LON
        * math.cos(math.radians(mid_lat))
    )
    span_x = int(round(lon_m / config.GIS_TILE_METERS))
    span_y = int(round(lat_m / config.GIS_TILE_METERS))
    clamped_x = max(config.MIN_GRID_SPAN, min(config.MAX_GRID_SPAN, span_x))
    clamped_y = max(config.MIN_GRID_SPAN, min(config.MAX_GRID_SPAN, span_y))
    return clamped_x, clamped_y


def lonlat_to_grid(
    lon: float,
    lat: float,
    bounds: GeoBounds,
    origin: tuple[int, int],
    span_x: int,
    span_y: int,
) -> tuple[int, int]:
    """Project a geographic point onto a sparse-grid cell.

    x grows eastward, y grows southward (screen-aligned like the canvas).
    Pure arithmetic; edge coordinates clamp into the span.
    """
    fx = (lon - bounds.west) / (bounds.east - bounds.west)
    fy = (bounds.north - lat) / (bounds.north - bounds.south)
    gx = origin[0] + min(max(int(math.floor(fx * span_x)), 0), span_x - 1)
    gy = origin[1] + min(max(int(math.floor(fy * span_y)), 0), span_y - 1)
    return gx, gy


# ---------------------------------------------------------------------------
# Geometry rasterization
# ---------------------------------------------------------------------------


def _mark_cell(
    fx: float,
    fy: float,
    span_x: int,
    span_y: int,
    out: dict[tuple[int, int], int],
    tile_type: int,
) -> None:
    cx = min(max(int(math.floor(fx)), 0), span_x - 1)
    cy = min(max(int(math.floor(fy)), 0), span_y - 1)
    out[(cx, cy)] = tile_type


def _fill_polygon(
    cells: list[tuple[float, float]],
    span_x: int,
    span_y: int,
    out: dict[tuple[int, int], int],
    tile_type: int,
) -> None:
    """Fill a polygon via even-odd cell-center sampling (deterministic)."""
    if len(cells) < 3:
        return
    xs = [c[0] for c in cells]
    ys = [c[1] for c in cells]
    min_cx, max_cx = min(xs), max(xs)
    min_cy, max_cy = min(ys), max(ys)
    n = len(cells)

    def inside(px: float, py: float) -> bool:
        crossings = 0
        for i in range(n):
            x1, y1 = cells[i]
            x2, y2 = cells[(i + 1) % n]
            if (y1 > py) != (y2 > py):
                t = (py - y1) / (y2 - y1)
                if x1 + t * (x2 - x1) > px:
                    crossings += 1
        return crossings % 2 == 1

    for cy in range(int(math.floor(min_cy)), int(math.ceil(max_cy))):
        for cx in range(int(math.floor(min_cx)), int(math.ceil(max_cx))):
            # Sample at the cell's center within the projected space.
            if inside(cx + 0.5, cy + 0.5):
                out[(cx, cy)] = tile_type


def _stroke_polyline(
    cells: list[tuple[float, float]],
    span_x: int,
    span_y: int,
    out: dict[tuple[int, int], int],
    tile_type: int,
    thickness: int,
) -> None:
    """Mark cells along a polyline at sub-cell steps (deterministic).

    Wide roads (avenues/highways per §7.5) paint a 2-cell corridor; other
    roads paint a single-cell line.
    """
    if len(cells) == 1:
        _mark_cell(cells[0][0], cells[0][1], span_x, span_y, out, tile_type)
        return
    for i in range(len(cells) - 1):
        x0, y0 = cells[i]
        x1, y1 = cells[i + 1]
        steps = max(1, int(math.ceil(max(abs(x1 - x0), abs(y1 - y0)) * 4)))
        for s in range(steps + 1):
            t = s / steps
            fx = x0 + (x1 - x0) * t
            fy = y0 + (y1 - y0) * t
            _mark_cell(fx, fy, span_x, span_y, out, tile_type)
            if thickness >= 2:
                _mark_cell(fx + 1.0, fy, span_x, span_y, out, tile_type)
                _mark_cell(fx, fy + 1.0, span_x, span_y, out, tile_type)


# ---------------------------------------------------------------------------
# Feature → sparse map (PRD §7.3-7.5)
# ---------------------------------------------------------------------------


def rasterize_features(
    features: list[GeoFeature],
    bounds: GeoBounds,
    origin: tuple[int, int],
) -> TileMap:
    """Rasterize classified features into a sparse tile map.

    Geometry is rasterized in span-relative coordinates and shifted onto the
    requested ``origin`` exactly once, so the result is identical for the
    same bounds/features regardless of where the city is anchored
    (PRD §7.4). Paint order: layer ascending (area → building → road), then
    each feature's deterministic ``order`` key. The result is capped at
    ``config.MAX_IMPORTED_TILES``.
    """
    span_x, span_y = grid_span(bounds)
    rel: dict[tuple[int, int], int] = {}

    for feature in sorted(features, key=lambda f: (f.layer, f.order)):
        cells = [
            lonlat_to_grid(lon, lat, bounds, (0, 0), span_x, span_y)
            for lon, lat in feature.points
        ]
        if not cells:
            continue
        if feature.closed:
            _fill_polygon(cells, span_x, span_y, rel, feature.tile_type)
        else:
            thickness = 2 if feature.tile_type in config.GIS_WIDE_ROAD_TYPES else 1
            _stroke_polyline(
                cells, span_x, span_y, rel, feature.tile_type, thickness
            )

    shifted = {
        (origin[0] + cx, origin[1] + cy): tile_type
        for (cx, cy), tile_type in rel.items()
    }
    return dict(sorted(shifted.items())[: config.MAX_IMPORTED_TILES])


__all__ = [
    "GeoBounds",
    "GeoFeature",
    "LAYER_AREA",
    "LAYER_BUILDING",
    "LAYER_ROAD",
    "classify_feature",
    "grid_span",
    "lonlat_to_grid",
    "rasterize_features",
]



