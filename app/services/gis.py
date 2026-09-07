"""GIS feature providers — the "configured GIS pipeline" (PRD §7).

Two providers ship with Phase 4:

* ``OverpassProvider`` — real building footprints and road polylines from
  OpenStreetMap via the Overpass API (no API key, secrets stay server-side,
  PRD §22.2). Network access is required.
* ``SampleProvider`` — a deterministic synthetic city derived from the bbox
  center, for offline demos and tests. Same input → same city, every time.

Providers return classified ``GeoFeature`` objects; rasterization lives in
``rasterizer.py`` and stays provider-agnostic.
"""

from __future__ import annotations

import os
from typing import Any, Protocol

import httpx

from app import config
from app.services.rasterizer import (
    GeoBounds,
    GeoFeature,
    LAYER_AREA,
    LAYER_BUILDING,
    LAYER_ROAD,
    classify_feature,
    grid_span,
)


class GisSourceUnavailable(Exception):
    """Raised when the upstream GIS source cannot be reached or errors."""

    def __init__(self, message: str, timeout: bool = False) -> None:
        super().__init__(message)
        self.timeout = timeout


class GisProvider(Protocol):
    """Minimal provider interface — fetch classified features for a bbox."""

    name: str

    def fetch_features(self, bounds: GeoBounds) -> list[GeoFeature]: ...


# ---------------------------------------------------------------------------
# Overpass / OpenStreetMap provider
# ---------------------------------------------------------------------------

_OVERPASS_QUERY_TEMPLATE = """
[out:json][timeout:{timeout}];
(
  way["highway"]({s},{w},{n},{e});
  way["building"]({s},{w},{n},{e});
  way["landuse"]({s},{w},{n},{e});
  way["leisure"~"^(park|garden|pitch|playground|grass|common|village_green)$"]({s},{w},{n},{e});
  way["natural"~"^(park|wood|scrub|tree_row|grassland)$"]({s},{w},{n},{e});
);
out geom;
"""


class OverpassProvider:
    """OpenStreetMap features via the Overpass API (PRD §7.1-7.2).

    Tries the primary endpoint first, then the public mirrors in order when
    the primary times out or is rate-limited (429/502/503/504 are common on
    the main instance for dense city extracts). Each attempt gets the full
    timeout budget; the first successful response wins.
    """

    name = "osm"

    def __init__(
        self,
        urls: list[str] | None = None,
        timeout: float | None = None,
    ) -> None:
        if urls is None:
            primary = os.environ.get(
                config.OVERPASS_URL_ENV, config.OVERPASS_DEFAULT_URL
            )
            try:
                configured_timeout = float(
                    os.environ.get(config.GIS_TIMEOUT_ENV, config.GIS_REQUEST_TIMEOUT_S)
                )
            except ValueError:
                configured_timeout = config.GIS_REQUEST_TIMEOUT_S
            timeout = configured_timeout if timeout is None else timeout
            urls = [primary, *config.OVERPASS_FALLBACK_URLS]
        self.urls = urls
        self.timeout = timeout if timeout is not None else config.GIS_REQUEST_TIMEOUT_S

    @property
    def url(self) -> str:
        """Primary endpoint (kept for backwards compatibility / logging)."""
        return self.urls[0]

    def fetch_features(self, bounds: GeoBounds) -> list[GeoFeature]:
        query = _OVERPASS_QUERY_TEMPLATE.format(
            timeout=int(self.timeout),
            s=bounds.south,
            w=bounds.west,
            n=bounds.north,
            e=bounds.east,
        )

        failures: list[str] = []
        timed_out = False
        for url in self.urls:
            try:
                # Split budgets: fail fast on unreachable hosts, but allow the
                # full window for the (slow) extraction itself.
                timeout = httpx.Timeout(self.timeout, connect=10.0)
                response = httpx.post(
                    url,
                    data={"data": query},
                    headers={
                        "User-Agent": "MetroGrid/0.1 (city planning prototype)",
                        "Accept": "application/json",
                    },
                    timeout=timeout,
                )
            except httpx.TimeoutException as exc:
                timed_out = True
                failures.append(f"{url}: timed out after {int(self.timeout)}s")
                continue
            except httpx.HTTPError as exc:
                failures.append(f"{url}: {type(exc).__name__}")
                continue

            if response.status_code in (429, 502, 503, 504):
                timed_out = timed_out or response.status_code == 504
                failures.append(f"{url}: HTTP {response.status_code}")
                continue
            if response.status_code != 200:
                # Non-retryable client/server error — no point trying mirrors
                # with the same query? Rate-limit-shaped codes were handled
                # above; treat others as fatal for this provider.
                raise GisSourceUnavailable(
                    f"The map data source rejected the request (HTTP {response.status_code})."
                )

            try:
                elements = response.json().get("elements", [])
            except ValueError:
                failures.append(f"{url}: unreadable response")
                continue

            return overpass_elements_to_features(elements)

        if timed_out:
            raise GisSourceUnavailable(
                "The map data source timed out on every endpoint. Try a "
                "smaller area or retry in a minute.",
                timeout=True,
            )
        raise GisSourceUnavailable(
            "The map data source is unreachable. Check the connection and retry. "
            + (f"(attempts: {'; '.join(failures)})" if failures else "")
        )


