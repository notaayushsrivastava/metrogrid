"""Tests for sparse-map parsing, conversion, and serialization (PRD §25.1 #2, #12)."""

import pytest

from app.services.sparse import (
    InvalidTileKey,
    format_key,
    matrix_to_sparse,
    parse_key,
    sparse_to_json,
    sparse_to_sorted_items,
)


class TestParseKey:
    def test_valid_keys(self):
        assert parse_key("10,-5") == (10, -5)
        assert parse_key("0,0") == (0, 0)
        assert parse_key("-2147483648,2147483647") == (-2147483648, 2147483647)

    @pytest.mark.parametrize(
        "key",
        ["abc", "1", "1,2,3", "1.5,2", "1,x", "", ",", "99999999999,0", "1,xyz"],
    )
    def test_invalid_keys_rejected(self, key):
        with pytest.raises(InvalidTileKey):
            parse_key(key)

    def test_round_trip(self):
        for x, y in [(0, 0), (19, 19), (-10, 5), (2147483647, -2147483648)]:
            assert parse_key(format_key(x, y)) == (x, y)


class TestMatrixToSparse:
    def test_converts_and_skips_empty(self):
        # Matrix convention: grid_state[y][x] — row index is y, column is x
        # (matches the PRD §13 prototype example).
        matrix = [
            [0, 1],
            [2, 0],
        ]
        assert matrix_to_sparse(matrix) == {(1, 0): 1, (0, 1): 2}

    def test_empty_matrix_yields_empty_map(self):
        assert matrix_to_sparse([[0, 0], [0, 0]]) == {}

    def test_invalid_type_rejected(self):
        with pytest.raises(ValueError, match="unsupported tile type"):
            matrix_to_sparse([[0, 9]])


class TestSerialization:
    def test_sparse_to_json_matches_prd_shape(self):
        assert sparse_to_json({(10, -5): 1}) == {"10,-5": {"type": 1}}
        assert sparse_to_json({}) == {}

    def test_serialization_is_insertion_order_independent(self):
        a = {(0, 1): 2, (0, 0): 1, (1, 0): 3}
        b = {(1, 0): 3, (0, 0): 1, (0, 1): 2}
        assert sparse_to_json(a) == sparse_to_json(b)
        assert sparse_to_sorted_items(a) == sparse_to_sorted_items(b)
