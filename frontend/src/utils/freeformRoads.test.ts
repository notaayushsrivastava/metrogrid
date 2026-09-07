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
  getRoadLevel,
  getRoadElevation,
  getRoadPointElevation,
  canConnectRoads,
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

  it("handles multi-level infrastructure levels and elevations (PRD Phase 9)", () => {
    const tunnelRoad: SpatialRoad = {
      id: "road_tunnel",
      type: 41,
      level: -1,
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      width: 8.0,
    };
    const elevatedRoad: SpatialRoad = {
      id: "road_elevated",
      type: 43,
      level: 1,
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      width: 16.0,
    };
    const surfaceRoad: SpatialRoad = {
      id: "road_surface",
      type: 42,
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      width: 12.0,
    };

    expect(getRoadLevel(tunnelRoad)).toBe(-1);
    expect(getRoadElevation(tunnelRoad)).toBe(-6.0);

    expect(getRoadLevel(elevatedRoad)).toBe(1);
    expect(getRoadElevation(elevatedRoad)).toBe(6.0);

    expect(getRoadLevel(surfaceRoad)).toBe(0);
    expect(getRoadElevation(surfaceRoad)).toBe(0.0);
  });

  it("interpolates sloped ramp elevations smoothly (PRD Phase 9)", () => {
    const ramp: SpatialRoad = {
      id: "road_ramp",
      type: 41,
      isRamp: true,
      startLevel: 0,
      endLevel: 1,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
      width: 8.0,
    };

    expect(getRoadPointElevation(ramp, 0)).toBe(0.0);
    expect(getRoadPointElevation(ramp, 1)).toBe(3.0);
    expect(getRoadPointElevation(ramp, 2)).toBe(6.0);
  });

  it("verifies multi-level connection rules (PRD Phase 9)", () => {
    const surfaceA: SpatialRoad = {
      id: "surf_a",
      type: 41,
      level: 0,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      width: 8.0,
    };
    const surfaceB: SpatialRoad = {
      id: "surf_b",
      type: 41,
      level: 0,
      points: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
      width: 8.0,
    };
    const elevated: SpatialRoad = {
      id: "elev_1",
      type: 43,
      level: 1,
      points: [{ x: 10, y: -10 }, { x: 10, y: 10 }],
      width: 16.0,
    };
    const ramp: SpatialRoad = {
      id: "ramp_0_1",
      type: 41,
      isRamp: true,
      startLevel: 0,
      endLevel: 1,
      points: [{ x: 10, y: 0 }, { x: 10, y: 10 }],
      width: 8.0,
    };

    // Same level connects
    expect(canConnectRoads(surfaceA, surfaceB)).toBe(true);

    // Overpass (L0 crossing L1) does not automatically intersect/connect
    expect(canConnectRoads(surfaceA, elevated)).toBe(false);

    // Ramp bridging L0 and L1 connects to both L0 surface and L1 elevated
    expect(canConnectRoads(ramp, surfaceA)).toBe(true);
    expect(canConnectRoads(ramp, elevated)).toBe(true);
  });
});

