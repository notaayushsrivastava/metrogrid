/**
 * Screen ↔ grid coordinate conversion and the Phase 2 camera (PRD §6.1, §14.1).
 *
 * `screenToGrid` is pure and takes the canvas bounding rect as an argument;
 * callers obtain the rect via `canvas.getBoundingClientRect()` — exactly as
 * the PRD mandates. The camera (origin offset + zoom) supports panning and
 * zooming across the full signed 32-bit coordinate space.
 */

export interface Camera {
  /** Screen-space position of grid origin (top-left of cell [0,0]). */
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

/** Visible active bounds (PRD §6.1, §12.1). */
export interface GridBounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 3;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function cellSize(camera: Camera): number {
  return camera.tileSize * camera.zoom;
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
 * the rect. Works for any signed cell — including negative coordinates.
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

/** Pan the camera by a screen-pixel delta. */
export function panBy(camera: Camera, dxPx: number, dyPx: number): Camera {
  return { ...camera, offsetX: camera.offsetX + dxPx, offsetY: camera.offsetY + dyPx };
}

/**
 * Zoom by `factor`, keeping the world point under screen position
 * (px, py) visually anchored at the cursor (standard zoom-at-cursor).
 */
export function zoomAt(camera: Camera, px: number, py: number, factor: number): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  if (zoom === camera.zoom) return camera;
  const scale = zoom / camera.zoom;
  return {
    ...camera,
    zoom,
    offsetX: px - (px - camera.offsetX) * scale,
    offsetY: py - (py - camera.offsetY) * scale,
  };
}

/**
 * Active bounds of the visible viewport (PRD §6.1): the grid rectangle
 * intersecting the canvas, expanded by `margin` cells on every side.
 * Computed from the camera — never from a materialized matrix.
 */
export function visibleGridBounds(
  camera: Camera,
  width: number,
  height: number,
  margin = 1
): GridBounds {
  const size = cellSize(camera);
  const min_x = Math.floor((0 - camera.offsetX) / size) - margin;
  const max_x = Math.floor((width - camera.offsetX) / size) + margin;
  const min_y = Math.floor((0 - camera.offsetY) / size) - margin;
  const max_y = Math.floor((height - camera.offsetY) / size) + margin;
  return { min_x, max_x, min_y, max_y };
}

