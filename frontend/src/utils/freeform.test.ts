import { describe, expect, it } from "vitest";
import {
  calculatePhysicalFootprint,
  translateGridToFreeform,
  translateFreeformToZones,
  DEFAULT_TILE_METER_SIZE,
} from "./freeform";
import type { GridState } from "../types/city";
import type { SpatialZone } from "../types/spatial";

describe("freeform utilities", () => {
  it("calculates physical footprint in square meters correctly", () => {
    expect(calculatePhysicalFootprint({ width: 10, depth: 10 })).toBe(100);
    expect(calculatePhysicalFootprint({ width: 3, depth: 4 })).toBe(12);
  });

  it("translates integer grid tiles into continuous 3D floating-point vectors", () => {
    const tiles: GridState = new Map([
      ["0,0", { type: 1 }],
      ["2,5", { type: 2 }],
    ]);

    const meshes = translateGridToFreeform(tiles, [], 10.0);
    expect(meshes.length).toBe(2);

    const mesh0 = meshes.find((m) => m.id === "mesh_tile_0_0");
    expect(mesh0).toBeDefined();
    expect(mesh0?.position).toEqual({ x: 5, y: 0, z: 5 });
    expect(mesh0?.footprint).toEqual({ width: 10, depth: 10 });
    expect(mesh0?.area).toBe(100);

    const mesh1 = meshes.find((m) => m.id === "mesh_tile_2_5");
    expect(mesh1).toBeDefined();
    expect(mesh1?.position).toEqual({ x: 25, y: 0, z: 55 });
  });

  it("translates explicit SpatialZones into 3D freeform meshes", () => {
    const zones: SpatialZone[] = [
      {
        id: "z1",
        type: 3,
        position: { x: 1.5, y: 2.5 },
        rotation: 45,
        footprint: { width: 3, depth: 3 },
        attributes: {},
      },
    ];

    const meshes = translateGridToFreeform(new Map(), zones, 10.0);
    expect(meshes.length).toBe(1);
    expect(meshes[0].position).toEqual({ x: 15, y: 0, z: 25 });
    expect(meshes[0].footprint).toEqual({ width: 30, depth: 30 });
    expect(meshes[0].area).toBe(900);
    expect(meshes[0].rotation).toBe(45);
  });

  it("keeps zone ids stable so DB-loaded zones can be selected and deleted", () => {
    // Regression: zones loaded from Supabase have non-"mesh_" ids; prefixing
    // them broke the mesh→zone mapping so Delete was a silent no-op.
    const zones: SpatialZone[] = [
      {
        id: "zone-db-123",
        type: 1,
        position: { x: 0, y: 0 },
        rotation: 0,
        footprint: { width: 2, depth: 2 },
        attributes: {},
      },
    ];

    const meshes = translateGridToFreeform(new Map(), zones, 10.0);
    expect(meshes[0].id).toBe("zone-db-123");

    // Round-trip: mesh → zone must preserve the original id.
    const back = translateFreeformToZones(meshes);
    expect(back[0].id).toBe("zone-db-123");
  });

  it("round-trips freeform meshes back to SpatialZone objects", () => {
    const originalMeshes = [
      {
        id: "mesh_z1",
        type: 1,
        position: { x: 20, y: 0, z: 30 },
        rotation: 0,
        footprint: { width: 10, depth: 10 },
        area: 100,
      },
    ];

    const zones = translateFreeformToZones(originalMeshes, DEFAULT_TILE_METER_SIZE);
    expect(zones[0].position).toEqual({ x: 2, y: 3 });
    expect(zones[0].footprint).toEqual({ width: 1, depth: 1 });
  });
});
