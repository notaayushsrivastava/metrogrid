"""Score aggregation, normalization, and local delta computation (PRD §9-§11)."""

from __future__ import annotations

from app import config
from app.models.requests import LatestAction, SpatialZonePayload
from app.services import resources, traffic
from app.services.sparse import TileMap


BASELINE_TILE_AREA = 100.0  # Standard 10m x 10m tile base area in sq meters


def compute_freeform_raw_scores(
    zones: list[SpatialZonePayload] | None, tiles: TileMap
) -> dict[str, float]:
    """Calculate raw scores for freeform requests scaled by total square meterage."""
    res_area = 0.0
    com_area = 0.0
    green_area = 0.0
    ind_area = 0.0

    if zones:
        for z in zones:
            area = z.area if z.area is not None else (z.footprint.width * z.footprint.depth)
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
    is_freeform: bool = False,
) -> dict[str, float]:
    """Raw (unnormalized) metric values for a sparse tile map or freeform request.

    Deterministic: identical tile maps / freeform zones always produce identical raw scores.
    """
    if is_freeform or zones is not None:
        return compute_freeform_raw_scores(zones, tiles)

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
    """Clamp a raw metric into the normalized 0-100 range (PRD §10).

    Uses conventional half-up rounding so results are predictable and
    stable across requests.
    """
    clamped = max(0.0, min(100.0, raw))
    return int(clamped + 0.5)


def compute_scores(
    tiles: TileMap,
    zones: list[SpatialZonePayload] | None = None,
    is_freeform: bool = False,
) -> dict[str, int]:
    """Normalized global scores, rounded and clamped to 0-100."""
    return {
        metric: normalize_score(raw)
        for metric, raw in compute_raw_scores(tiles, zones=zones, is_freeform=is_freeform).items()
    }


def _before_state(tiles: TileMap, action: LatestAction) -> TileMap:
    """Reconstruct the tile map as it was before the latest action.

    * Place/overwrite: the received map already contains the new tile, so
      the before-state is the map without that coordinate.
    * Erase (``action.type == EMPTY``): the received map lacks the tile, so
      the before-state restores ``previous_type`` when the frontend provided
      it — this is what makes "remove a tile" feedback explain the change.
    """
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
    """Local decision feedback for the latest action (PRD §11).

    Compares normalized scores before and after the action and reports the
    metric with the largest absolute change. Ties resolve by the fixed
    METRIC_PRIORITY order, so the result is deterministic.

    Returns None when no action was supplied.
    """
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
