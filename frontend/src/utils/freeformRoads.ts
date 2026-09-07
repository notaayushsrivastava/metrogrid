/**
 * Freeform Road Authoring Utilities (PRD Phase 6).
 *
 * Provides polyline geometry calculations, subtype-to-width defaults,
 * point proximity snapping, node insertion/splitting, and deterministic
 * rasterization of multi-segment road geometry into tile coordinates for pathfinding.
 */

import type { InfrastructureLevel, RoadSubtype, SpatialRoad, SpatialRoadPoint } from "../types/spatial";

/** Default road width in meters based on subtype (PRD §5.5, §7.5). */
export const DEFAULT_ROAD_WIDTHS: Record<RoadSubtype, number> = {
  40: 4.0,  // Pedestrian Path
  41: 8.0,  // Local Road
  42: 12.0, // Transit Avenue
  43: 16.0, // Express Highway
  4:  8.0,  // Generic Road
};

export const ROAD_SUBTYPE_NAMES: Record<RoadSubtype, string> = {
  40: "Pedestrian Path",
  41: "Local Road",
  42: "Transit Avenue",
  43: "Express Highway",
  4:  "Road",
};

/** Discrete infrastructure level elevations in meters (PRD Phase 9). */
export const LEVEL_ELEVATION_METERS: Record<InfrastructureLevel, number> = {
  [-2]: -12.0, // Deep Subway / Tunnel
  [-1]: -6.0,  // Shallow Tunnel / Subterranean
  [0]:  0.0,   // Ground / Surface
  [1]:  6.0,   // Elevated Viaduct / Overpass
  [2]:  12.0,  // Skyway / Multi-deck bridge
};

export const LEVEL_NAMES: Record<InfrastructureLevel, string> = {
  [-2]: "Deep Tunnel (L-2)",
  [-1]: "Shallow Tunnel (L-1)",
  [0]:  "Surface (L0)",
  [1]:  "Elevated (L+1)",
  [2]:  "Skyway (L+2)",
};

export const LEVEL_SHORT_BADGES: Record<InfrastructureLevel, string> = {
  [-2]: "L-2 SUBWAY",
  [-1]: "L-1 TUNNEL",
  [0]:  "L0 SURFACE",
  [1]:  "L+1 ELEVATED",
  [2]:  "L+2 SKYWAY",
};

/** Return the discrete level for a road, defaulting to 0 (surface). */
export function getRoadLevel(road: SpatialRoad): InfrastructureLevel {
  return (road.level ?? 0) as InfrastructureLevel;
}

/** Return the physical elevation in meters for a road or default level height. */
export function getRoadElevation(road: SpatialRoad): number {
  if (road.elevation !== undefined) return road.elevation;
  const lvl = getRoadLevel(road);
  return LEVEL_ELEVATION_METERS[lvl] ?? 0.0;
}

/**
 * Get elevation at a specific point along the road (handling ramps/slopes).
 */
export function getRoadPointElevation(
  road: SpatialRoad,
  pointIndex: number,
  terrainElevation: number = 0
): number {
  if (road.points[pointIndex]?.z !== undefined) {
    return road.points[pointIndex].z! + terrainElevation;
  }

  if (road.isRamp && road.points.length > 1) {
    const startLvl = (road.startLevel ?? road.level ?? 0) as InfrastructureLevel;
    const endLvl = (road.endLevel ?? ((road.level ?? 0) + 1)) as InfrastructureLevel;
    const startElev = LEVEL_ELEVATION_METERS[startLvl] ?? 0.0;
    const endElev = LEVEL_ELEVATION_METERS[endLvl] ?? 6.0;

    const t = pointIndex / (road.points.length - 1);
    const interpolated = startElev + (endElev - startElev) * t;
    return interpolated + (interpolated === 0 ? terrainElevation : 0);
  }

  const baseElev = getRoadElevation(road);
  return baseElev + (baseElev === 0 ? terrainElevation : 0);
}

/**
 * Determine if two roads can connect without an explicit vertical connector/ramp.
 * Per PRD Phase 9 rules:
 * - Roads at different levels must not automatically intersect.
 * - Same x/y coordinates may contain multiple valid road levels without merging.
 */
export function canConnectRoads(road1: SpatialRoad, road2: SpatialRoad): boolean {
  const lvl1 = getRoadLevel(road1);
  const lvl2 = getRoadLevel(road2);

  if (lvl1 === lvl2) return true;

  // If one is a ramp, check if it bridges to the other's level
  if (road1.isRamp) {
    const s1 = road1.startLevel ?? lvl1;
    const e1 = road1.endLevel ?? (lvl1 + 1);
    if (lvl2 === s1 || lvl2 === e1) return true;
  }

  if (road2.isRamp) {
    const s2 = road2.startLevel ?? lvl2;
    const e2 = road2.endLevel ?? (lvl2 + 1);
    if (lvl1 === s2 || lvl1 === e2) return true;
  }

  return false;
}


