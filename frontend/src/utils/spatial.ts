/**
 * Freeform spatial geometry (PRD Phase 5 — Day 2, line 495).
 *
 * Pure, deterministic helpers that bridge freeform `SpatialZone`s and the
 * sparse grid:
 *
 *   zone → covered cells (rasterization)  → scoring (deriveTileMap)
 *   zone → hit-testing / handles          → canvas interactions
 *   zone → overlap detection              → collision feedback
 *
 * Convention (matches utils/coordinates + the backend GIS rasterizer):
 * cell (x, y) spans world [x, x+1) × [y, y+1); a cell's center is
 * (x+0.5, y+0.5); canvas rotation θ is clockwise in y-down space.
 * Cell-center sampling keeps rasterization deterministic — identical zones
 * always cover identical cells (PRD §21/§7.4 spirit).
 */

import { TILE_META } from "../config/tiles";
import { type GridState, type TileObject, type TileType } from "../types/city";
import type { GridPointXY, SpatialZone, SpatialRoad, ZoneType } from "../types/spatial";
import { rasterizeFreeformRoadsToTiles } from "./freeformRoads";

/** Default footprint for a newly placed freeform zone (cell units). */
export const DEFAULT_ZONE_FOOTPRINT = { width: 3, depth: 3 };

/** Footprint clamp — zones stay measurable and never vanish. */
export const MIN_FOOTPRINT = 0.5;
export const MAX_FOOTPRINT = 500;

const ZONE_TYPES: readonly ZoneType[] = [1, 2, 3, 5];

export function isZoneType(type: number): type is ZoneType {
  return (ZONE_TYPES as readonly number[]).includes(type);
}

export function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Rotate point `p` around center `c` by `deg` degrees (canvas y-down). */
export function rotateAround(
  p: GridPointXY,
  c: GridPointXY,
  deg: number
): GridPointXY {
  const r = deg2rad(deg);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: c.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: c.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

/** The four corners of a zone's rotated footprint, in world coords. */
export function zoneCorners(
  zone: SpatialZone
): [GridPointXY, GridPointXY, GridPointXY, GridPointXY] {
  const hw = zone.footprint.width / 2;
  const hd = zone.footprint.depth / 2;
  const local: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([lx, ly]) => ({
    x: zone.position.x + lx * Math.cos(deg2rad(zone.rotation)) - ly * Math.sin(deg2rad(zone.rotation)),
    y: zone.position.y + lx * Math.sin(deg2rad(zone.rotation)) + ly * Math.cos(deg2rad(zone.rotation)),
  })) as [GridPointXY, GridPointXY, GridPointXY, GridPointXY];
}

/**
 * Point-in-zone test: inverse-rotate the point into the zone's local frame
 * and check the axis-aligned footprint box.
 */
export function pointInZone(
  zone: SpatialZone,
  wx: number,
  wy: number
): boolean {
  const r = deg2rad(-zone.rotation);
  const dx = wx - zone.position.x;
  const dy = wy - zone.position.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return (
    Math.abs(lx) < zone.footprint.width / 2 &&
    Math.abs(ly) < zone.footprint.depth / 2
  );
}

/**
 * All grid cells whose *center* lies inside the zone's rotated footprint,
 * in deterministic (y, x) order. This is the rasterization contract that
 * lets the unchanged scoring engine consume freeform zones.
 */
