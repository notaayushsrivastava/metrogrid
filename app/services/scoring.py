"""Score aggregation, normalization, and local delta computation (PRD Phase 1 - Phase 6)."""

from __future__ import annotations

import math

from app import config
from app.models.requests import LatestAction, SpatialRoadPayload, SpatialZonePayload
from app.services import resources, traffic
from app.services.sparse import TileMap


BASELINE_TILE_AREA = 100.0  # Standard 10m x 10m tile base area in sq meters


def rasterize_freeform_roads_to_tiles(
    roads: list[SpatialRoadPayload], tiles: TileMap
) -> TileMap:
    merged = dict(tiles)
    for r in roads:
        if not r.points or len(r.points) < 1:
            continue
        thickness = max(1, int(round(r.width / config.GIS_TILE_METERS)))
        for i in range(len(r.points) - 1):
            p1 = r.points[i]
            p2 = r.points[i + 1]
            gx1 = p1.x / config.GIS_TILE_METERS
            gy1 = p1.y / config.GIS_TILE_METERS
            gx2 = p2.x / config.GIS_TILE_METERS
            gy2 = p2.y / config.GIS_TILE_METERS

            dist = math.sqrt((gx2 - gx1) ** 2 + (gy2 - gy1) ** 2)
            steps = max(1, int(math.ceil(dist * 4)))
            for s in range(steps + 1):
                t = s / steps
                fx = gx1 + (gx2 - gx1) * t
                fy = gy1 + (gy2 - gy1) * t
                cx = int(math.floor(fx))
                cy = int(math.floor(fy))
                for dx in range(thickness):
                    for dy in range(thickness):
                        merged[(cx + dx, cy + dy)] = r.type
    return merged


def compute_freeform_raw_scores(
    zones: list[SpatialZonePayload] | None,
    tiles: TileMap,
    roads: list[SpatialRoadPayload] | None = None,
) -> dict[str, float]:
    """Calculate raw scores for freeform requests scaled by total square meterage."""
    if roads:
        tiles = rasterize_freeform_roads_to_tiles(roads, tiles)

    res_area = 0.0
    com_area = 0.0
    green_area = 0.0
    ind_area = 0.0

    if zones:
        for z in zones:
            effective_mult = 1.0
            if z.attributes:
                density = float(z.attributes.get("density", 1.0) or 1.0)
                intensity = float(z.attributes.get("developmentIntensity", 1.0) or 1.0)
                floors = float(z.attributes.get("floors", 1.0) or 1.0)
                effective_mult = max(0.1, density * intensity * (1.0 + (floors - 1.0) * 0.2))

            base_area = z.area if z.area is not None else (z.footprint.width * z.footprint.depth)
            area = base_area * effective_mult

            if z.type == config.RESIDENTIAL:
                res_area += area
            elif z.type == config.COMMERCIAL:
                com_area += area
            elif z.type == config.GREEN:
                green_area += area
            elif z.type == config.INDUSTRIAL:
                ind_area += area
    else:
        # Infer area from tiles
        for _coord, t_type in tiles.items():
            if t_type == config.RESIDENTIAL:
                res_area += BASELINE_TILE_AREA
            elif t_type == config.COMMERCIAL:
                com_area += BASELINE_TILE_AREA
            elif t_type == config.GREEN:
                green_area += BASELINE_TILE_AREA
            elif t_type == config.INDUSTRIAL:
                ind_area += BASELINE_TILE_AREA

    # 1. Livability: scaled by green & industrial square meterage
    green_factor = green_area / BASELINE_TILE_AREA
    ind_factor = ind_area / BASELINE_TILE_AREA
    livability = (
        config.LIVABILITY_BASE
        + config.GREEN_BONUS * green_factor
        - config.INDUSTRIAL_PENALTY * ind_factor
    )

    # 2. Resources: scaled by commercial vs residential square meterage ratio
    if res_area == 0:
        res_score = config.RESOURCES_BASE
    else:
        served_ratio = min(1.0, com_area / (res_area * 0.5 + 1.0)) if com_area > 0 else 0.0
        served_res_area = res_area * served_ratio
        unmet_res_area = res_area - served_res_area
        res_score = (
            config.RESOURCES_BASE
            + config.RESOURCE_BONUS * (served_res_area / BASELINE_TILE_AREA)
            - config.RESOURCE_PENALTY * (unmet_res_area / BASELINE_TILE_AREA)
        )

    # 3. Traffic: scaled by connectivity ratio relative to residential square meterage
    if res_area == 0:
        traffic_score = config.TRAFFIC_BASE
    else:
        connected, total_res = traffic.road_connected_residential_stats(tiles)
        if total_res > 0:
            connected_ratio = connected / total_res
        else:
            connected_ratio = 1.0 if com_area > 0 else 0.0
        disconnected_res_area = res_area * (1.0 - connected_ratio)
        traffic_score = (
            config.TRAFFIC_BASE
            - config.TRAFFIC_DISCONNECT_PENALTY * (disconnected_res_area / BASELINE_TILE_AREA)
        )

    return {
        "livability": livability,
        "resources": res_score,
        "traffic": traffic_score,
    }


