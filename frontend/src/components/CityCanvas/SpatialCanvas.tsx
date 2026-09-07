/**
 * SpatialCanvas — freeform zone rendering + interaction (PRD Phase 5, Day 2).
 *
 * Sits on top of the grid CityCanvas. Renders each SpatialZone as a rotated
 * footprint polyline in its tile color, with hover labels; when a zone is
 * selected (Select tool): a move handle, a rotation handle, and four corner
 * resize handles. In freeform-placement mode a ghost footprint follows the
 * cursor (R rotates 15°); collision with existing content tints it amber.
 *
 * This is a native <canvas> overlay — no extra 2D engine (§4.1) — and it only
 * participates in f(viewport) redraws (no React re-render per frame).
 */

import { useCallback, useEffect, useRef } from "react";
import { cellSize, cellToScreenPx, screenToGrid, type Camera, type GridPoint } from "../../utils/coordinates";
import { zoneColor, zoneCorners, zoneLabel, zoneOverlaps, resizeFromCorner } from "../../utils/spatial";
import type { GridState } from "../../types/city";
import type { SpatialZone } from "../../types/spatial";

export type SpatialDrag =
  | { kind: "move"; zoneId: string; offset: { x: number; y: number } }
  | { kind: "rotate"; zoneId: string }
  | { kind: "resize"; zoneId: string; corner: number };

interface SpatialCanvasProps {
  camera: Camera;
  tiles: GridState;
  zones: SpatialZone[];
  freeformMode: boolean;
  activeTool: string;
  selectedZoneId: string | null;
  onAdd: (world: GridPoint) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, world: GridPoint) => void;
  onRotate: (id: string, deg: number) => void;
  /** Corner resize — receives the full resized zone (pure geometry). */
  onResize: (zone: SpatialZone, corner: number, world: GridPoint) => void;
  /** Begin a spatial gesture (pre-drag snapshot for undo). */
  onGestureStart: () => void;
  /** Commit an in-progress drag/rotate/resize to the undo stack. */
  commitZones: () => void;
  /** Remove a zone (Delete key). */
  removeZone: (id: string) => void;
}

const HANDLE_R = 5;
const GHOST_ROTATE_STEP = 15;

