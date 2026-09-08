import { describe, it, expect, vi } from "vitest";
import { exportArchitecturalBlueprint, filterBlueprintLabels, type BlueprintLabel } from "./blueprintExport";
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
      translate: vi.fn(),
      rotate: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
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

  describe("filterBlueprintLabels", () => {
    it("preserves all labels when at a single point there are 5 or fewer labels", () => {
      const labels: BlueprintLabel[] = [
        { id: "1", x: 0, y: 0, localEffect: 25, category: "tile", type: 1, render: vi.fn() },
        { id: "2", x: 0.5, y: 0.5, localEffect: 30, category: "tile", type: 2, render: vi.fn() },
        { id: "3", x: 1, y: 0.5, localEffect: 20, category: "tile", type: 3, render: vi.fn() },
        { id: "4", x: 0.5, y: 1, localEffect: 45, category: "road_node", type: 41, render: vi.fn() },
      ];

      const result = filterBlueprintLabels(labels, 3.2);
      expect(result).toHaveLength(4);
    });

    it("filters to the single label with highest local effect when more than 5 labels are present at a point", () => {
      const labels: BlueprintLabel[] = [
        { id: "r1", x: 0, y: 0, localEffect: 25, category: "tile", type: 1, render: vi.fn() },
        { id: "r2", x: 0.2, y: 0.1, localEffect: 25, category: "tile", type: 1, render: vi.fn() },
        { id: "r3", x: 0.5, y: 0.3, localEffect: 25, category: "tile", type: 1, render: vi.fn() },
        { id: "r4", x: -0.2, y: 0.4, localEffect: 25, category: "tile", type: 1, render: vi.fn() },
        { id: "r5", x: 0.1, y: -0.3, localEffect: 25, category: "tile", type: 1, render: vi.fn() },
        { id: "r6", x: 0.4, y: -0.2, localEffect: 25, category: "tile", type: 1, render: vi.fn() },
        { id: "hwy_node", x: 0.1, y: 0.1, localEffect: 95, category: "road_node", type: 43, render: vi.fn() },
      ];

      // 7 labels within radius 3.2 of each other (> 5)
      const result = filterBlueprintLabels(labels, 3.2);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("hwy_node");
      expect(result[0].localEffect).toBe(95);
    });

    it("evaluates multiple separated clusters independently", () => {
      const clusterA: BlueprintLabel[] = [
        { id: "a1", x: 0, y: 0, localEffect: 20, category: "tile", type: 1, render: vi.fn() },
        { id: "a2", x: 0.2, y: 0.1, localEffect: 20, category: "tile", type: 1, render: vi.fn() },
        { id: "a3", x: 0.3, y: 0.2, localEffect: 20, category: "tile", type: 1, render: vi.fn() },
        { id: "a4", x: -0.1, y: 0.3, localEffect: 20, category: "tile", type: 1, render: vi.fn() },
        { id: "a5", x: 0.2, y: -0.1, localEffect: 20, category: "tile", type: 1, render: vi.fn() },
        { id: "a_hub", x: 0, y: 0.1, localEffect: 80, category: "zone", type: 2, render: vi.fn() },
      ];

      const clusterB: BlueprintLabel[] = [
        { id: "b1", x: 50, y: 50, localEffect: 15, category: "tile", type: 3, render: vi.fn() },
        { id: "b2", x: 50.2, y: 50.1, localEffect: 15, category: "tile", type: 3, render: vi.fn() },
        { id: "b3", x: 50.4, y: 50.2, localEffect: 15, category: "tile", type: 3, render: vi.fn() },
        { id: "b4", x: 49.8, y: 50.3, localEffect: 15, category: "tile", type: 3, render: vi.fn() },
        { id: "b5", x: 50.1, y: 49.9, localEffect: 15, category: "tile", type: 3, render: vi.fn() },
        { id: "b_hwy", x: 50, y: 50, localEffect: 95, category: "road_node", type: 43, render: vi.fn() },
      ];

      const result = filterBlueprintLabels([...clusterA, ...clusterB], 3.2);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id).sort()).toEqual(["a_hub", "b_hwy"].sort());
    });
  });
});