def compute_raw_scores(
    tiles: TileMap,
    zones: list[SpatialZonePayload] | None = None,
    roads: list[SpatialRoadPayload] | None = None,
    is_freeform: bool = False,
) -> dict[str, float]:
    """Raw (unnormalized) metric values for a sparse tile map or freeform request.

    Deterministic: identical tile maps / freeform zones always produce identical raw scores.
    """
    if is_freeform or zones is not None or roads is not None:
        return compute_freeform_raw_scores(zones, tiles, roads=roads)

    green_pairs = resources.green_pair_count(tiles)
    industrial_pairs = resources.industrial_pair_count(tiles)
    served, total_residential = resources.resource_stats(tiles)
    connected, _ = traffic.road_connected_residential_stats(tiles)

    livability = (
        config.LIVABILITY_BASE
        + config.GREEN_BONUS * green_pairs
        - config.INDUSTRIAL_PENALTY * industrial_pairs
    )
    unmet = total_residential - served
    res_score = config.RESOURCES_BASE + config.RESOURCE_BONUS * served - config.RESOURCE_PENALTY * unmet
    disconnected = total_residential - connected
    traffic_score = config.TRAFFIC_BASE - config.TRAFFIC_DISCONNECT_PENALTY * disconnected

    return {
        "livability": livability,
        "resources": res_score,
        "traffic": traffic_score,
    }


def normalize_score(raw: float) -> int:
    """Clamp a raw metric into the normalized 0-100 range."""
    clamped = max(0.0, min(100.0, raw))
    return int(clamped + 0.5)


def compute_scores(
    tiles: TileMap,
    zones: list[SpatialZonePayload] | None = None,
    roads: list[SpatialRoadPayload] | None = None,
    is_freeform: bool = False,
) -> dict[str, int]:
    """Normalized global scores, rounded and clamped to 0-100."""
    return {
        metric: normalize_score(raw)
        for metric, raw in compute_raw_scores(
            tiles, zones=zones, roads=roads, is_freeform=is_freeform
        ).items()
    }


def _before_state(tiles: TileMap, action: LatestAction) -> TileMap:
    before = dict(tiles)
    previous = action.previous_type
    if previous is not None and previous != config.EMPTY:
        before[(action.x, action.y)] = previous
    else:
        before.pop((action.x, action.y), None)
    return before


def compute_local_delta(
    tiles: TileMap, action: LatestAction | None
) -> dict[str, int | str] | None:
    if action is None:
        return None

    before_scores = compute_scores(_before_state(tiles, action))
    after_scores = compute_scores(tiles)

    best_metric = config.METRIC_PRIORITY[0]
    best_value = 0
    best_abs = -1
    for metric in config.METRIC_PRIORITY:
        delta = after_scores[metric] - before_scores[metric]
        if abs(delta) > best_abs:
            best_metric = metric
            best_value = delta
            best_abs = abs(delta)

    return {
        "x": action.x,
        "y": action.y,
        "value": best_value,
        "metric": best_metric,
    }
