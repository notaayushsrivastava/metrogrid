/**
 * Shared MetroGrid domain types (PRD §5, §12, §19).
 *
 * The authoritative city state is a sparse coordinate map keyed by "x,y".
 * Tile type values mirror the backend (app/models/tiles.py) exactly.
 */

/** Tile type values (PRD §5.4). Kept as plain numbers for JSON round-trips. */
export const TILE = {
  EMPTY: 0,
  RESIDENTIAL: 1,
  COMMERCIAL: 2,
  GREEN: 3,
  ROAD: 4,
  INDUSTRIAL: 5,
  ROAD_PEDESTRIAN: 40,
  ROAD_LOCAL: 41,
  ROAD_AVENUE: 42,
  ROAD_HIGHWAY: 43,
} as const;

export type TileType = (typeof TILE)[keyof typeof TILE];

/** Signed 32-bit coordinate limits (PRD §5.2). */
export const GRID_MIN = -2147483648;
export const GRID_MAX = 2147483647;

export interface TileObject {
  type: TileType;
  model_url?: string;
  /**
   * Optional visual transform (PRD Phase 4 spatial extensibility).
   * Data-only decoration: scoring and placement logic never read this.
   */
  transform?: import("./spatial").ModelTransform;
}

/** Sparse map key format: "x,y" (PRD §5.1). */
export type GridState = Map<string, TileObject>;

export interface Bounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

/** Active viewport bounds (PRD §6.1, §12.1) — sent with scoring requests. */
export type GridBounds = Bounds;

export interface LatestAction {
  x: number;
  y: number;
  type: TileType;
  /** Type previously at (x, y) — set on erase so the backend can diff. */
  previous_type?: TileType;
}

export interface GlobalScores {
  livability: number;
  traffic: number;
  resources: number;
}

export interface LocalDelta {
  x: number;
  y: number;
  value: number;
  metric: "livability" | "traffic" | "resources";
}

export interface TrafficDetail {
  average_ratio: number;
  congested_roads: number;
  road_count: number;
  max_ratio: number;
}

export interface CalculateResponse {
  global_scores: GlobalScores;
  local_deltas: LocalDelta | null;
  traffic_detail: TrafficDetail | null;
}

export interface LayoutSummary {
  id: string;
  name: string;
  created_at: string | number | null;
  tile_count: number;
}

export interface LayoutListResponse {
  storage: "supabase" | "memory";
  layouts: LayoutSummary[];
}

export interface LayoutDetail {
  id: string;
  name: string;
  created_at: string | number | null;
  grid_state: Record<string, { type: number }>;
  tile_count: number;
}

export interface SaveLayoutRequest {
  name: string;
  grid_state: Record<string, { type: number }>;
}

/** User-selectable tools. `select` and `erase` are actions, not tile types. */
export type ToolId =
  | "select"
  | "residential"
  | "commercial"
  | "green"
  | "industrial"
  | "road"
  | "erase";

/** Geographic bounding box for GIS import (PRD §7.2, §12.2). */
export interface GisBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Sparse-grid anchor the imported area maps onto (PRD §7.4). */
export interface GisGridOrigin {
  x: number;
  y: number;
}

/** `POST /api/gis/import` request (PRD §12.2, exact contract). */
export interface GisImportRequest {
  bounds: GisBounds;
  grid_origin: GisGridOrigin;
}

/** `POST /api/gis/import` response (PRD §12.2, exact contract). */
export interface GisImportResponse {
  tiles_imported: number;
  updated_grid: Record<string, { type: number }>;
}

/** Transient floating feedback at a placement (PRD §11). */
export interface Feedback {
  id: number;
  x: number;
  y: number;
  value: number;
  metric: string;
}
