import { describe, expect, it } from "vitest";
import { TILE, type GisBounds } from "../types/city";
import {
  MAX_BBOX_AREA_DEG2,
  MAX_BBOX_SPAN_DEG,
  mergeImportedTiles,
  validateGisBounds,
} from "./gis";

const GOOD: GisBounds = { north: 40.75, south: 40.74, east: -73.97, west: -73.98 };

describe("validateGisBounds", () => {
  it("accepts a sane city-sized box", () => {
    expect(validateGisBounds(GOOD)).toEqual([]);
  });

  it("rejects inverted edges", () => {
    const issues = validateGisBounds({ ...GOOD, north: 40.73 });
    expect(issues.some((i) => i.field === "north")).toBe(true);
    const issues2 = validateGisBounds({ ...GOOD, east: -73.99 });
    expect(issues2.some((i) => i.field === "east")).toBe(true);
  });

  it("rejects spans beyond the backend cap", () => {
    const issues = validateGisBounds({
      ...GOOD,
      north: GOOD.south + MAX_BBOX_SPAN_DEG + 0.001,
    });
    expect(issues).toHaveLength(1);
  });

  it("rejects area beyond the backend cap", () => {
    const half = Math.sqrt(MAX_BBOX_AREA_DEG2) + 0.0005;
    const issues = validateGisBounds({
      north: GOOD.south + half,
      south: GOOD.south,
      east: GOOD.west + half,
      west: GOOD.west,
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects non-finite input", () => {
    const issues = validateGisBounds({ ...GOOD, north: Number.NaN });
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("mergeImportedTiles", () => {
  it("adds imported tiles into empty cells", () => {
    const existing = new Map([["0,0", { type: TILE.RESIDENTIAL }]]);
    const { merged, added } = mergeImportedTiles(existing, {
      "1,0": { type: TILE.ROAD },
      "2,0": { type: TILE.COMMERCIAL },
    });
    expect(added).toBe(2);
    expect(merged.get("1,0")).toEqual({ type: TILE.ROAD });
    expect(merged.get("2,0")).toEqual({ type: TILE.COMMERCIAL });
  });

  it("never overwrites existing user tiles", () => {
    const existing = new Map([["0,0", { type: TILE.INDUSTRIAL }]]);
    const { merged, added } = mergeImportedTiles(existing, {
      "0,0": { type: TILE.GREEN },
    });
    expect(added).toBe(0);
    expect(merged.get("0,0")?.type).toBe(TILE.INDUSTRIAL);
  });

  it("skips empty-type imports and malformed rows", () => {
    const { merged, added } = mergeImportedTiles(new Map(), {
      "0,0": { type: TILE.EMPTY },
      "1,0": { type: TILE.GREEN },
    });
    expect(added).toBe(1);
    expect(merged.has("0,0")).toBe(false);
  });

  it("does not mutate the input map", () => {
    const existing = new Map([["0,0", { type: TILE.RESIDENTIAL }]]);
    mergeImportedTiles(existing, { "1,0": { type: TILE.ROAD } });
    expect(existing.size).toBe(1);
  });
});
