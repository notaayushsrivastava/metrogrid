"""Tests for Manhattan geometry (PRD §25.1 #1)."""

from app.services.geometry import manhattan_distance, within_manhattan_radius


def test_manhattan_distance_basic():
    assert manhattan_distance(0, 0, 3, 4) == 7


def test_manhattan_distance_symmetric_and_negative():
    assert manhattan_distance(-2, -3, 5, 1) == 11
    assert manhattan_distance(5, 1, -2, -3) == 11


def test_manhattan_distance_zero():
    assert manhattan_distance(7, 7, 7, 7) == 0


def test_within_manhattan_radius_boundaries():
    # Distance 3 is inside radius 3; distance 4 is outside.
    assert within_manhattan_radius(0, 0, 3, 0, 3)
    assert within_manhattan_radius(0, 0, 1, 2, 3)
    assert not within_manhattan_radius(0, 0, 4, 0, 3)
    assert not within_manhattan_radius(0, 0, 2, 2, 3)
