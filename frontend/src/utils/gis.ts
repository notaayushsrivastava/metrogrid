/**
 * Client-side GIS helpers (PRD §7, Phase 4).
 *
 * Pure and deterministic: bounds validation mirrors the backend contract and
 * the merge policy guarantees the user's existing city always survives an
 * import (PRD Phase 4: "existing city state MUST remain recoverable").
 */

import { TILE, type GisBounds, type GridState, type TileObject, type TileType } from "../types/city";

/** Mirrors backend `MAX_BBOX_SPAN_DEG` / `MAX_BBOX_AREA_DEG2` (app/config.py). */
export const MAX_BBOX_SPAN_DEG = 0.1;
export const MAX_BBOX_AREA_DEG2 = 0.01;

export interface BoundsIssue {
  field: "north" | "south" | "east" | "west";
  message: string;
}

/** Validate a bounding box before offering it to the user / backend. */
export function validateGisBounds(bounds: GisBounds): BoundsIssue[] {
  const issues: BoundsIssue[] = [];
  if (!Number.isFinite(bounds.north) || bounds.north <= bounds.south) {
    issues.push({ field: "north", message: "North edge must be above the south edge." });
  }
  if (!Number.isFinite(bounds.east) || bounds.east <= bounds.west) {
    issues.push({ field: "east", message: "East edge must be right of the west edge." });
  }
  if (
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.south) &&
    bounds.north - bounds.south > MAX_BBOX_SPAN_DEG
  ) {
    issues.push({ field: "north", message: "Selected area is too tall — pick a smaller region." });
  }
  if (
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.west) &&
    bounds.east - bounds.west > MAX_BBOX_SPAN_DEG
  ) {
    issues.push({ field: "east", message: "Selected area is too wide — pick a smaller region." });
  }
  if (
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.west) &&
    (bounds.north - bounds.south) * (bounds.east - bounds.west) > MAX_BBOX_AREA_DEG2
  ) {
    issues.push({ field: "north", message: "Selected area is too large — zoom in further." });
  }
  return issues;
}

/**
 * Estimate the on-grid size of a selected area (≈ backend projection:
 * one cell ≈ 15 m, aspect-corrected). Purely informational for the UI.
 */
const METERS_PER_DEG_LAT = 110_574;
const METERS_PER_DEG_LON = 111_320;
export const GIS_TILE_METERS = 15;

export function estimateGridSpan(bounds: GisBounds): { cellsX: number; cellsY: number } {
  const midLat = (bounds.north + bounds.south) / 2;
  const latM = (bounds.north - bounds.south) * METERS_PER_DEG_LAT;
  const lonM =
    (bounds.east - bounds.west) * METERS_PER_DEG_LON * Math.cos((midLat * Math.PI) / 180);
  return {
    cellsX: Math.max(1, Math.round(lonM / GIS_TILE_METERS)),
    cellsY: Math.max(1, Math.round(latM / GIS_TILE_METERS)),
  };
}

/**
 * Merge imported GIS tiles into the current city.
 *
 * Policy: imported tiles fill **empty** cells only — hand-placed tiles win.
 * This makes import strictly additive, so the planner never loses user work
 * and scores for existing zones stay stable (PRD §31 separation of state).
 */
export function mergeImportedTiles(
  existing: GridState,
  imported: Record<string, { type: number }>
): { merged: GridState; added: number } {
  const merged = new Map(existing);
  let added = 0;
  for (const [key, tile] of Object.entries(imported)) {
    const type = tile?.type;
    if (typeof type !== "number" || type === TILE.EMPTY) continue;
    if (!existing.has(key)) {
      merged.set(key, { type: type as TileType } satisfies TileObject);
      added += 1;
    }
  }
  return { merged, added };
}
