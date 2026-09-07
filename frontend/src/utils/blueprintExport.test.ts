import { describe, it, expect, vi } from "vitest";
import { exportArchitecturalBlueprint } from "./blueprintExport";
import type { GridState } from "../types/city";
import type { SpatialZone, SpatialRoad } from "../types/spatial";

describe("blueprintExport", () => {
  it("generates a blueprint and triggers download when document is available", () => {
    const tiles: GridState = new Map([
      ["0,0", { type: 1 }],
      ["0,1", { type: 4 }],
      ["1,0", { type: 2 }],
    ]);

    const zones: SpatialZone[] = [
      {
        id: "z1",
        type: 1,
        position: { x: 5, y: 5 },
        rotation: 0,
        footprint: { width: 10, depth: 10 },
        attributes: {},
      },
    ];

    const roads: SpatialRoad[] = [
      {
        id: "r1",
        type: 41,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        width: 12,
      },
    ];

    const terrain = new Map([["0,0", 15]]);

    const clickMock = vi.fn();
    const mockCtx = {
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      arc: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      closePath: vi.fn(),
      setLineDash: vi.fn(),
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockCtx,
      toDataURL: () => "data:image/png;base64,mock",
    };

    const mockAnchor = {
      download: "",
      href: "",
      click: clickMock,
    };

    const mockDoc = {
      createElement: (tag: string) => {
        if (tag === "canvas") return mockCanvas;
        if (tag === "a") return mockAnchor;
        return {};
      },
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };

    (globalThis as any).document = mockDoc;

    expect(() => {
      exportArchitecturalBlueprint({
        cityName: "Neo Tokyo",
        tiles,
        zones,
        roads,
        terrain,
        scores: { livability: 88, traffic: 79, resources: 92 },
      });
    }).not.toThrow();

    expect(clickMock).toHaveBeenCalled();
    expect(mockAnchor.download).toBe("neo_tokyo_architectural_blueprint.png");

    delete (globalThis as any).document;
  });

  it("handles environment without document gracefully", () => {
    expect(() => {
      exportArchitecturalBlueprint({
        cityName: "Void",
        tiles: new Map(),
      });
    }).not.toThrow();
  });
});

