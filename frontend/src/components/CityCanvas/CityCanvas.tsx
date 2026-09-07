/**
 * CityCanvas — native HTML5 canvas renderer over the unbounded sparse grid
 * (PRD §6, §14; Phase 2). No Fabric.js/PixiJS (§4.1).
 *
 * Capabilities:
 * - Pan (middle/right drag, Space+drag, Select tool drag, two-finger touch)
 * - Zoom at cursor (wheel, pinch, on-canvas zoom controls)
 * - Chunked viewport culling — only visible chunks are drawn (PRD §6.2-6.3)
 * - Paint-drag placement for zone/road tools
 * - Visible active bounds reported to the scoring loop (PRD §6.1)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BASE_TILE, DEFAULT_VIEW_SPAN, TILE_META } from "../../config/tiles";
import { tileKey } from "../../state/cityState";
import type { Feedback, GridState, TileType } from "../../types/city";
import cityEmptyUrl from "../../assets/city-empty.png";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  cellSize,
  cellToScreenPx,
  clampZoom,
  panBy,
  screenToGrid,
  visibleGridBounds,
  zoomAt,
  type Camera,
  type GridBounds,
  type GridPoint,
} from "../../utils/coordinates";
import { buildChunkIndex, chunkKeysInBounds } from "../../utils/chunks";
import type { SpatialZone } from "../../types/spatial";
import { SpatialCanvas } from "./SpatialCanvas";

interface CityCanvasProps {
  tiles: GridState;
  toolActive: boolean;
  /** Outline color for the hovered cell (tool-dependent non-color cue). */
  hoverColor: string;
  feedbacks: Feedback[];
  onPlace: (x: number, y: number) => void;
  onHoverChange?: (cell: GridPoint | null) => void;
  onBoundsChange?: (bounds: GridBounds) => void;
  /* Phase 5 (Day 2): freeform spatial overlay. Omit to disable freeform. */
  zones?: SpatialZone[];
  roads?: import("../../types/spatial").SpatialRoad[];
  terrain?: Map<string, number>;
  terrainMode?: import("../../types/spatial").TerrainEditMode;
  terrainRadius?: number;
  terrainStrength?: number;
  onEditTerrain?: (center: { x: number; y: number }, mode: import("../../types/spatial").TerrainEditMode, radius: number, strength: number) => void;
  freeformMode?: boolean;
  selectedZoneId?: string | null;
  selectedRoadId?: string | null;
  onAddZone?: (world: { x: number; y: number }) => void;
  onSelectZone?: (id: string | null) => void;
  onMoveZone?: (id: string, world: { x: number; y: number }) => void;
  onRotateZone?: (id: string, deg: number) => void;
  onResizeZone?: (zone: SpatialZone, corner: number, world: { x: number; y: number }) => void;
  onGestureStart?: () => void;
  onCommitZones?: () => void;
  onRemoveZone?: (id: string) => void;

  /* Phase 6 (Day 2): freeform roads */
  onAddRoad?: (road: import("../../types/spatial").SpatialRoad) => void;
  onSelectRoad?: (id: string | null) => void;
  onUpdateRoad?: (road: import("../../types/spatial").SpatialRoad) => void;
  onRemoveRoad?: (id: string) => void;
  activeTool?: string;
}

interface Viewport {
  width: number;
  height: number;
}

export const METRIC_LABEL: Record<string, string> = {
  livability: "Livability",
  traffic: "Traffic",
  resources: "Resources",
};

function isRoadType(type: TileType): boolean {
  return type === 4 || type === 40 || type === 41 || type === 42 || type === 43;
}

/**
 * Center and zoom the view so all placed tiles (and the origin) fit.
 * Used at startup and by the reset-view control.
 */