def overpass_elements_to_features(elements: list[dict[str, Any]]) -> list[GeoFeature]:
    """Convert Overpass ``out geom`` elements into classified GeoFeatures.

    Elements are sorted by id so feature order (and therefore paint order)
    is deterministic regardless of upstream response ordering.
    """
    features: list[GeoFeature] = []
    for element in sorted(elements, key=lambda el: int(el.get("id", 0))):
        tags = element.get("tags") or {}
        classified = classify_feature(tags)
        if classified is None:
            continue
        layer, tile_type, closed = classified

        if element.get("type") == "relation":
            members = element.get("members") or []
            for index, member in enumerate(members):
                geometry = member.get("geometry")
                if not geometry:
                    continue
                points = tuple(
                    (float(p["lon"]), float(p["lat"])) for p in geometry if p
                )
                if len(points) >= 2:
                    features.append(
                        GeoFeature(
                            layer=layer,
                            tile_type=tile_type,
                            points=points,
                            closed=closed,
                            order=(int(element.get("id", 0)), index),
                        )
                    )
            continue

        geometry = element.get("geometry") or []
        points = tuple((float(p["lon"]), float(p["lat"])) for p in geometry if p)
        if len(points) < 2:
            continue
        features.append(
            GeoFeature(
                layer=layer,
                tile_type=tile_type,
                points=points,
                closed=closed,
                order=(int(element.get("id", 0)), 0),
            )
        )
    return features


# ---------------------------------------------------------------------------
# Deterministic sample provider (offline demos / tests)
# ---------------------------------------------------------------------------


class _Lcg:
    """Tiny deterministic PRNG ( Lehmer LCG ) — stable across runs/platforms."""

    def __init__(self, seed: int) -> None:
        self.state = seed & 0x7FFFFFFF or 1

    def next_int(self, modulus: int) -> int:
        self.state = (self.state * 48_271) % 0x7FFFFFFF
        return self.state % modulus


