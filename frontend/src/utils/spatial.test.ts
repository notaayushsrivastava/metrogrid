import { describe, expect, it } from "vitest";
import {
  deriveTileMap,
  pointInZone,
  resizeFromCorner,
  rotateAround,
  zoneCoveredCells,
  zoneOverlaps,
} from "./spatial";
import type { GridState, TileObject, TileType } from "../types/city";
import type { SpatialZone } from "../types/spatial";

const TILE_SET: GridState = new Map<string, TileObject>([["0,0", { type: 4 as TileType }]]);

function zone(overrides: Partial<SpatialZone> = {}): SpatialZone {
  return {
    id: "z1",
    type: 1,
    position: { x: 10, y: 10 },
    rotation: 0,
    footprint: { width: 3, depth: 3 },
    attributes: { name: "Test" },
    ...overrides,
  };
}

describe("rotateAround", () => {
  it("is identity for a 360° rotation", () => {
    const p = { x: 3, y: 1 };
    const c = { x: 1, y: 1 };
    const r = rotateAround(p, c, 360);
    expect(Math.abs(r.x - p.x)).toBeLessThan(1e-9);
    expect(Math.abs(r.y - p.y)).toBeLessThan(1e-9);
  });

  it("rotates (1,0) to (0,1) 90° clockwise in y-down space", () => {
    const c = { x: 0, y: 0 };
    const r = rotateAround({ x: 1, y: 0 }, c, 90);
    expect(Math.abs(r.x - 0)).toBeLessThan(1e-9);
    expect(Math.abs(r.y - 1)).toBeLessThan(1e-9);
  });
});

describe("zoneCoveredCells", () => {
  it("covers the cells strictly inside an axis-aligned zone", () => {
    // A 3×3 box centered on integer (10,10) spans [8.5,11.5]; by the
    // cell-center rule (matching the GIS rasterizer), only cells whose
    // center is STRICTLY inside are covered: x∈{9,10} (11.5 is boundary).
    const z = zone();
    const cells = zoneCoveredCells(z);
    expect(cells.length).toBe(2 * 2);
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    expect(Math.min(...xs)).toBe(9);
    expect(Math.max(...xs)).toBe(10);
    expect(Math.min(...ys)).toBe(9);
    expect(Math.max(...ys)).toBe(10);
  });

  it("is deterministic in (y, x) order", () => {
    const a = zoneCoveredCells(zone());
    const b = zoneCoveredCells(zone());
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) {
      const prev = a[i - 1];
      const cur = a[i];
      expect(prev.y * 1e9 + prev.x <= cur.y * 1e9 + cur.x).toBe(true);
    }
  });

  it("handles rotation (same area, different covered cells)", () => {
    const z = zone({ rotation: 45 });
    const cells = zoneCoveredCells(z);
    expect(cells.length).toBeGreaterThan(0);
  });
});

describe("pointInZone", () => {
  it("is inside only the footprint", () => {
    const z = zone({ position: { x: 0, y: 0 }, footprint: { width: 2, depth: 2 } });
    expect(pointInZone(z, 0, 0)).toBe(true);
    expect(pointInZone(z, 1.5, 0)).toBe(false);
    expect(pointInZone(z, 3, 3)).toBe(false);
  });

  it("rotates the test with the zone", () => {
    // A wide, shallow zone rotated 90° should contain a point at (±, 0.5wd).
    const z = zone({ position: { x: 0, y: 0 }, footprint: { width: 6, depth: 1 }, rotation: 0 });
    expect(pointInZone(z, 2.5, 0)).toBe(true);
    expect(pointInZone(z, 0, 2.5)).toBe(false);
    const r90 = zone({ position: { x: 0, y: 0 }, footprint: { width: 6, depth: 1 }, rotation: 90 });
    expect(pointInZone(r90, 0, 2.5)).toBe(true);
    expect(pointInZone(r90, 2.5, 0)).toBe(false);
  });
});

describe("resizeFromCorner", () => {
  it("grows the zone toward the dragged corner", () => {
    const z = zone({ position: { x: 0, y: 0 }, footprint: { width: 2, depth: 2 }, rotation: 0 });
    // Drag the bottom-right corner (index 2) — fixed opposite corner (-1,-1)
    // to the dragged (4,4) gives an extent of 5 per axis.
    const grown = resizeFromCorner(z, 2, { x: 4, y: 4 });
    expect(grown.footprint.width).toBeCloseTo(5, 5);
    expect(grown.footprint.depth).toBeCloseTo(5, 5);
    expect(grown.position.x).toBeCloseTo(1.5, 5);
    expect(grown.position.y).toBeCloseTo(1.5, 5);
  });

  it("does not invert or underflow", () => {
    const z = zone({ position: { x: 0, y: 0 }, footprint: { width: 2, depth: 2 }, rotation: 0 });
    const small = resizeFromCorner(z, 2, { x: 0.1, y: 0.1 });
    expect(small.footprint.width).toBeGreaterThan(0.1);
    expect(small.footprint.depth).toBeGreaterThan(0.1);
  });
});

describe("deriveTileMap", () => {
  it("keeps legacy tiles and paints zones on top", () => {
    // 2×2 box at (3,3) spans [2,4] → cell centers 2.5,3.5 (x) and 2.5,3.5 (y)
    // are strictly inside → covers (2,2),(3,2),(2,3),(3,3).
    const z = zone({ position: { x: 3, y: 3 }, footprint: { width: 2, depth: 2 }, rotation: 0 });
    const map = deriveTileMap(TILE_SET, [z]);
    expect(map.get("0,0")?.type).toBe(4); // legacy tile preserved
    expect(map.get("3,3")?.type).toBe(1); // zone painted
    expect(map.get("2,2")?.type).toBe(1);
  });

  it("is pure — does not mutate the input map", () => {
    const before = TILE_SET.size;
    deriveTileMap(TILE_SET, [zone()]);
    expect(TILE_SET.size).toBe(before);
  });
});

describe("zoneOverlaps", () => {
  it("reports no overlap for distant zones", () => {
    const empty: GridState = new Map();
    const a = zone({ id: "a", position: { x: 0, y: 0 }, footprint: { width: 2, depth: 2 } });
    const b = zone({ id: "b", position: { x: 100, y: 100 }, footprint: { width: 2, depth: 2 } });
    expect(zoneOverlaps(empty, [b], a)).toBe(false);
  });

  it("reports overlap at the same spot (another zone)", () => {
    const a = zone({ id: "a", position: { x: 0, y: 0 }, footprint: { width: 2, depth: 2 } });
    const b = zone({ id: "b", position: { x: 0, y: 0 }, footprint: { width: 2, depth: 2 } });
    expect(zoneOverlaps(TILE_SET, [b], a)).toBe(true);
  });

  it("reports overlap with a legacy tile", () => {
    const a = zone({ id: "a", position: { x: 0, y: 0 }, footprint: { width: 2, depth: 2 } });
    expect(zoneOverlaps(TILE_SET, [], a)).toBe(true); // overlaps (0,0) tile
  });
});