function fitCamera(
  tiles: GridState,
  viewport: Viewport,
  zones?: SpatialZone[],
  roads?: import("../../types/spatial").SpatialRoad[]
): Camera {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let has = false;

  const includePoint = (x: number, y: number) => {
    if (!has) {
      minX = maxX = x;
      minY = maxY = y;
      has = true;
      return;
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  tiles.forEach((_tile, key) => {
    const [x, y] = key.split(",").map(Number);
    includePoint(x, y);
  });

  if (zones) {
    zones.forEach((z) => {
      includePoint(z.position.x, z.position.y);
    });
  }

  if (roads) {
    roads.forEach((r) => {
      r.points.forEach((p) => {
        includePoint(p.x, p.y);
      });
    });
  }

  const spanX = Math.max(DEFAULT_VIEW_SPAN / 2, maxX - minX + 1);
  const spanY = Math.max(DEFAULT_VIEW_SPAN / 2, maxY - minY + 1);
  const zoom = clampZoom(
    Math.min(viewport.width, viewport.height) / (BASE_TILE * Math.max(spanX, spanY))
  );
  const cell = BASE_TILE * zoom;
  const centerX = (minX + maxX + 1) / 2;
  const centerY = (minY + maxY + 1) / 2;
  return {
    offsetX: viewport.width / 2 - centerX * cell,
    offsetY: viewport.height / 2 - centerY * cell,
    zoom,
    tileSize: BASE_TILE,
  };
}

/** Draws a single tile at its screen position with animated traffic flow. */
function drawTileWithTraffic(
  ctx: CanvasRenderingContext2D,
  tiles: GridState,
  type: TileType,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number,
  rotationDeg = 0,
  trafficOffset = 0
): void {
  const meta = TILE_META[type as Exclude<TileType, 0>];
  const inset = 1;
  const s = size - inset * 2;
  const r = Math.max(2, Math.floor(size * 0.12));

  const rotated = rotationDeg !== 0;
  if (rotated) {
    ctx.save();
    ctx.translate(px + size / 2, py + size / 2);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.translate(-(px + size / 2), -(py + size / 2));
  }

  ctx.beginPath();
  ctx.roundRect(px + inset, py + inset, s, s, r);
  ctx.fillStyle = meta.color;
  ctx.fill();

  if (isRoadType(type)) {
    const cx = px + size / 2;
    const cy = py + size / 2;

    // Base road connector stripe
    ctx.strokeStyle = type === 43 ? "#ffd166" : meta.ink;
    ctx.lineWidth = type === 43 ? Math.max(2, size * 0.12) : Math.max(1.5, size * 0.08);
    ctx.setLineDash(type === 40 ? [size * 0.12, size * 0.2] : [size * 0.28, size * 0.22]);

    const neighbors: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      const n = tiles.get(tileKey(nx, ny));
      if (n && isRoadType(n.type)) {
        const dx = nx - x;
        const dy = ny - y;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * (size / 2), cy + dy * (size / 2));
        ctx.stroke();

        if (type === 42) {
          const ox = dy * (size * 0.09);
          const oy = dx * (size * 0.09);
          ctx.beginPath();
          ctx.moveTo(cx + ox, cy + oy);
          ctx.lineTo(cx + dx * (size / 2) + ox, cy + dy * (size / 2) + oy);
          ctx.stroke();
        }
      }
    }

    // Landing Screen-style Animated Traffic Movement
    ctx.strokeStyle = type === 43 ? "#ffd166" : "#7cffb2";
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.setLineDash([size * 0.16, size * 0.26]);
    ctx.lineDashOffset = -trafficOffset;

    for (const [nx, ny] of neighbors) {
      const n = tiles.get(tileKey(nx, ny));
      if (n && isRoadType(n.type)) {
        const dx = nx - x;
        const dy = ny - y;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * (size / 2), cy + dy * (size / 2));
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    if (rotated) ctx.restore();
    return;
  }

  // Zone glyph
  ctx.fillStyle = meta.ink;
  ctx.font = `700 ${Math.floor(size * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(meta.glyph, px + size / 2, py + size / 2 + 1);
  if (rotated) ctx.restore();
}


/** Draw grid lines across the full visible viewport (line in-fill for culling). */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number
): void {
  const size = cellSize(camera);
  const fromX = Math.floor((0 - camera.offsetX) / size);
  const toX = Math.ceil((width - camera.offsetX) / size);
  const fromY = Math.floor((0 - camera.offsetY) / size);
  const toY = Math.ceil((height - camera.offsetY) / size);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ix0 = Math.max(fromX, -1050000000);
  const ix1 = Math.min(toX, 1050000000);
  for (let x = ix0; x <= ix1; x++) {
    const gx = Math.round(camera.offsetX + x * size) + 0.5;
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
  }
  const iy0 = Math.max(fromY, -1050000000);
  const iy1 = Math.min(toY, 1050000000);
  for (let y = iy0; y <= iy1; y++) {
    const gy = Math.round(camera.offsetY + y * size) + 0.5;
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
  }
  ctx.stroke();
}

export function CityCanvas({
  tiles,
  toolActive,
  hoverColor,
  feedbacks,
  onPlace,
  onHoverChange,
  onBoundsChange,
  zones,
  roads,
  terrain,
  terrainMode,
  terrainRadius,
  terrainStrength,
  onEditTerrain,
  freeformMode,
  selectedZoneId,
  selectedRoadId,
  onAddZone,
  onSelectZone,
  onMoveZone,
  onRotateZone,
  onResizeZone,
  onGestureStart,
  onCommitZones,
  onRemoveZone,
  onAddRoad,
  onSelectRoad,
  onUpdateRoad,
  onRemoveRoad,
  activeTool,
}: CityCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera | null>(null);
  const [hover, setHover] = useState<GridPoint | null>(null);
  const [cursor, setCursor] = useState("grab");

  const dragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    placed: Set<string>;
    mode: "pan" | "paint" | "rect";
  } | null>(null);
  const rectStartRef = useRef<GridPoint | null>(null);
  const hoverRef = useRef<GridPoint | null>(hover);
  hoverRef.current = hover;
  const spaceRef = useRef(false);
  const pinchRef = useRef<{ dist: number; camera: Camera } | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const toolActiveRef = useRef(toolActive);
  toolActiveRef.current = toolActive;
  const cameraRef = useRef<Camera | null>(null);
  cameraRef.current = camera;
  const onBoundsRef = useRef(onBoundsChange);
  onBoundsRef.current = onBoundsChange;

  // Track container size for a responsive canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Initialize camera once the viewport is known.
  useEffect(() => {
    if (!camera && viewport.width > 0 && viewport.height > 0) {
      setCamera(fitCamera(tiles, viewport, zones, roads));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  // Report + cache active bounds whenever the camera or viewport changes.
  useEffect(() => {
    if (!camera || viewport.width === 0) return;
    const bounds = visibleGridBounds(camera, viewport.width, viewport.height, 1);
    onBoundsRef.current?.(bounds);
  }, [camera, viewport]);

  const size = camera ? cellSize(camera) : BASE_TILE;

  // Chunk index + visible chunk keys for viewport culling (PRD §6.2-6.3).
  const chunkIndex = useMemo(() => buildChunkIndex(tiles), [tiles]);
  const visibleChunkKeys = useMemo(() => {
    if (!camera) return [] as string[];
    const bounds = visibleGridBounds(camera, viewport.width, viewport.height, 1);
    return chunkKeysInBounds(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, viewport]);

  // Draw runs directly on camera/tiles changes (no React reconciliation).
  const draw = useCallback((trafficOffset: number = 0) => {
    const canvas = canvasRef.current;
    const cam = cameraRef.current;
    if (!canvas || !cam || viewportRef.current.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.floor(viewportRef.current.width);
    const cssHeight = Math.floor(viewportRef.current.height);
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Origin axes hint.
    const origin = cellToScreenPx(cam, 0, 0);
    ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
    ctx.fillRect(origin.px - 1, origin.py - 6, 2, 12);
    ctx.fillRect(origin.px - 6, origin.py - 1, 12, 2);

    drawGrid(ctx, cam, cssWidth, cssHeight);

    // Chunked viewport culling: only tiles in visible chunks are painted.
    const cell = cellSize(cam);
    for (const chunkKey of visibleChunkKeys) {
      const entries = chunkIndex.get(chunkKey);
      if (!entries) continue;
      for (const entry of entries) {
        const { px, py } = cellToScreenPx(cam, entry.x, entry.y);
        if (px + cell < 0 || px > cssWidth || py + cell < 0 || py > cssHeight) {
          continue; // per-tile cull within the chunk's margin
        }
        drawTileWithTraffic(
          ctx,
          tiles,
          entry.type,
          entry.x,
          entry.y,
          px,
          py,
          cell,
          entry.tile?.transform?.rotation?.y ?? 0,
          trafficOffset
        );
      }
    }

    // Draw Ctrl+Drag Rectangle Selection Preview
    const drag = dragRef.current;
    if (drag && drag.mode === "rect" && rectStartRef.current && hoverRef.current) {
      const p1 = rectStartRef.current;
      const p2 = hoverRef.current;
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      const cell = cellSize(cam);
      const { px: rx, py: ry } = cellToScreenPx(cam, minX, minY);
      const rectWidth = (maxX - minX + 1) * cell;
      const rectHeight = (maxY - minY + 1) * cell;

      ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
      ctx.fillRect(rx, ry, rectWidth, rectHeight);
      ctx.strokeStyle = hoverColor || "#38bdf8";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rx + 1, ry + 1, rectWidth - 2, rectHeight - 2);
      ctx.setLineDash([]);
    }

    if (hover && toolActiveRef.current) {
      const { px, py } = cellToScreenPx(cam, hover.x, hover.y);
      ctx.strokeStyle = hoverColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px + 1.5, py + 1.5, size - 3, size - 3, 4);
      ctx.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkIndex, visibleChunkKeys, hover, hoverColor]);

  const animFrameRef = useRef<number>(0);
  const trafficOffsetRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    const animateLoop = (timestamp: number) => {
      trafficOffsetRef.current = (timestamp * 0.035) % 100;
      draw(trafficOffsetRef.current);
      if (active) animFrameRef.current = requestAnimationFrame(animateLoop);
    };
    animFrameRef.current = requestAnimationFrame(animateLoop);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  const pointerToGrid = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const cam = cameraRef.current;
    if (!canvas || !cam) return null;
    const rect = canvas.getBoundingClientRect(); // PRD §14.1
    return screenToGrid(rect, clientX, clientY, cam);
  }, []);

  // WASD pan + Q/E zoom keyboard controller for 2D canvas
  const keysPressed = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e"].includes(key)) {
        keysPressed.current[key] = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e"].includes(key)) {
        keysPressed.current[key] = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    let animFrame: number;
    const updateNavigation = () => {
      const keys = keysPressed.current;
      const cam = cameraRef.current;
      if (cam && viewportRef.current.width > 0) {
        const panStep = 16.0; // 16px per frame
        const moveX = (keys["d"] ? panStep : 0) - (keys["a"] ? panStep : 0);
        const moveY = (keys["w"] ? panStep : 0) - (keys["s"] ? panStep : 0);

        let nextCam = cam;
        if (moveX !== 0 || moveY !== 0) {
          nextCam = panBy(nextCam, moveX, moveY);
        }

        if (keys["q"]) {
          const centerX = viewportRef.current.width / 2;
          const centerY = viewportRef.current.height / 2;
          nextCam = zoomAt(nextCam, centerX, centerY, 0.97);
        } else if (keys["e"]) {
          const centerX = viewportRef.current.width / 2;
          const centerY = viewportRef.current.height / 2;
          nextCam = zoomAt(nextCam, centerX, centerY, 1.03);
        }

        if (nextCam !== cam) {
          setCamera(nextCam);
        }
      }
      animFrame = requestAnimationFrame(updateNavigation);
    };
    animFrame = requestAnimationFrame(updateNavigation);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  // Space toggles temporary pan mode.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = true;
        setCursor("grab");
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setCursor(dragRef.current?.mode === "pan" ? "grabbing" : "grab");
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="City grid canvas. Pick a tool and click a cell to place a zone."
        style={{ cursor }}
        onPointerDown={(e) => {
          if (!cameraRef.current) return;
          e.preventDefault();

          if ((e.ctrlKey || e.metaKey) && toolActiveRef.current) {
            const cell = pointerToGrid(e.clientX, e.clientY);
            if (cell) {
              dragRef.current = {
                pointerId: e.pointerId,
                lastX: e.clientX,
                lastY: e.clientY,
                moved: false,
                placed: new Set(),
                mode: "rect",
              };
              rectStartRef.current = cell;
              return;
            }
          }

          const panIntent =
            e.button === 1 ||
            e.button === 2 ||
            spaceRef.current ||
            !toolActiveRef.current;
          if (panIntent) {
            dragRef.current = {
              pointerId: e.pointerId,
              lastX: e.clientX,
              lastY: e.clientY,
              moved: false,
              placed: new Set(),
              mode: "pan",
            };
            setCursor("grabbing");
            return;
          }
          const cell = pointerToGrid(e.clientX, e.clientY);
          if (!cell) return;
          dragRef.current = {
            pointerId: e.pointerId,
            lastX: e.clientX,
            lastY: e.clientY,
            moved: false,
            placed: new Set([tileKey(cell.x, cell.y)]),
            mode: "paint",
          };
          onPlace(cell.x, cell.y);
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (drag && drag.pointerId === e.pointerId) {
            const cam = cameraRef.current;
            if (!cam) return;
            const dx = e.clientX - drag.lastX;
            const dy = e.clientY - drag.lastY;
            drag.lastX = e.clientX;
            drag.lastY = e.clientY;
            if (drag.mode === "pan") {
              setCamera(panBy(cam, dx, dy));
            } else if (drag.mode === "paint" && !spaceRef.current) {
              const cell = pointerToGrid(e.clientX, e.clientY);
              if (cell && !drag.placed.has(tileKey(cell.x, cell.y))) {
                drag.placed.add(tileKey(cell.x, cell.y));
                onPlace(cell.x, cell.y);
              }
            } else if (drag.mode === "rect") {
              const cell = pointerToGrid(e.clientX, e.clientY);
              if (cell) {
                setHover(cell);
                onHoverChange?.(cell);
              }
            }
            return;
          }
          const cell = pointerToGrid(e.clientX, e.clientY);
          setHover(cell);
          onHoverChange?.(cell);
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current;
          if (drag && drag.pointerId === e.pointerId) {
            if (drag.mode === "rect" && rectStartRef.current) {
              const start = rectStartRef.current;
              const end = pointerToGrid(e.clientX, e.clientY) ?? hover;
              if (end) {
                const minX = Math.min(start.x, end.x);
                const maxX = Math.max(start.x, end.x);
                const minY = Math.min(start.y, end.y);
                const maxY = Math.max(start.y, end.y);
                for (let x = minX; x <= maxX; x++) {
                  for (let y = minY; y <= maxY; y++) {
                    onPlace(x, y);
                  }
                }
              }
            }
            dragRef.current = null;
            rectStartRef.current = null;
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          rectStartRef.current = null;
        }}
        onPointerLeave={() => {
          setHover(null);
          onHoverChange?.(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          const cam = cameraRef.current;
          const canvas = canvasRef.current;
          if (!cam || !canvas) return;
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          setCamera(zoomAt(cam, px, py, Math.pow(1.0012, -e.deltaY)));
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2 && cameraRef.current) {
            const cam = cameraRef.current;
            const t0 = e.touches[0];
            const t1 = e.touches[1];
            pinchRef.current = {
              dist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
              camera: cam,
            };
          }
        }}
        onTouchMove={(e) => {
          const pinch = pinchRef.current;
          if (pinch && e.touches.length === 2) {
            const t0 = e.touches[0];
            const t1 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = (t0.clientX + t1.clientX) / 2 - rect.left;
            const my = (t0.clientY + t1.clientY) / 2 - rect.top;
            setCamera(zoomAt(pinch.camera, mx, my, dist / pinch.dist));
          }
        }}
        onTouchEnd={() => (pinchRef.current = null)}
      />

      {/* Phase 5 & 6 (Day 2): freeform spatial overlay — shares the camera. */}
      {camera &&
        (zones ?? []).length >= 0 &&
        (freeformMode !== undefined || (zones && zones.length > 0) || (roads && roads.length > 0)) && (
        <SpatialCanvas
          camera={camera}
          tiles={tiles}
          zones={zones ?? []}
          roads={roads ?? []}
          terrain={terrain}
          terrainMode={terrainMode}
          terrainRadius={terrainRadius}
          terrainStrength={terrainStrength}
          onEditTerrain={onEditTerrain}
          freeformMode={freeformMode ?? false}
          activeTool={activeTool ?? (toolActive ? hoverColor : "select")}
          selectedZoneId={selectedZoneId ?? null}
          selectedRoadId={selectedRoadId ?? null}
          onAdd={(world) => onAddZone?.(world)}
          onSelect={(id) => onSelectZone?.(id)}
          onMove={(id, world) => onMoveZone?.(id, world)}
          onRotate={(id, deg) => onRotateZone?.(id, deg)}
          onResize={(zone, corner, world) => onResizeZone?.(zone, corner, world)}
          onGestureStart={() => onGestureStart?.()}
          commitZones={() => onCommitZones?.()}
          removeZone={(id) => onRemoveZone?.(id)}
          onAddRoad={(road) => onAddRoad?.(road)}
          onSelectRoad={(id) => onSelectRoad?.(id)}
          onUpdateRoad={(road) => onUpdateRoad?.(road)}
          onRemoveRoad={(id) => onRemoveRoad?.(id)}
        />
      )}

      {/* Floating local feedback (PRD §11): floats, fades, never blocks input. */}
      {camera &&
        feedbacks.map((f) => {
          const { px, py } = cellToScreenPx(camera, f.x, f.y);
          const positive = f.value >= 0;
          return (
            <div
              key={f.id}
              className="feedback-pop pointer-events-none absolute z-10 select-none whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold shadow-lg"
              style={{
                left: px + size / 2,
                top: py - 6,
                transform: "translateX(-50%)",
                backgroundColor: "rgba(8, 10, 13, 0.92)",
                color: positive ? "#7cffb2" : "#ff6b6b",
                border: `1px solid ${positive ? "rgba(124, 255, 178, 0.5)" : "rgba(255, 107, 107, 0.5)"}`,
              }}
              role="status"
            >
              {positive ? `+${f.value}` : f.value} {METRIC_LABEL[f.metric] ?? f.metric}
            </div>
          );
        })}

      {/* Zoom controls (always accessible; icon-only actions get tooltips —
          PRD Phase 4 accessibility). */}
      {camera && (
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-border bg-popover/90 text-popover-foreground shadow-lg backdrop-blur">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => {
                  const cam = cameraRef.current;
                  if (cam)
                    setCamera(zoomAt(cam, viewport.width / 2, viewport.height / 2, 1.25));
                }}
                className="px-3 py-1.5 text-sm outline-none transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
              >
                +
              </button>
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
          <span className="border-y border-border px-1 py-0.5 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round((camera.zoom / camera.tileSize) * BASE_TILE * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => {
                  const cam = cameraRef.current;
                  if (cam)
                    setCamera(zoomAt(cam, viewport.width / 2, viewport.height / 2, 0.8));
                }}
                className="px-3 py-1.5 text-sm outline-none transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
              >
                −
              </button>
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Reset view"
                onClick={() => setCamera(fitCamera(tiles, viewport, zones, roads))}
                className="px-3 py-1.5 text-[10px] font-bold outline-none transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
              >
                ⟳
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset view</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Live coordinate readout (mono, data-styled). */}
      {hover && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-card/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {hover.x}, {hover.y}
        </div>
      )}

      {/* Empty state (PRD §1.3 Phase 0, Phase 4 polish). Illustration from a
          Runway-generated visual treatment; purely decorative. */}
      {tiles.size === 0 && (zones ?? []).length === 0 && (roads ?? []).length === 0 && (
        <div className="mg-rise pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-border/70 bg-card/85 px-6 py-5 text-center shadow-xl backdrop-blur">
            <img
              src={cityEmptyUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              width={1376}
              height={768}
              className="h-24 w-auto rounded-lg opacity-90"
            />
            <p className="font-display text-base font-bold text-foreground">
              Design a city. Watch it respond.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Pick a tool and click the grid — scores update on every placement.
              Scroll to zoom, drag to pan.
            </p>
            <p className="font-mono text-[10px] tracking-wide text-muted-foreground/70">
              1–5 zones · V select · X erase
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
