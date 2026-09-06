/**
 * Chunking helpers (PRD §6.2, §6.3).
 *
 * The sparse coordinate space is divided into CHUNK_SIZE × CHUNK_SIZE
 * chunks. Only chunks intersecting the viewport are rendered, and tile
 * updates invalidate only the affected chunk. Chunks are keyed by
 * `floor(x / CHUNK_SIZE),floor(y / CHUNK_SIZE)` — floor division keeps
 * negative coordinates in their correct chunk.
 */

import { CHUNK_SIZE } from "../config/tiles";
import type { GridState, TileObject, TileType } from "../types/city";
import type { GridBounds } from "./coordinates";

export interface ChunkEntry {
  x: number;
  y: number;
  type: TileType;
  /**
   * Full TileObject reference (same object from the sparse map — zero copy).
   * Carries optional visual transform metadata (PRD Phase 4 spatial
   * extensibility) so renderers can honor rotation without extra lookups.
   */
  tile: TileObject;
}

export function chunkKeyFor(x: number, y: number): string {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

/**
 * Index the sparse map by chunk. Rebuilding on tile change is O(tiles) and
 * keeps rendering strictly proportional to visible chunks (PRD §6.3).
 */
export function buildChunkIndex(tiles: GridState): Map<string, ChunkEntry[]> {
  const index = new Map<string, ChunkEntry[]>();
  tiles.forEach((tile, key) => {
    const [x, y] = key.split(",").map(Number);
    const chunkKey = chunkKeyFor(x, y);
    const entries = index.get(chunkKey);
    const entry: ChunkEntry = { x, y, type: tile.type, tile };
    if (entries) {
      entries.push(entry);
    } else {
      index.set(chunkKey, [entry]);
    }
  });
  return index;
}

/** Inclusive chunk-coordinate range covering a grid bounds rectangle. */
export function chunkRangeForBounds(bounds: GridBounds): {
  cx0: number;
  cx1: number;
  cy0: number;
  cy1: number;
} {
  return {
    cx0: Math.floor(bounds.min_x / CHUNK_SIZE),
    cx1: Math.floor(bounds.max_x / CHUNK_SIZE),
    cy0: Math.floor(bounds.min_y / CHUNK_SIZE),
    cy1: Math.floor(bounds.max_y / CHUNK_SIZE),
  };
}

/** Chunk keys intersecting the given grid bounds (deterministic order). */
export function chunkKeysInBounds(bounds: GridBounds): string[] {
  const { cx0, cx1, cy0, cy1 } = chunkRangeForBounds(bounds);
  const keys: string[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      keys.push(`${cx},${cy}`);
    }
  }
  return keys;
}
