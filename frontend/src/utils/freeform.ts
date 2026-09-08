/**
 * Freeform Spatial Canvas Utilities (1 WebGL unit = 1 meter).
 *
 * Provides seamless state translation from the discrete integer-based grid
 * drafting phase into continuous floating-point (x, 0, z) vectors, with real-world
 * meter footprint area computations for backend urban scoring.
 */

import type { GridState, TileObject } from "../types/city";
import type { SpatialZone } from "../types/spatial";
import { zoneCoveredCells } from "./spatial";

/** Default tile scale: 1 grid cell = 10 meters × 10 meters in real-world space. */
export const DEFAULT_TILE_METER_SIZE = 10.0;

export interface FreeformVector3 {
  x: number;
  y: number;
  z: number;
}

export interface FreeformFootprint {
  width: number;
  depth: number;
}

export interface FreeformZoneMesh {
  id: string;
  type: number;
  position: FreeformVector3;
  rotation: number; // Yaw rotation around Y axis in degrees
  footprint: FreeformFootprint;
  area: number; // width * depth in sq meters
  model_url?: string;
  attributes?: SpatialZone["attributes"];
}

/**
 * Physical footprint area in square meters.
 */
export function calculatePhysicalFootprint(footprint: { width: number; depth: number }): number {
  return Math.max(0.01, footprint.width * footprint.depth);
}

function isRoadTileType(type: number): boolean {
  return type === 4 || type === 40 || type === 41 || type === 42 || type === 43;
}

/**
 * State Translation Function:
 * Parses existing grid state (tiles + zones) and converts integer x,y coordinates
 * into continuous floating-point (x, 0, z) 3D vectors scaled to real-world meter dimensions.
 * Road tiles are excluded as roads render as polylines/surfaces.
 *
 * @param tiles Discrete integer grid state Map ("x,y" -> TileObject)
 * @param zones Optional array of SpatialZones from drafting phase
 * @param meterScale Meter scale factor per grid cell (default 10.0 meters per cell)
 * @returns Array of continuous 3D FreeformZoneMesh objects
 */
export function translateGridToFreeform(
  tiles: GridState,
  zones: SpatialZone[] = [],
  meterScale: number = DEFAULT_TILE_METER_SIZE
): FreeformZoneMesh[] {
  const result: FreeformZoneMesh[] = [];

  const zoneCells = new Set<string>();
  for (const zone of zones) {
    for (const cell of zoneCoveredCells(zone)) {
      zoneCells.add(`${cell.x},${cell.y}`);
    }
  }

  // 1. Convert discrete grid building tiles (excluding road tiles and cells covered by spatial zones)
  tiles.forEach((tile: TileObject, key: string) => {
    if (isRoadTileType(tile.type)) return;
    if (zoneCells.has(key)) return;

    const [gx, gy] = key.split(",").map(Number);
    if (Number.isNaN(gx) || Number.isNaN(gy)) return;

    // Center of tile cell in WebGL 3D space: X = gx * scale + scale/2, Z = gy * scale + scale/2
    const posX = gx * meterScale + meterScale / 2;
    const posZ = gy * meterScale + meterScale / 2;
    const width = meterScale;
    const depth = meterScale;

    result.push({
      id: `mesh_tile_${gx}_${gy}`,
      type: tile.type,
      position: { x: posX, y: 0, z: posZ },
      rotation: tile.transform?.rotation?.y ?? 0,
      footprint: { width, depth },
      area: calculatePhysicalFootprint({ width, depth }),
      model_url: tile.model_url,
    });
  });

  // 2. Convert explicit SpatialZones (if any) to 3D freeform meshes
  for (const zone of zones) {
    if (isRoadTileType(zone.type)) continue;

    const posX = zone.position.x * meterScale;
    const posZ = zone.position.y * meterScale;
    const width = Math.max(0.5, zone.footprint.width * meterScale);
    const depth = Math.max(0.5, zone.footprint.depth * meterScale);

    result.push({
      // Keep the zone id verbatim so mesh id === zone id. This round-trip
      // stability is what makes Select + Delete work for zones loaded from
      // the database (prefixing here used to break the mesh→zone mapping).
      id: zone.id,
      type: zone.type,
      position: { x: posX, y: 0, z: posZ },
      rotation: zone.rotation,
      footprint: { width, depth },
      area: calculatePhysicalFootprint({ width, depth }),
      model_url: zone.attributes?.model_url,
      attributes: zone.attributes,
    });
  }

  return result;
}


/**
 * Reverse translation helper: converts freeform 3D meshes back to SpatialZone objects
 * for state manager integration and persistent storage.
 */
export function translateFreeformToZones(
  freeformMeshes: FreeformZoneMesh[],
  meterScale: number = DEFAULT_TILE_METER_SIZE
): SpatialZone[] {
  return freeformMeshes.map((mesh) => ({
    id: mesh.id,
    type: (mesh.type as 1 | 2 | 3 | 5) ?? 1,
    position: {
      x: mesh.position.x / meterScale,
      y: mesh.position.z / meterScale,
    },
    rotation: mesh.rotation,
    footprint: {
      width: mesh.footprint.width / meterScale,
      depth: mesh.footprint.depth / meterScale,
    },
    attributes: {
      ...mesh.attributes,
      model_url: mesh.model_url ?? mesh.attributes?.model_url,
    },
  }));
}

