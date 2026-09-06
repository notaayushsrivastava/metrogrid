/** Tests for chunk index / viewport culling (PRD §25.2 #5, §6.2-6.3). */

import { describe, expect, it } from "vitest";
import { TILE, type TileObject } from "../types/city";
import {
  buildChunkIndex,
  chunkKeyFor,
  chunkKeysInBounds,
  chunkRangeForBounds,
} from "./chunks";

describe("chunkKeyFor", () => {
  it("uses floor division so negatives land in the correct chunk", () => {
    expect(chunkKeyFor(0, 0)).toBe("0,0");
    expect(chunkKeyFor(15, 15)).toBe("0,0");
    expect(chunkKeyFor(16, 16)).toBe("1,1");
    expect(chunkKeyFor(-1, -1)).toBe("-1,-1"); // floor(-1/16) = -1
    expect(chunkKeyFor(-16, -16)).toBe("-1,-1");
    expect(chunkKeyFor(-17, 3)).toBe("-2,0");
  });
});

describe("buildChunkIndex", () => {
  it("groups tiles by chunk", () => {
    const tiles = new Map<string, TileObject>([
      [`0,0`, { type: TILE.RESIDENTIAL }],
      [`1,0`, { type: TILE.GREEN }],
      [`16,0`, { type: TILE.ROAD }], // chunk (1,0)
    ]);
    const index = buildChunkIndex(tiles);
    expect(index.get("0,0")?.map((e) => `${e.x},${e.y}`)).toEqual(["0,0", "1,0"]);
    expect(index.get("1,0")?.map((e) => `${e.x},${e.y}`)).toEqual(["16,0"]);
  });
});

describe("chunkRangeForBounds / chunkKeysInBounds", () => {
  it("covers the bounds rectangle inclusive", () => {
    const range = chunkRangeForBounds({ min_x: -20, max_x: 20, min_y: -5, max_y: 5 });
    expect(range).toEqual({ cx0: -2, cx1: 1, cy0: -1, cy1: 0 });
  });

  it("returns deterministic ordered chunk keys within the visible set", () => {
    // min_x=0..max_x=31 → cx 0..1; min_y=0..max_y=15 → cy 0 only.
    const keys = chunkKeysInBounds({ min_x: 0, max_x: 31, min_y: 0, max_y: 15 });
    expect(keys).toEqual(["0,0", "1,0"]);
  });
});