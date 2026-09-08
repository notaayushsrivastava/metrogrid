/** Tests for screen → grid conversion and snap-to-grid (PRD §25.2 #1-2). */

import { describe, expect, it } from "vitest";
import {
  cellSize,
  cellToScreenPx,
  screenToGrid,
  clampZoom,
  panBy,
  zoomAt,
  visibleGridBounds,
  MIN_ZOOM,
  MAX_ZOOM,
  type Camera,
  type GridBounds,
} from "./coordinates";

const BASE_CAMERA: Camera = {
  offsetX: 100,
  offsetY: 50,
  zoom: 1,
  tileSize: 20,
};

// A fake canvas bounding rect (as produced by getBoundingClientRect()).
const RECT = { left: 10, top: 20, width: 600, height: 500 };

describe("cellSize", () => {
  it("scales tile size by zoom", () => {
    expect(cellSize(BASE_CAMERA)).toBe(20);
    expect(cellSize({ ...BASE_CAMERA, zoom: 2 })).toBe(40);
  });
});

describe("cellToScreenPx", () => {
  it("maps grid coordinates to board-relative pixels", () => {
    expect(cellToScreenPx(BASE_CAMERA, 0, 0)).toEqual({ px: 100, py: 50 });
    expect(cellToScreenPx(BASE_CAMERA, 3, 2)).toEqual({ px: 160, py: 90 });
  });
});

describe("screenToGrid", () => {
  it("uses getBoundingClientRect offsets (PRD §14.1)", () => {
    // Board origin sits at viewport (110, 70) given rect left/top.
    const cell = screenToGrid(RECT, 110, 70, BASE_CAMERA);
    expect(cell).toEqual({ x: 0, y: 0 });
  });

  it("snaps pointer positions to integer grid cells", () => {
    // Within cell (2,1): board origin (110,70) + 2*20..3*20 x, 1*20..2*20 y.
    expect(screenToGrid(RECT, 152, 92, BASE_CAMERA)).toEqual({ x: 2, y: 1 });
    // Border rounding snaps downward-left.
    expect(screenToGrid(RECT, 149.9, 89.9, BASE_CAMERA)).toEqual({ x: 1, y: 0 });
  });

  it("respects camera offset", () => {
    const camera: Camera = { offsetX: 0, offsetY: 0, zoom: 1, tileSize: 20 };
    // Pointer viewport position: (45-10, 65-20) = (35, 45) → cells (1, 2).
    expect(screenToGrid(RECT, 45, 65, camera)).toEqual({ x: 1, y: 2 });
  });

  it("returns null outside the canvas rect", () => {
    expect(screenToGrid(RECT, 5, 5, BASE_CAMERA)).toBeNull(); // left of rect
    expect(screenToGrid(RECT, 700, 100, BASE_CAMERA)).toBeNull(); // right of rect
    expect(screenToGrid(RECT, 300, -1, BASE_CAMERA)).toBeNull(); // above rect
  });

  it("floors negative world positions rather than rounding toward zero", () => {
    // Pointer left of the board origin must not snap to cell 0.
    // px = 40 → world x = (40-100)/20 = -3; py = 30 → world y = -3.5 → -4.
    const camera: Camera = { offsetX: 100, offsetY: 100, zoom: 1, tileSize: 20 };
    expect(screenToGrid(RECT, 50, 50, camera)).toEqual({ x: -3, y: -4 });
  });
});

describe("clampZoom", () => {
  it("clamps to MIN_ZOOM/MAX_ZOOM", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(5)).toBe(MAX_ZOOM);
    expect(clampZoom(0.3)).toBe(0.3);
  });
});

describe("panBy", () => {
  it("shifts the camera offset by screen pixels", () => {
    expect(panBy(BASE_CAMERA, 30, -10)).toEqual({ ...BASE_CAMERA, offsetX: 130, offsetY: 40 });
  });
});

describe("zoomAt", () => {
  it("keeps the world point under (px,py) anchored", () => {
    // Focus on cell (3,2): its screen center at zoom 1 = (160, 90).
    const zoomed = zoomAt(BASE_CAMERA, 160, 90, 2);
    expect(zoomed.zoom).toBeCloseTo(2);
    // The same world cell center must now sit at (160, 90).
    const { px, py } = cellToScreenPx(zoomed, 3, 2);
    expect(px).toBeCloseTo(160);
    expect(py).toBeCloseTo(90);
  });

  it("clamps zoom and leaves camera unchanged at bounds", () => {
    const atMax = zoomAt({ ...BASE_CAMERA, zoom: MAX_ZOOM }, 0, 0, 2);
    expect(atMax).toEqual({ ...BASE_CAMERA, zoom: MAX_ZOOM });
  });
});

describe("visibleGridBounds", () => {
  it("computes the visible cell rectangle from the camera (PRD §6.1)", () => {
    const bounds: GridBounds = visibleGridBounds(
      { offsetX: 0, offsetY: 0, zoom: 1, tileSize: 20 },
      600,
      500,
      1
    );
    // x from -1 (margin, floor((0-0)/20)-1) to 31 (ceil(600/20)+1)
    expect(bounds.min_x).toBe(-1);
    expect(bounds.max_x).toBe(31);
    expect(bounds.min_y).toBe(-1);
    expect(bounds.max_y).toBe(26);
  });

  it("accounts for camera offset", () => {
    const bounds = visibleGridBounds(BASE_CAMERA, 600, 500, 0);
    // Left edge: (0 - 100)/20 = -5; right edge (600-100)/20 = 25.
    expect(bounds.min_x).toBe(-5);
    expect(bounds.max_x).toBe(25);
  });
});
