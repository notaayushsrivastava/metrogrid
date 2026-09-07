/**
 * Spatial extensibility types (PRD Phase 4, §31.1).
 *
 * MetroGrid's principle:  Logical City State → Spatial Geometry →
 * Visual Transform → Renderer.
 *
 * These types are the Phase 4 *extension points* — declared now so future
 * freeform roads and independently oriented building models slot in without
 * rewriting the sparse city state or the scoring model. They are data-only:
 * scoring never reads them (PRD: orientation is spatial, not score logic).
 * No Phase 4 tool sets them yet; renderers may consult them defensively.
 */

export interface GridPointXY {
  x: number;
  y: number;
}

/**
 * Future freeform road geometry (PRD Phase 4 "Freeform Roads").
 * The road *subtype* (40-43) keeps controlling speed/capacity semantics;
 * geometry is purely spatial presentation data.
 */
export interface RoadGeometry {
  id: string;
  /** Road subtype this geometry visualizes (40-43). */
  type: number;
  /** Polyline vertices in grid coordinates; may exceed two points later. */
  points: GridPointXY[];
  /** Visual stroke width in grid cells (optional). */
  width?: number;
}

/** Per-model visual transform for future `.glb`/`.gltf` assets (PRD Phase 5-ready). */
export interface ModelTransform {
  /** Rotation in degrees around each axis (yaw = y). Independent of tile orientation. */
  rotation?: GridPointXY & { z?: number };
  scale?: { x: number; y: number; z: number };
  /** Offset from the tile anchor in world units. */
  positionOffset?: { x: number; y: number; z: number };
}

/**
 * Rendered Spatial Object = Tile Position + Optional Geometry +
 * Optional Visual Transform (PRD Phase 4 "Spatial Object Principle").
 *
 * A TileObject *may* carry `transform` metadata alongside its logical type.
 * The 2D canvas applies yaw rotation when present; future 3D renderers read
 * the full transform. Transforms ride along with the tile as data (not
 * transient UI state) and are safe to drop: a failed visual never corrupts
 * the simulated city.
 */
export type SpatialObject = {
  position: GridPointXY;
  geometry?: RoadGeometry;
  transform?: ModelTransform;
};

/* -------------------------------------------------------------------------
 * Phase 5 (Day 2) — Freeform Spatial Placement (PRD line 495)
 * -------------------------------------------------------------------------
 * The sparse grid remains the authoritative *reference* system and the
 * transport format for scoring, but it is no longer a *restriction*: zones
 * live at arbitrary world coordinates with arbitrary rotation and footprint.
 * The clean separation the PRD mandates:
 *
 *   logical type  → `type` (drives simulation semantics)
 *   world position → `position` (float cell-space center)
 *   footprint      → `footprint` (unsnapped w/d in cell units)
 *   visual/extra   → `attributes` (name, armed model, …)
 */

/** Zone types placeable freeform (roads are Phase 6 — freeform road authoring). */
export type ZoneType = 1 | 2 | 3 | 5;

export interface ZoneAttributes {
  /** User-facing name/label. */
  name?: string;
  /** Armed 3D model reference carried over from the Phase 5 upload flow. */
  model_url?: string;
  modelUrl?: string;
  /** Population or job density per unit area. */
  density?: number;
  /** Capacity (units/people/jobs). */
  capacity?: number;
  /** Number of floors (affects 3D mesh height). */
  floors?: number;
  /** Exact height in meters (optional alternative to floors). */
  height?: number;
  /** Development intensity multiplier (e.g. 1.0 = standard, 2.0 = high density). */
  developmentIntensity?: number;
}

/** A freeform planning zone — the PRD's `SpatialZone` conceptual model. */
export interface SpatialZone {
  id: string;
  type: ZoneType;
  /** World-space center in cell units (float — never snapped to tile centers). */
  position: GridPointXY;
  /** Rotation in degrees, clockwise in canvas space (y-down). */
  rotation: number;
  /** Footprint in cell units (float). */
  footprint: { width: number; depth: number };
  attributes: ZoneAttributes;
}

/* -------------------------------------------------------------------------
 * Phase 6 (Day 2) — Freeform Road Authoring (PRD §1.3 Phase 6, line 549)
 * -------------------------------------------------------------------------
 * Multi-segment road geometry with editable control points, arbitrary orientation,
 * custom width (in meters), and road subtype semantics (4, 40, 41, 42, 43).
 */

export type RoadSubtype = 4 | 40 | 41 | 42 | 43;

export interface SpatialRoadPoint {
  x: number; // World / meter coords (X)
  y: number; // World / meter coords (Z or Y)
  z?: number; // Elevation
}

export interface RoadAttributes {
  name?: string;
  speedLimit?: number;
  capacity?: number;
}

export interface SpatialRoad {
  id: string;
  type: RoadSubtype;
  points: SpatialRoadPoint[];
  width: number; // Road width in meters (4m ped, 8m local, 12m avenue, 16m highway)
  elevation?: number;
  level?: number;
  attributes?: RoadAttributes;
}