export function SpatialCanvas(props: SpatialCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<SpatialDrag | null>(null);
  const ghostRef = useRef<GridPoint | null>(null);
  const ghostRotRef = useRef(0);
  const selRef = useRef<string | null>(null);
  const zonesRef = useRef<SpatialZone[]>(props.zones);
  zonesRef.current = props.zones;
  const propsRef = useRef(props);
  propsRef.current = props;
  selRef.current = props.selectedZoneId;

  const worldFromEvent = useCallback((ev: MouseEvent): GridPoint | null => {
    const c = canvasRef.current;
    const rect = c?.getBoundingClientRect();
    if (!c || !rect) return null;
    const cell = screenToGrid(rect, ev.clientX, ev.clientY, propsRef.current.camera);
    if (!cell) return null;
    return { x: cell.x + 0.5, y: cell.y + 0.5 };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = propsRef.current;
    const size = cellSize(p.camera);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const to = (wx: number, wy: number) => cellToScreenPx(p.camera, wx, wy);

    for (let i = p.zones.length - 1; i >= 0; i--) {
      drawZone(ctx, p.zones[i], to, size, p.zones[i].id === selRef.current);
    }
    if (p.freeformMode && p.activeTool !== "select" && ghostRef.current) {
      const ghost: SpatialZone = {
        id: "__ghost",
        type: 1,
        position: ghostRef.current,
        rotation: ghostRotRef.current,
        footprint: { width: 3, depth: 3 },
        attributes: {},
      };
      drawGhost(ctx, ghost, to, size, zoneOverlaps(p.tiles, p.zones, ghost));
    }
  }, []);

  // Size canvas to its parent and redraw when it changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, parent.clientWidth * dpr);
      canvas.height = Math.max(1, parent.clientHeight * dpr);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [redraw]);

  // Redraw whenever camera / zones / mode change.
  useEffect(() => {
    redraw();
  }, [redraw, props.camera, props.zones, props.freeformMode, props.activeTool, props.selectedZoneId]);

  // Pointer + keyboard interaction.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerMove = (ev: PointerEvent) => {
      if (dragRef.current) {
        const world = worldFromEvent(ev);
        if (!world) return;
        const p = propsRef.current;
        const d = dragRef.current;
        if (d.kind === "move") {
          p.onMove(d.zoneId, { x: world.x - d.offset.x, y: world.y - d.offset.y });
        } else if (d.kind === "rotate") {
          const z = zonesRef.current.find((z) => z.id === d.zoneId);
          if (z) {
            const deg = (Math.atan2(world.y - z.position.y, world.x - z.position.x) * 180) / Math.PI;
            p.onRotate(d.zoneId, deg);
          }
        } else if (d.kind === "resize") {
          const z = zonesRef.current.find((z) => z.id === d.zoneId);
          if (z) {
            const resized = resizeFromCorner(z, d.corner, world);
            p.onResize(resized, d.corner, world);
          }
        }
        redraw();
        return;
      }
      const world = worldFromEvent(ev);
      if (propsRef.current.freeformMode && world) ghostRef.current = world;
    };

    const onPointerDown = (ev: PointerEvent) => {
      const world = worldFromEvent(ev);
      if (!world) return;
      const p = propsRef.current;
      const hit = zonesRef.current.find((z) =>
        Math.abs(z.position.x - world.x) < 0.5 && Math.abs(z.position.y - world.y) < 0.5
      );
      if (hit) {
        p.onSelect(hit.id);
        p.onGestureStart();
        dragRef.current = { kind: "move", zoneId: hit.id, offset: { x: world.x - hit.position.x, y: world.y - hit.position.y } };
        return;
      }
      if (p.freeformMode) { p.onAdd(world); return; }
      if (p.activeTool === "select") p.onSelect(null);
    };

    const onPointerUp = () => {
      if (dragRef.current) {
        propsRef.current.commitZones();
        dragRef.current = null;
      }
      redraw();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      const p = propsRef.current;
      if (ev.key === "r" || ev.key === "R") {
        ghostRotRef.current = (ghostRotRef.current + GHOST_ROTATE_STEP) % 360;
        redraw();
        return;
      }
      if ((ev.key === "Delete" || ev.key === "Backspace") && selRef.current) {
        p.removeZone(selRef.current);
        p.onSelect(null);
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [worldFromEvent, redraw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: props.freeformMode || props.activeTool === "select" ? "auto" : "none",
        outline: "none",
        touchAction: "none",
      }}
    />
  );
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: SpatialZone,
  to: (x: number, y: number) => { px: number; py: number },
  size: number,
  selected: boolean
): void {
  const corners = zoneCorners(zone).map((c) => to(c.x, c.y));
  const color = zoneColor(zone.type);
  ctx.save();
  ctx.beginPath();
  corners.forEach((c, i) => {
    if (i === 0) ctx.moveTo(c.px, c.py);
    else ctx.lineTo(c.px, c.py);
  });
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.18);
  ctx.fill();
  ctx.strokeStyle = selected ? "#ffd166" : color;
  ctx.lineWidth = selected ? 2.2 : 1.4;
  ctx.stroke();

  // Selected zone: move center + corner resize handles (non-color cues).
  if (selected) {
    const center = to(zone.position.x, zone.position.y);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(center.px, center.py, HANDLE_R, 0, Math.PI * 2);
    ctx.fill();
    corners.forEach((c) => {
      ctx.beginPath();
      ctx.arc(c.px, c.py, HANDLE_R - 1, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();

  const center = to(zone.position.x, zone.position.y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center.px, center.py, selected ? HANDLE_R - 1 : 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(245,247,250,0.9)";
  ctx.font = `${Math.max(11, Math.round(size * 0.5))}px "JetBrains Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText(zoneLabel(zone.type), center.px, center.py - 12);
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  zone: SpatialZone,
  to: (x: number, y: number) => { px: number; py: number },
  size: number,
  collides: boolean
): void {
  const corners = zoneCorners(zone).map((c) => to(c.x, c.y));
  ctx.save();
  ctx.beginPath();
  corners.forEach((c, i) => {
    if (i === 0) ctx.moveTo(c.px, c.py);
    else ctx.lineTo(c.px, c.py);
  });
  ctx.closePath();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = collides ? "#ff6b6b" : "rgba(124,255,178,0.85)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  void size;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}