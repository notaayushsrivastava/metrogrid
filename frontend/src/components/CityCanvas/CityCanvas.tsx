/**
 * CityCanvas — native HTML5 canvas renderer for the Phase 1 bounded grid
 * (PRD §14, §4.1: no Fabric.js/PixiJS). Renders only the 20×20 prototype
 * view; the camera abstraction keeps conversions Phase-2 ready.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRID_SIZE, TILE_META } from "../../config/tiles";
import { tileKey } from "../../state/cityState";
import type { Feedback, GridState, TileType } from "../../types/city";
import {
  cellSize,
  cellToScreenPx,
  screenToGrid,
  type Camera,
} from "../../utils/coordinates";

interface CityCanvasProps {
  tiles: GridState;
  toolActive: boolean;
  /** Outline color for the hovered cell (tool-dependent non-color cue). */
  hoverColor: string;
  feedbacks: Feedback[];
  onPlace: (x: number, y: number) => void;
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

function computeCamera(viewport: Viewport): Camera {
  const padding = 8;
  const tileSize = Math.max(
    14,
    Math.min(
      40,
      Math.floor(
        (Math.min(viewport.width, viewport.height) - padding * 2) / GRID_SIZE
      )
    )
  );
  const board = tileSize * GRID_SIZE;
  return {
    offsetX: Math.round((viewport.width - board) / 2),
    offsetY: Math.round((viewport.height - board) / 2),
    zoom: 1,
    tileSize,
  };
}

/** Draws a single tile at its screen position. */
function drawTile(
  ctx: CanvasRenderingContext2D,
  tiles: GridState,
  type: TileType,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number
): void {
  const meta = TILE_META[type as Exclude<TileType, 0>];
  const inset = 1;
  const s = size - inset * 2;
  const r = Math.max(2, Math.floor(size * 0.12));

  ctx.beginPath();
  ctx.roundRect(px + inset, py + inset, s, s, r);
  ctx.fillStyle = meta.color;
  ctx.fill();

  if (isRoadType(type)) {
    // Connector stripes toward adjacent road tiles.
    const cx = px + size / 2;
    const cy = py + size / 2;
    ctx.strokeStyle = meta.ink;
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.setLineDash([size * 0.28, size * 0.22]);
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
      }
    }
    ctx.setLineDash([]);
    return;
  }

  // Zone glyph (non-color cue, PRD §14A accessibility).
  ctx.fillStyle = meta.ink;
  ctx.font = `700 ${Math.floor(size * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(meta.glyph, px + size / 2, py + size / 2 + 1);
}

export function CityCanvas({
  tiles,
  toolActive,
  hoverColor,
  feedbacks,
  onPlace,
}: CityCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // Track container size for a responsive, centered board.
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

  const camera = useMemo(() => computeCamera(viewport), [viewport]);
  const size = cellSize(camera);

  // Render on every relevant change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.floor(viewport.width);
    const cssHeight = Math.floor(viewport.height);
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

    // Backdrop and board plate.
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    const board = size * GRID_SIZE;
    ctx.fillStyle = "#111c31";
    ctx.beginPath();
    ctx.roundRect(camera.offsetX - 4, camera.offsetY - 4, board + 8, board + 8, 10);
    ctx.fill();

    // Grid lines.
    ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= GRID_SIZE; i++) {
      const gx = Math.round(camera.offsetX + i * size) + 0.5;
      const gy = Math.round(camera.offsetY + i * size) + 0.5;
      ctx.moveTo(gx, camera.offsetY);
      ctx.lineTo(gx, camera.offsetY + board);
      ctx.moveTo(camera.offsetX, gy);
      ctx.lineTo(camera.offsetX + board, gy);
    }
    ctx.stroke();

    // Tiles — the sparse map means only placed tiles are drawn (PRD §6.3).
    tiles.forEach((tile, key) => {
      const [x, y] = key.split(",").map(Number);
      if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return;
      const { px, py } = cellToScreenPx(camera, x, y);
      drawTile(ctx, tiles, tile.type, x, y, px, py, size);
    });

    // Hover highlight.
    if (hover && toolActive) {
      const { px, py } = cellToScreenPx(camera, hover.x, hover.y);
      ctx.strokeStyle = hoverColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px + 1.5, py + 1.5, size - 3, size - 3, 4);
      ctx.stroke();
    }
  }, [tiles, hover, camera, size, viewport, toolActive, hoverColor]);

  const pointerToGrid = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect(); // PRD §14.1
      return screenToGrid(rect, clientX, clientY, camera);
    },
    [camera]
  );

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
        className={toolActive ? "cursor-crosshair" : "cursor-default"}
        onPointerMove={(e) => setHover(pointerToGrid(e.clientX, e.clientY))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          const cell = pointerToGrid(e.clientX, e.clientY);
          if (cell) onPlace(cell.x, cell.y);
        }}
      />

      {/* Floating local feedback (PRD §11): floats up, fades, never blocks input. */}
      {feedbacks.map((f) => {
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
              backgroundColor: "rgba(2, 6, 23, 0.92)",
              color: positive ? "#4ade80" : "#f87171",
              border: `1px solid ${positive ? "rgba(74, 222, 128, 0.5)" : "rgba(248, 113, 113, 0.5)"}`,
            }}
            role="status"
          >
            {positive ? `+${f.value}` : f.value} {METRIC_LABEL[f.metric] ?? f.metric}
          </div>
        );
      })}

      {/* Empty state (PRD §1.3 Phase 0). */}
      {tiles.size === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-slate-200">
              Pick a tool and click the grid
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Place zones and roads — scores update instantly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