export function zoneCoveredCells(zone: SpatialZone): { x: number; y: number }[] {
  const corners = zoneCorners(zone);
  const minX = Math.floor(Math.min(...corners.map((c) => c.x)));
  const maxX = Math.ceil(Math.max(...corners.map((c) => c.x)));
  const minY = Math.floor(Math.min(...corners.map((c) => c.y)));
  const maxY = Math.ceil(Math.max(...corners.map((c) => c.y)));

  const out: { x: number; y: number }[] = [];
  for (let cy = minY; cy < maxY; cy++) {
    for (let cx = minX; cx < maxX; cx++) {
      if (pointInZone(zone, cx + 0.5, cy + 0.5)) {
        out.push({ x: cx, y: cy });
      }
    }
  }
  // Deterministic paint order (matches sparse.py's (y, x) convention).
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

function zoneToTileObject(zone: SpatialZone): TileObject {
  const tile: TileObject = { type: zone.type };
  if (zone.attributes.model_url) tile.model_url = zone.attributes.model_url;
  return tile;
}

/**
 * Derive the effective sparse tile map from legacy tiles + freeform zones.
 *
 * Paint order: legacy tiles first, then zones in insertion order (later
 * wins on overlap). The result is a plain GridState — the scoring request
 * contract is unchanged, so Phase 1–4 flows and the backend never learn
 * about zones. Pure: identical inputs → identical map.
 */
const ROAD_TYPES = new Set([4, 40, 41, 42, 43]);

/**
 * Derive the effective sparse tile map from legacy tiles + freeform roads + freeform zones.
 *
 * Paint order: legacy tiles first, then freeform roads, then zones in insertion order.
 * Roads always win — zones can never overwrite road corridors.
 */
export function deriveTileMap(
  tiles: GridState,
  zones: SpatialZone[],
  roads: SpatialRoad[] = []
): GridState {
  const derived = new Map(tiles);

  // 1. Surface roads and ramps rasterize to the derived tile map for scoring
  if (roads.length > 0) {
    const surfaceRoads = roads.filter((r) => (r.level ?? 0) === 0 || r.isRamp);
    const roadTiles = rasterizeFreeformRoadsToTiles(surfaceRoads, 10.0);
    roadTiles.forEach((roadType, key) => {
      derived.set(key, { type: roadType as TileType });
    });
  }

  // 2. Freeform zones (protected from overwriting roads)
  for (const zone of zones) {
    for (const { x, y } of zoneCoveredCells(zone)) {
      const key = `${x},${y}`;
      const existing = derived.get(key);
      if (existing && ROAD_TYPES.has(existing.type)) {
        continue; // Protect roads from zone overlap
      }
      derived.set(key, zoneToTileObject(zone));
    }
  }
  return derived;
}

/**
 * Cells occupied by everything OTHER than `zone` — legacy tiles plus other
 * zones. Used for collision feedback (advisory, never blocking).
 */
export function occupiedCellsOutside(
  tiles: GridState,
  zones: SpatialZone[],
  zone: SpatialZone
): Set<string> {
  const occupied = new Set<string>();
  tiles.forEach((_tile, key) => occupied.add(key));
  for (const other of zones) {
    if (other.id === zone.id) continue;
    for (const { x, y } of zoneCoveredCells(other)) {
      occupied.add(`${x},${y}`);
    }
  }
  return occupied;
}

/** True when the zone overlaps any road tile cell. */
export function zoneOverlapsRoad(
  tiles: GridState,
  zone: SpatialZone
): boolean {
  return zoneCoveredCells(zone).some(({ x, y }) => {
    const tile = tiles.get(`${x},${y}`);
    return tile && ROAD_TYPES.has(tile.type);
  });
}

/** True when the zone overlaps any pre-existing tile or other zone. */
export function zoneOverlaps(
  tiles: GridState,
  zones: SpatialZone[],
  zone: SpatialZone
): boolean {
  const occupied = occupiedCellsOutside(tiles, zones, zone);
  return zoneCoveredCells(zone).some(({ x, y }) => occupied.has(`${x},${y}`));
}


/**
 * Corner-anchored resize: drag corner `cornerIndex` (0..3 in zoneCorners
 * order) to `world`; the opposite corner stays fixed. New extents come from
 * the dragged point's offset in the zone's *local* frame; the new center is
 * the rotated midpoint between the fixed corner and the clamped dragged
 * corner. Returns an updated zone (position + footprint only).
 */
export function resizeFromCorner(
  zone: SpatialZone,
  cornerIndex: number,
  world: GridPointXY
): SpatialZone {
  const corners = zoneCorners(zone);
  const fixed = corners[(cornerIndex + 2) % 4];

  // Dragged point in fixed-corner-local, zone-rotated frame.
  const r = deg2rad(-zone.rotation);
  const dx = world.x - fixed.x;
  const dy = world.y - fixed.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);

  const width = Math.min(MAX_FOOTPRINT, Math.max(MIN_FOOTPRINT, Math.abs(lx)));
  const depth = Math.min(MAX_FOOTPRINT, Math.max(MIN_FOOTPRINT, Math.abs(ly)));

  // New center (local to F): halfway to the clamped dragged corner.
  const signX = lx >= 0 ? 1 : -1;
  const signY = ly >= 0 ? 1 : -1;
  const centerLocalX = (signX * width) / 2;
  const centerLocalY = (signY * depth) / 2;
  const cr = deg2rad(zone.rotation);
  const position = {
    x: fixed.x + centerLocalX * Math.cos(cr) - centerLocalY * Math.sin(cr),
    y: fixed.y + centerLocalX * Math.sin(cr) + centerLocalY * Math.cos(cr),
  };

  return { ...zone, position, footprint: { width, depth } };
}

/** Human label for a zone (canvas + a11y). */
export function zoneLabel(type: ZoneType): string {
  switch (type) {
    case 1:
      return "Residential";
    case 2:
      return "Commercial";
    case 3:
      return "Park";
    case 5:
      return "Industrial";
  }
}

/** Zone color reuses the unified tile palette. */
export function zoneColor(type: ZoneType): string {
  return TILE_META[type as keyof typeof TILE_META]?.color ?? "#8d96a5";
}

/** Glyph for a zone (non-color cue, unified with tiles). */
export function zoneGlyph(type: ZoneType): string {
  return TILE_META[type as keyof typeof TILE_META]?.glyph ?? "?";
}

/** Defensive read when parsing persisted zone payloads. */
export function asZoneType(value: unknown): ZoneType | null {
  return typeof value === "number" && isZoneType(value) ? value : null;
}