/** Get default width in meters for a given road subtype. */
export function getDefaultRoadWidth(type: number): number {
  return DEFAULT_ROAD_WIDTHS[type as RoadSubtype] ?? 8.0;
}

/** Distance between two points. */
export function pointDistance(p1: SpatialRoadPoint, p2: SpatialRoadPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total polyline length along all segments in meters. */
export function calculatePolylineLength(points: SpatialRoadPoint[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += pointDistance(points[i], points[i + 1]);
  }
  return length;
}

/** Find closest point on line segment p1->p2 to point p. */
export function closestPointOnSegment(
  p: SpatialRoadPoint,
  p1: SpatialRoadPoint,
  p2: SpatialRoadPoint
): { point: SpatialRoadPoint; t: number; distance: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const dist = pointDistance(p, p1);
    return { point: { ...p1 }, t: 0, distance: dist };
  }

  let t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projPoint: SpatialRoadPoint = {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };

  return {
    point: projPoint,
    t,
    distance: pointDistance(p, projPoint),
  };
}

/**
 * Split a spatial road into two separate roads at a given vertex index.
 */
export function splitRoadAtIndex(
  road: SpatialRoad,
  index: number
): [SpatialRoad, SpatialRoad] | null {
  if (index <= 0 || index >= road.points.length - 1) return null;

  const points1 = road.points.slice(0, index + 1);
  const points2 = road.points.slice(index);

  const road1: SpatialRoad = {
    ...road,
    id: `${road.id}_a_${Date.now()}`,
    points: points1,
  };

  const road2: SpatialRoad = {
    ...road,
    id: `${road.id}_b_${Date.now()}`,
    points: points2,
  };

  return [road1, road2];
}

/**
 * Split a spatial road by inserting a new point along the segment closest to target point p.
 */
export function insertNodeIntoRoad(
  road: SpatialRoad,
  p: SpatialRoadPoint,
  maxDistanceThreshold: number = 2.0
): SpatialRoad | null {
  if (road.points.length < 2) return null;

  let bestSegmentIndex = -1;
  let bestDistance = Infinity;
  let bestPoint: SpatialRoadPoint = p;

  for (let i = 0; i < road.points.length - 1; i++) {
    const res = closestPointOnSegment(p, road.points[i], road.points[i + 1]);
    if (res.distance < bestDistance && res.distance <= maxDistanceThreshold) {
      bestDistance = res.distance;
      bestSegmentIndex = i;
      bestPoint = res.point;
    }
  }

  if (bestSegmentIndex === -1) return null;

  const newPoints = [...road.points];
  newPoints.splice(bestSegmentIndex + 1, 0, bestPoint);

  return {
    ...road,
    points: newPoints,
  };
}

/**
 * Rasterize freeform road geometry into tile coordinates ("x,y" -> tileType).
 * Converts meters coordinates to tile grid space (1 tile cell = meterScale meters).
 */
export function rasterizeFreeformRoadsToTiles(
  roads: SpatialRoad[],
  meterScale: number = 10.0
): Map<string, number> {
  const tileMap = new Map<string, number>();

  for (const road of roads) {
    if (road.points.length < 1) continue;
    const thicknessInCells = Math.max(1, Math.round(road.width / meterScale));

    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i];
      const p2 = road.points[i + 1];

      // Convert meter coords to float cell coords
      const gx1 = p1.x / meterScale;
      const gy1 = p1.y / meterScale;
      const gx2 = p2.x / meterScale;
      const gy2 = p2.y / meterScale;

      const dist = Math.sqrt((gx2 - gx1) ** 2 + (gy2 - gy1) ** 2);
      const steps = Math.max(1, Math.ceil(dist * 4));

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const fx = gx1 + (gx2 - gx1) * t;
        const fy = gy1 + (gy2 - gy1) * t;

        const cx = Math.floor(fx);
        const cy = Math.floor(fy);

        for (let dx = 0; dx < thicknessInCells; dx++) {
          for (let dy = 0; dy < thicknessInCells; dy++) {
            const key = `${cx + dx},${cy + dy}`;
            tileMap.set(key, road.type);
          }
        }
      }
    }
  }

  return tileMap;
}

/**
 * Rotate all polyline points of a road around its centroid by `deg` degrees.
 */
export function rotateRoadAroundCenter(road: SpatialRoad, deg: number): SpatialRoad {
  if (!road.points || road.points.length === 0) return road;

  let sumX = 0;
  let sumY = 0;
  for (const pt of road.points) {
    sumX += pt.x;
    sumY += pt.y;
  }
  const cx = sumX / road.points.length;
  const cy = sumY / road.points.length;

  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const newPoints = road.points.map((pt) => {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
      z: pt.z,
    };
  });

  return {
    ...road,
    points: newPoints,
  };
}

