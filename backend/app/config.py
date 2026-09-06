"""Centralized MetroGrid configuration and scoring constants.

Every tunable value used by the scoring engine lives here so results stay
deterministic and auditable (PRD §21: "Constants and weights must be
centralized"). Do not hard-code these numbers in other modules.
"""

# ---------------------------------------------------------------------------
# Grid
# ---------------------------------------------------------------------------
# Phase 1 bounded prototype view (PRD §1.3, Phase 1). The authoritative state
# is sparse; this only bounds the prototype canvas.
GRID_SIZE = 20

# Chunk size for Phase 2 viewport chunking (PRD §6.2). Centralized now so the
# value is never duplicated when chunking lands.
CHUNK_SIZE = 16

# Signed 32-bit integer coordinate limits (PRD §5.2).
MIN_COORD = -(2**31)
MAX_COORD = 2**31 - 1

# ---------------------------------------------------------------------------
# Tile types (PRD §5.4)
# ---------------------------------------------------------------------------
EMPTY = 0
RESIDENTIAL = 1
COMMERCIAL = 2
GREEN = 3
ROAD = 4  # legacy generic road infrastructure
INDUSTRIAL = 5

# Road subtypes (Advanced Edition, PRD §5.4). Accepted by the API and the
# traffic engine from day one; the Phase 1 palette only exposes ROAD.
ROAD_PEDESTRIAN = 40
ROAD_LOCAL = 41
ROAD_AVENUE = 42
ROAD_HIGHWAY = 43

VALID_TILE_TYPES = frozenset(
    {
        EMPTY,
        RESIDENTIAL,
        COMMERCIAL,
        GREEN,
        ROAD,
        INDUSTRIAL,
        ROAD_PEDESTRIAN,
        ROAD_LOCAL,
        ROAD_AVENUE,
        ROAD_HIGHWAY,
    }
)

# Zone tiles interact with the road network directly. Highway (43) is
# access-restricted: zones may not step on/off a highway directly (PRD §8.3).
ZONE_TILE_TYPES = frozenset({RESIDENTIAL, COMMERCIAL})

# ---------------------------------------------------------------------------
# Road network weights (PRD §8.2, §9.7)
# ---------------------------------------------------------------------------
# Higher speed weight = faster traversal. Legacy type 4 maps to the local
# road weight per PRD §5.4 ("a sensible default road weight").
ROAD_SPEED_WEIGHTS = {
    ROAD: 3,
    ROAD_PEDESTRIAN: 1,
    ROAD_LOCAL: 3,
    ROAD_AVENUE: 5,
    ROAD_HIGHWAY: 10,
}

MIN_ROAD_SPEED_WEIGHT = min(ROAD_SPEED_WEIGHTS.values())

# Cost of stepping onto a road tile. Deterministic inverse of the speed
# weight so faster roads produce *cheaper paths*, never score bonuses
# (PRD §9.6). cost = ROAD_STEP_COST_BASE / speed_weight.
ROAD_STEP_COST_BASE = 10.0

# Nominal vehicle capacity per road subtype for congestion estimation
# (PRD §9.7). Values are centralized here; congestion scoring itself lands
# with Phase 3.
ROAD_CAPACITIES = {
    ROAD: 60,
    ROAD_PEDESTRIAN: 20,
    ROAD_LOCAL: 60,
    ROAD_AVENUE: 140,
    ROAD_HIGHWAY: 400,
}

# ---------------------------------------------------------------------------
# Scoring (PRD §9)
# ---------------------------------------------------------------------------
# Base values are MetroGrid's documented default calibration; the PRD fixes
# the modifiers and radii below but leaves baselines to the implementation.
LIVABILITY_BASE = 70.0
RESOURCES_BASE = 50.0
TRAFFIC_BASE = 100.0

# §9.3: for every Green Space, residential zones within Manhattan radius 3
# receive +10 Livability (per green/residential pair).
GREEN_BONUS = 10.0
GREEN_RADIUS = 3

# §9.4: for every Heavy Industrial zone, residential zones within Manhattan
# radius 4 receive -15 Livability (per industrial/residential pair).
INDUSTRIAL_PENALTY = 15.0
INDUSTRIAL_RADIUS = 4

# §9.2: for every Residential tile, a Commercial tile within Manhattan
# radius 4 grants +10 Resources; its absence applies a -20 penalty.
RESOURCE_BONUS = 10.0
RESOURCE_PENALTY = 20.0
RESOURCE_RADIUS = 4

# §9.5: a Residential zone that cannot reach a Commercial zone by road
# applies a -5 Traffic penalty.
TRAFFIC_DISCONNECT_PENALTY = 5.0

# ---------------------------------------------------------------------------
# Local delta (PRD §11)
# ---------------------------------------------------------------------------
# Deterministic tie-break order when several metrics move by the same
# absolute amount.
METRIC_PRIORITY = ("livability", "resources", "traffic")

# ---------------------------------------------------------------------------
# GIS import (PRD §7, §12.2)
# ---------------------------------------------------------------------------
GIS_PROVIDER_ENV = "METROGRID_GIS_PROVIDER"
GIS_DEFAULT_PROVIDER = "osm"

OVERPASS_URL_ENV = "METROGRID_OVERPASS_URL"
OVERPASS_DEFAULT_URL = "https://overpass-api.de/api/interpreter"
GIS_REQUEST_TIMEOUT_S = 25.0

MAX_BBOX_SPAN_DEG = 0.1
MAX_BBOX_AREA_DEG2 = 0.01
GIS_TILE_METERS = 15.0
MIN_GRID_SPAN = 4
MAX_GRID_SPAN = 220

GIS_WIDE_ROAD_TYPES = frozenset({ROAD_AVENUE, ROAD_HIGHWAY})

MAX_IMPORTED_TILES = 40_000

# ---------------------------------------------------------------------------
# Asset upload (PRD §12.3, Phase 5)
# ---------------------------------------------------------------------------
ASSET_BUCKET = "models"
ASSET_MAX_BYTES = 25 * 1024 * 1024  # 25 MB — reject larger uploads with 413
ASSET_ALLOWED_EXTENSIONS = frozenset({".glb", ".gltf"})

# GLB files begin with the 4-byte magic "glTF"; glTF JSON files open with "{".
# We verify leading bytes rather than trusting the client-supplied MIME type.
GLB_MAGIC = b"glTF"
GLTF_JSON_START = b"{"

# ---------------------------------------------------------------------------
# API / app
# ---------------------------------------------------------------------------
APP_VERSION = "0.1.0"

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
