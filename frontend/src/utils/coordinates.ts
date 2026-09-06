/**
 * Screen ↔ grid coordinate conversion (PRD §14.1).
 *
 * `screenToGrid` is pure and takes the canvas bounding rect as an argument;
 * callers obtain the rect via `canvas.getBoundingClientRect()` — exactly as
 * the PRD mandates. The camera abstraction (offset/zoom/tile size) keeps the
 * conversion correct for the Phase 2 pan/zoom viewport without changes here.
 */

export interface Camera {
  /** World-space pixel offset of the canvas origin. */
  offsetX: number;
  offsetY: number;
  /** Zoom multiplier (1 = base tile size). */
  zoom: number;
  /** Base tile size in CSS pixels. */
  tileSize: number;
}

export interface GridPoint {
  x: number;
  y: number;
}

export function cellSize(camera: Camera): number {
  return camera.tileSize * camera.zoom;
}

/** Grid origin (top-left of cell [0,0]) in screen space. */
export function gridOriginPx(camera: Camera): { px: number; py: number } {
  return { px: camera.offsetX, py: camera.offsetY };
}

/** Top-left screen position of a grid cell. */
export function cellToScreenPx(
  camera: Camera,
  x: number,
  y: number
): { px: number; py: number } {
  const size = cellSize(camera);
  return { px: camera.offsetX + x * size, py: camera.offsetY + y * size };
}

/**
 * Convert pointer coordinates (relative to the viewport) into integer grid
 * coordinates via snap-to-grid. Returns null when the pointer lies outside
 * the rect. Out-of-bounds grid values are the caller's concern.
 */
export function screenToGrid(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  camera: Camera
): GridPoint | null {
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) {
    return null;
  }
  const size = cellSize(camera);
  const worldX = (px - camera.offsetX) / size;
  const worldY = (py - camera.offsetY) / size;
  return {
    x: Math.floor(worldX),
    y: Math.floor(worldY),
  };
}