class SampleProvider:
    """Synthetic city derived deterministically from the bbox center.

    Used when ``METROGRID_GIS_PROVIDER=sample`` — e.g. offline demos — so the
    Phase 4 demo flow completes reliably without network access.
    """

    name = "sample"

    def fetch_features(self, bounds: GeoBounds) -> list[GeoFeature]:
        seed = _center_seed(bounds)
        rng = _Lcg(seed)
        blocks_x, blocks_y = 4, 4
        features: list[GeoFeature] = []
        seq = 0

        def lon(t: float) -> float:
            return bounds.west + t * (bounds.east - bounds.west)

        def lat(t: float) -> float:
            return bounds.north - t * (bounds.north - bounds.south)

        # Streets: a lattice of local roads, every other line an avenue.
        for i in range(blocks_x + 1):
            tile_type = 42 if i % 2 == 0 else 41
            x = i / blocks_x
            features.append(
                GeoFeature(
                    layer=LAYER_ROAD,
                    tile_type=tile_type,
                    points=((lon(x), lat(0.0)), (lon(x), lat(1.0))),
                    closed=False,
                    order=(seq, 0),
                )
            )
            seq += 1
        for j in range(blocks_y + 1):
            tile_type = 42 if j % 2 == 0 else 41
            y = j / blocks_y
            features.append(
                GeoFeature(
                    layer=LAYER_ROAD,
                    tile_type=tile_type,
                    points=((lon(0.0), lat(y)), (lon(1.0), lat(y))),
                    closed=False,
                    order=(seq, 0),
                )
            )
            seq += 1

        # Blocks: 2×2 buildings each; a deterministic few become parks.
        park_blocks = {(rng.next_int(blocks_x), rng.next_int(blocks_y)),
                       (rng.next_int(blocks_x), rng.next_int(blocks_y))}
        for bx in range(blocks_x):
            for by in range(blocks_y):
                x0, x1 = bx / blocks_x + 0.06, (bx + 1) / blocks_x - 0.06
                y0, y1 = by / blocks_y + 0.06, (by + 1) / blocks_y - 0.06
                if (bx, by) in park_blocks:
                    features.append(
                        GeoFeature(
                            layer=LAYER_AREA,
                            tile_type=config.GREEN,
                            points=(
                                (lon(x0), lat(y0)),
                                (lon(x1), lat(y0)),
                                (lon(x1), lat(y1)),
                                (lon(x0), lat(y1)),
                            ),
                            closed=True,
                            order=(seq, 0),
                        )
                    )
                    seq += 1
                    continue
                for qx in (0.0, 0.5):
                    for qy in (0.0, 0.5):
                        hx0 = x0 + qx * (x1 - x0) * 0.9
                        hx1 = hx0 + (x1 - x0) * 0.4
                        hy0 = y0 + qy * (y1 - y0) * 0.9
                        hy1 = hy0 + (y1 - y0) * 0.4
                        roll = rng.next_int(10)
                        if roll < 6:
                            tile_type = config.RESIDENTIAL
                        elif roll < 9:
                            tile_type = config.COMMERCIAL
                        else:
                            tile_type = config.INDUSTRIAL
                        features.append(
                            GeoFeature(
                                layer=LAYER_BUILDING,
                                tile_type=tile_type,
                                points=(
                                    (lon(hx0), lat(hy0)),
                                    (lon(hx1), lat(hy0)),
                                    (lon(hx1), lat(hy1)),
                                    (lon(hx0), lat(hy1)),
                                ),
                                closed=True,
                                order=(seq, 0),
                            )
                        )
                        seq += 1
        return features


def _center_seed(bounds: GeoBounds) -> int:
    """Quantize the bbox center so the same area always seeds identically."""
    center_lon = round((bounds.east + bounds.west) / 2.0, 4)
    center_lat = round((bounds.north + bounds.south) / 2.0, 4)
    return abs(int(center_lon * 10_000) * 2_000_003 + int(center_lat * 10_000) * 97)


# ---------------------------------------------------------------------------
# Provider selection (configured pipeline, PRD §7.1)
# ---------------------------------------------------------------------------


def get_provider() -> GisProvider:
    """Return the provider selected by ``METROGRID_GIS_PROVIDER``."""
    name = os.environ.get(config.GIS_PROVIDER_ENV, config.GIS_DEFAULT_PROVIDER).strip()
    if name == "sample":
        return SampleProvider()
    if name == "osm":
        return OverpassProvider()
    raise ValueError(
        f"Unknown GIS provider {name!r} (expected 'osm' or 'sample')"
    )


def get_provider_name() -> str:
    """Configured provider name without constructing the provider."""
    return os.environ.get(
        config.GIS_PROVIDER_ENV, config.GIS_DEFAULT_PROVIDER
    ).strip()


__all__ = [
    "GisProvider",
    "GisSourceUnavailable",
    "OverpassProvider",
    "SampleProvider",
    "get_provider",
    "get_provider_name",
    "overpass_elements_to_features",
]

