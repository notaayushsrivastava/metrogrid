"""Score aggregation, normalization, and local delta computation (PRD §9-§11)."""

from __future__ import annotations

from app import config
from app.models.requests import LatestAction
from app.services import resources, traffic
from app.services.sparse import TileMap


def compute_raw_scores(tiles: TileMap) -> dict[str, float]:
    """Raw (unnormalized) metric values for a sparse tile map.

    Deterministic: identical tile maps always produce identical raw scores.
    """
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


def compute_scores(tiles: TileMap) -> dict[str, int]:
    """Normalized global scores, rounded and clamped to 0-100."""
    return {
        metric: normalize_score(raw) for metric, raw in compute_raw_scores(tiles).items()
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
