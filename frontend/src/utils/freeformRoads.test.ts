import { describe, expect, it } from "vitest";
import {
  getDefaultRoadWidth,
  pointDistance,
  calculatePolylineLength,
  closestPointOnSegment,
  splitRoadAtIndex,
  insertNodeIntoRoad,
  rasterizeFreeformRoadsToTiles,
  rotateRoadAroundCenter,
} from "./freeformRoads";
import type { SpatialRoad } from "../types/spatial";

describe("freeformRoads utilities", () => {
  it("rotates road around centroid", () => {
    const road: SpatialRoad = {
      id: "road_rot",
      type: 41,
      points: [{ x: -10, y: 0 }, { x: 10, y: 0 }],
      width: 8.0,
    };
    const rotated = rotateRoadAroundCenter(road, 90);
    expect(Math.abs(Math.round(rotated.points[0].x))).toBe(0);
    expect(Math.round(rotated.points[0].y)).toBe(-10);
    expect(Math.abs(Math.round(rotated.points[1].x))).toBe(0);
    expect(Math.round(rotated.points[1].y)).toBe(10);
  });
  it("returns default road widths per subtype", () => {
    expect(getDefaultRoadWidth(40)).toBe(4.0);
    expect(getDefaultRoadWidth(41)).toBe(8.0);
    expect(getDefaultRoadWidth(42)).toBe(12.0);
    expect(getDefaultRoadWidth(43)).toBe(16.0);
    expect(getDefaultRoadWidth(4)).toBe(8.0);
  });

  it("calculates distance and polyline length", () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 3, y: 4 };
    const p3 = { x: 3, y: 10 };

    expect(pointDistance(p1, p2)).toBe(5);
    expect(calculatePolylineLength([p1, p2, p3])).toBe(11);
  });

  it("finds closest point on segment", () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 0 };
    const target = { x: 5, y: 5 };

    const res = closestPointOnSegment(target, p1, p2);
    expect(res.point.x).toBe(5);
    expect(res.point.y).toBe(0);
    expect(res.distance).toBe(5);
    expect(res.t).toBe(0.5);
  });

  it("splits road at valid index", () => {
    const road: SpatialRoad = {
      id: "road_1",
      type: 41,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
      width: 8.0,
    };

    const res = splitRoadAtIndex(road, 1);
    expect(res).not.toBeNull();
    if (res) {
      expect(res[0].points.length).toBe(2);
      expect(res[1].points.length).toBe(2);
      expect(res[0].points[1]).toEqual({ x: 10, y: 0 });
      expect(res[1].points[0]).toEqual({ x: 10, y: 0 });
    }
  });

  it("inserts node into road segment", () => {
    const road: SpatialRoad = {
      id: "road_2",
      type: 41,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      width: 8.0,
    };

    const updated = insertNodeIntoRoad(road, { x: 5, y: 0.5 }, 2.0);
    expect(updated).not.toBeNull();
    if (updated) {
      expect(updated.points.length).toBe(3);
      expect(updated.points[1].x).toBe(5);
      expect(updated.points[1].y).toBe(0);
    }
  });

  it("rasterizes freeform roads to grid tiles", () => {
    const road: SpatialRoad = {
      id: "road_3",
      type: 42, // Avenue
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      width: 10.0,
    };

    const tiles = rasterizeFreeformRoadsToTiles([road], 10.0);
    expect(tiles.size).toBeGreaterThan(0);
    expect(tiles.get("0,0")).toBe(42);
    expect(tiles.get("1,0")).toBe(42);
  });
});

