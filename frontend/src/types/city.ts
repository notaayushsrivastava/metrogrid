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

export interface CalculateResponse {
  global_scores: GlobalScores;
  local_deltas: LocalDelta | null;
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

/** Transient floating feedback at a placement (PRD §11). */
export interface Feedback {
  id: number;
  x: number;
  y: number;
  value: number;
  metric: string;
}
