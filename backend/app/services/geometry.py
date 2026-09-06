"""Deterministic geometry helpers for the scoring engine."""


def manhattan_distance(x1: int, y1: int, x2: int, y2: int) -> int:
    """Manhattan (grid) distance: |x1-x2| + |y1-y2| (PRD §9.2)."""
    return abs(x1 - x2) + abs(y1 - y2)


def within_manhattan_radius(
    x1: int, y1: int, x2: int, y2: int, radius: int
) -> bool:
    """True when two grid points are within `radius` Manhattan steps."""
    return manhattan_distance(x1, y1, x2, y2) <= radius
