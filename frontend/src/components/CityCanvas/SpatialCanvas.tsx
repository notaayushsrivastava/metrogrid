/**
 * SpatialCanvas — freeform zone + road rendering & interaction (PRD Phase 5 & Phase 6, Day 2).
 *
 * Sits on top of the grid CityCanvas.
 * - Renders SpatialZone footprints & handles.
 * - Renders SpatialRoad multi-segment polylines, custom stroke widths, animated traffic flow lines,
 *   and vertex node editing handles.
 * - Enables click-to-draw multi-segment road creation (double-click/Enter to commit).
 */

import { useCallback, useEffect, useRef } from "react";
import { cellSize, cellToScreenPx, screenToGrid, type Camera, type GridPoint } from "../../utils/coordinates";
import { zoneColor, zoneLabel, zoneOverlaps, resizeFromCorner, deg2rad, pointInZone } from "../../utils/spatial";
import { DEFAULT_TILE_METER_SIZE } from "../../utils/freeform";
import type { GridState } from "../../types/city";
import type { SpatialZone, SpatialRoad, SpatialRoadPoint, RoadSubtype } from "../../types/spatial";
import { getDefaultRoadWidth, rotateRoadAroundCenter, getRoadLevel, LEVEL_SHORT_BADGES } from "../../utils/freeformRoads";


export type SpatialDrag =
  | { kind: "terrain" }
  | { kind: "move"; zoneId: string; offset: { x: number; y: number } }
  | { kind: "rotate"; zoneId: string }
  | { kind: "resize"; zoneId: string; corner: number }
  | { kind: "roadNode"; roadId: string; nodeIndex: number };

interface SpatialCanvasProps {
  camera: Camera;
  tiles: GridState;
  zones: SpatialZone[];
  roads?: SpatialRoad[];
  terrain?: Map<string, number>;
  terrainMode?: import("../../types/spatial").TerrainEditMode;
  terrainRadius?: number;
  terrainStrength?: number;
  onEditTerrain?: (center: { x: number; y: number }, mode: import("../../types/spatial").TerrainEditMode, radius: number, strength: number) => void;
  freeformMode: boolean;
  activeTool: string;
  selectedZoneId: string | null;
  selectedRoadId?: string | null;
  hideZones?: boolean;
  snapEnabled?: boolean;
  onAdd: (world: GridPoint) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, world: GridPoint) => void;
  onRotate: (id: string, deg: number) => void;
  onResize: (zone: SpatialZone, corner: number, world: GridPoint) => void;
  onGestureStart: () => void;
  commitZones: () => void;
  removeZone: (id: string) => void;

  /* Phase 6 freeform road callbacks */
  onAddRoad?: (road: SpatialRoad) => void;
  onSelectRoad?: (id: string | null) => void;
  onUpdateRoad?: (road: SpatialRoad) => void;
  onRemoveRoad?: (id: string) => void;

  /** Read-only mode for Plan Preview */
  readOnly?: boolean;
  showTraffic?: boolean;
}


const HANDLE_R = 5;
const GHOST_ROTATE_STEP = 15;

const ROAD_COLOR: Record<number, string> = {
  40: "#34d399", // Pedestrian
  41: "#94a3b8", // Local
  42: "#fbbf24", // Transit Avenue
  43: "#f87171", // Express Highway
  4:  "#64748b", // Default Road
};

export function SpatialCanvas(props: SpatialCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<SpatialDrag | null>(null);
  const ghostRef = useRef<GridPoint | null>(null);
  const ghostRotRef = useRef(0);
  const selRef = useRef<string | null>(null);
  const selRoadRef = useRef<string | null>(null);
  const zonesRef = useRef<SpatialZone[]>(props.zones);
  const roadsRef = useRef<SpatialRoad[]>(props.roads ?? []);
  const draftRoadPointsRef = useRef<SpatialRoadPoint[]>([]);
  const animFrameRef = useRef<number | null>(null);

  zonesRef.current = props.zones;
  roadsRef.current = props.roads ?? [];
  selRef.current = props.selectedZoneId;
  selRoadRef.current = props.selectedRoadId ?? null;
  const propsRef = useRef(props);
  propsRef.current = props;

  const worldFromEvent = useCallback((ev: MouseEvent): GridPoint | null => {
    const c = canvasRef.current;
    const rect = c?.getBoundingClientRect();
    if (!c || !rect) return null;
    const cell = screenToGrid(rect, ev.clientX, ev.clientY, propsRef.current.camera);
    if (!cell) return null;
    return { x: cell.x + 0.5, y: cell.y + 0.5 };
  }, []);

  const isRoadToolActive = useCallback((tool: string): boolean => {
    return (
      tool === "road" ||
      tool === "road_local" ||
      tool === "road_transit" ||
      tool === "road_highway"
    );
  }, []);

  const getSubtypeFromTool = useCallback((tool: string): RoadSubtype => {
    if (tool === "road_local") return 41;
    if (tool === "road_transit") return 42;
    if (tool === "road_highway") return 43;
    return 4;
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
    const time = Date.now() / 1000;

    // 0. Draw Terrain Contour & Shading Heatmap
    if (p.terrain && p.terrain.size > 0) {
      p.terrain.forEach((elev, key) => {
        if (elev <= 0) return;
        const [cx, cy] = key.split(",").map(Number);
        const center = to(cx + 0.5, cy + 0.5);
        const radius = (size / 2) * 1.2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(center.px, center.py, radius, 0, Math.PI * 2);
        const alpha = Math.min(0.45, (elev / 25.0) * 0.4);
        ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
        ctx.fill();

        // Contour ring
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(56, 189, 248, ${Math.min(0.8, alpha + 0.2)})`;
        ctx.stroke();

        // Elevation text
        if (size > 18) {
          ctx.font = "9px monospace";
          ctx.fillStyle = "#38bdf8";
          ctx.textAlign = "center";
          ctx.fillText(`${elev}m`, center.px, center.py + 3);
        }
        ctx.restore();
      });
    }

    // 1. Draw Freeform Roads (Sorted by Infrastructure Level: Tunnel -> Surface -> Elevated -> Skyway)
    const roads = p.roads ?? [];
    const sortedRoads = [...roads].sort((a, b) => {
      const la = a.level ?? 0;
      const lb = b.level ?? 0;
      return la - lb;
    });

    for (const road of sortedRoads) {
      drawRoad(
        ctx,
        road,
        to,
        size,
        road.id === selRoadRef.current,
        time,
        p.showTraffic ?? true
      );
    }

    // 2. Draw Active Road Creation Polyline Draft (suppressed when readOnly)
    if (!p.readOnly && draftRoadPointsRef.current.length > 0) {
      drawRoadDraft(ctx, draftRoadPointsRef.current, ghostRef.current, to, size);
    }

    // 2.5 Draw Terrain Brush Preview Circle (suppressed when readOnly)
    if (!p.readOnly && p.activeTool.startsWith("terrain_") && ghostRef.current) {
      const brushPx = to(ghostRef.current.x, ghostRef.current.y);
      const rPx = (p.terrainRadius ?? 2) * size;
      ctx.save();
      ctx.beginPath();
      ctx.arc(brushPx.px, brushPx.py, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = p.activeTool === "terrain_raise" ? "#38bdf8" : p.activeTool === "terrain_lower" ? "#f43f5e" : "#06b6d4";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.fillStyle = p.activeTool === "terrain_raise" ? "rgba(56, 189, 248, 0.15)" : p.activeTool === "terrain_lower" ? "rgba(244, 63, 94, 0.15)" : "rgba(6, 182, 212, 0.15)";
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw Freeform Spatial Zones (hidden when hideZones is enabled)
    if (!p.hideZones) {
      for (let i = p.zones.length - 1; i >= 0; i--) {
        drawZone(ctx, p.zones[i], to, size, p.zones[i].id === selRef.current);
      }
    }


    // 4. Ghost Footprint for Zone placement (suppressed when readOnly)
    if (
      !p.readOnly &&
      p.freeformMode &&
      !isRoadToolActive(p.activeTool) &&
      p.activeTool !== "select" &&
      ghostRef.current
    ) {
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
  }, [isRoadToolActive]);

  // Size canvas & setup animation loop for traffic flows
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

    const animate = () => {
      redraw();
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      ro.disconnect();
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [redraw]);

  // Reset draft road points when active tool switches away from road tool
  useEffect(() => {
    if (!isRoadToolActive(props.activeTool)) {
      draftRoadPointsRef.current = [];
      redraw();
    }
  }, [props.activeTool, isRoadToolActive, redraw]);

  // Pointer & Keyboard interactions for zone + freeform road authoring
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const commitDraftRoad = () => {
      const pts = draftRoadPointsRef.current;
      if (pts.length >= 2) {
        const type = getSubtypeFromTool(propsRef.current.activeTool);
        const newRoad: SpatialRoad = {
          id: `road_${Date.now()}`,
          type,
          points: [...pts],
          width: getDefaultRoadWidth(type),
        };
        propsRef.current.onAddRoad?.(newRoad);
      }
      draftRoadPointsRef.current = [];
      redraw();
    };

    const onPointerMove = (ev: PointerEvent) => {
      const world = worldFromEvent(ev);
      if (!world) return;

      if (dragRef.current) {
        const p = propsRef.current;
        const d = dragRef.current;
        if (d.kind === "terrain") {
          if (p.activeTool.startsWith("terrain_")) {
            const mode = (p.terrainMode ?? p.activeTool.replace("terrain_", "")) as import("../../types/spatial").TerrainEditMode;
            p.onEditTerrain?.({ x: world.x, y: world.y }, mode, p.terrainRadius ?? 2, p.terrainStrength ?? 1.0);
          }
          ghostRef.current = world;
          redraw();
          return;
        }
        const isSnap = p.snapEnabled !== false;
        if (d.kind === "move") {
          const rawX = world.x - d.offset.x;
          const rawY = world.y - d.offset.y;
          const x = isSnap ? Math.round(rawX * 2) / 2 : rawX;
          const y = isSnap ? Math.round(rawY * 2) / 2 : rawY;
          p.onMove(d.zoneId, { x, y });
        } else if (d.kind === "rotate") {
          const z = zonesRef.current.find((z) => z.id === d.zoneId);
          if (z) {
            let deg = (Math.atan2(world.y - z.position.y, world.x - z.position.x) * 180) / Math.PI;
            if (isSnap) {
              deg = Math.round(deg / 15) * 15;
            }
            p.onRotate(d.zoneId, deg);
          }
        } else if (d.kind === "resize") {
          const z = zonesRef.current.find((z) => z.id === d.zoneId);
          if (z) {
            const snappedWorld = isSnap
              ? { x: Math.round(world.x * 2) / 2, y: Math.round(world.y * 2) / 2 }
              : world;
            const resized = resizeFromCorner(z, d.corner, snappedWorld);
            p.onResize(resized, d.corner, snappedWorld);
          }
        } else if (d.kind === "roadNode") {
          const r = roadsRef.current.find((rd) => rd.id === d.roadId);
          if (r) {
            const nx = isSnap ? Math.round(world.x * 2) / 2 : world.x;
            const ny = isSnap ? Math.round(world.y * 2) / 2 : world.y;
            const newPts = [...r.points];
            newPts[d.nodeIndex] = { x: nx, y: ny };
            p.onUpdateRoad?.({ ...r, points: newPts });
          }
        }
        redraw();
        return;
      }

      if (propsRef.current.freeformMode || propsRef.current.activeTool.startsWith("terrain_")) {
        ghostRef.current = world;
        redraw();
      }
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (propsRef.current.readOnly) return;
      if (ev.button !== 0) return; // Only primary click
      const world = worldFromEvent(ev);
      if (!world) return;
      const p = propsRef.current;

      // 0. If terrain tool active, apply terrain editing and start drag
      if (p.activeTool.startsWith("terrain_")) {
        const mode = (p.terrainMode ?? p.activeTool.replace("terrain_", "")) as import("../../types/spatial").TerrainEditMode;
        p.onEditTerrain?.({ x: world.x, y: world.y }, mode, p.terrainRadius ?? 2, p.terrainStrength ?? 1.0);
        dragRef.current = { kind: "terrain" };
        redraw();
        return;
      }

      // 0b. Erase tool: remove the freeform object (road or zone) under the
      //     cursor. Without this the erase tool only cleared grid tiles and
      //     ignored freeform roads/zones entirely.
      if (p.activeTool === "erase") {
        for (const road of roadsRef.current) {
          for (let i = 0; i < road.points.length - 1; i++) {
            const p1 = road.points[i];
            const p2 = road.points[i + 1];
            const dist = Math.abs(
              (p2.y - p1.y) * world.x - (p2.x - p1.x) * world.y + p2.x * p1.y - p2.y * p1.x
            ) / Math.hypot(p2.y - p1.y, p2.x - p1.x);
            if (dist < (road.width / 10.0) + 0.5) {
              p.onRemoveRoad?.(road.id);
              p.onSelectRoad?.(null);
              redraw();
              return;
            }
          }
        }
        const hitZone = zonesRef.current.find(
          (z) =>
            pointInZone(z, world.x, world.y) ||
            (Math.abs(z.position.x - world.x) < 0.5 && Math.abs(z.position.y - world.y) < 0.5)
        );
        if (hitZone) {
          p.removeZone(hitZone.id);
          p.onSelect(null);
          redraw();
          return;
        }
        return;
      }

      // 1. If road tool active, add vertex to draft road and commit segment when 2 points exist
      if (p.freeformMode && isRoadToolActive(p.activeTool)) {
        draftRoadPointsRef.current.push({ x: world.x, y: world.y });
        if (draftRoadPointsRef.current.length >= 2) {
          const pts = [...draftRoadPointsRef.current];
          const type = getSubtypeFromTool(p.activeTool);
          const newRoad: SpatialRoad = {
            id: `road_${Date.now()}`,
            type,
            points: pts,
            width: getDefaultRoadWidth(type),
            level: 0,
            elevation: 0,
          };
          p.onAddRoad?.(newRoad);
          p.onSelectRoad?.(newRoad.id);
          p.onSelect(null);
          // Chain from the last clicked point for continuous road drafting
          draftRoadPointsRef.current = [{ x: world.x, y: world.y }];
        }
        redraw();
        return;
      }

      // 2. Check road node drag hits if a road is selected
      if (selRoadRef.current) {
        const selRoad = roadsRef.current.find((r) => r.id === selRoadRef.current);
        if (selRoad) {
          for (let i = 0; i < selRoad.points.length; i++) {
            const pt = selRoad.points[i];
            if (Math.hypot(pt.x - world.x, pt.y - world.y) < 1.0) {
              dragRef.current = { kind: "roadNode", roadId: selRoad.id, nodeIndex: i };
              return;
            }
          }
        }
      }

      // 3. Check road selection hit
      for (const road of roadsRef.current) {
        for (let i = 0; i < road.points.length - 1; i++) {
          const p1 = road.points[i];
          const p2 = road.points[i + 1];
          const dist = Math.abs(
            (p2.y - p1.y) * world.x - (p2.x - p1.x) * world.y + p2.x * p1.y - p2.y * p1.x
          ) / Math.hypot(p2.y - p1.y, p2.x - p1.x);

          if (dist < (road.width / 10.0) + 0.5) {
            p.onSelectRoad?.(road.id);
            p.onSelect(null);
            return;
          }
        }
      }

      // 4. Check zone hit
      const hitZone = zonesRef.current.find((z) =>
        Math.abs(z.position.x - world.x) < 0.5 && Math.abs(z.position.y - world.y) < 0.5
      );
      if (hitZone) {
        p.onSelect(hitZone.id);
        p.onSelectRoad?.(null);
        p.onGestureStart();
        dragRef.current = {
          kind: "move",
          zoneId: hitZone.id,
          offset: { x: world.x - hitZone.position.x, y: world.y - hitZone.position.y },
        };
        return;
      }

      if (p.freeformMode && !isRoadToolActive(p.activeTool)) {
        p.onAdd(world);
        return;
      }

      if (p.activeTool === "select") {
        p.onSelect(null);
        p.onSelectRoad?.(null);
      }
    };

    const onDblClick = () => {
      commitDraftRoad();
    };

    const onPointerUp = () => {
      if (dragRef.current) {
        if (dragRef.current.kind !== "terrain") {
          propsRef.current.commitZones();
        }
        dragRef.current = null;
      }
      redraw();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (propsRef.current.readOnly) return;
      const p = propsRef.current;
      if (ev.key === "Enter") {
        commitDraftRoad();
        return;
      }
      if (ev.key === "Escape") {
        draftRoadPointsRef.current = [];
        redraw();
        return;
      }
      if (ev.key === "r" || ev.key === "R") {
        if (selRoadRef.current) {
          const road = roadsRef.current.find((r) => r.id === selRoadRef.current);
          if (road) {
            const rotated = rotateRoadAroundCenter(road, GHOST_ROTATE_STEP);
            p.onUpdateRoad?.(rotated);
          }
        } else if (selRef.current) {
          const zone = zonesRef.current.find((z) => z.id === selRef.current);
          if (zone) {
            p.onRotate(zone.id, (zone.rotation + GHOST_ROTATE_STEP) % 360);
          }
        } else {
          ghostRotRef.current = (ghostRotRef.current + GHOST_ROTATE_STEP) % 360;
        }
        redraw();
        return;
      }

      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (selRoadRef.current) {
          p.onRemoveRoad?.(selRoadRef.current);
          p.onSelectRoad?.(null);
        } else if (selRef.current) {
          p.removeZone(selRef.current);
          p.onSelect(null);
        }
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("dblclick", onDblClick);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [worldFromEvent, redraw, getSubtypeFromTool, isRoadToolActive]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents:
          !props.readOnly && (props.freeformMode || props.activeTool === "select" || props.activeTool.startsWith("terrain_"))
            ? "auto"
            : "none",
        outline: "none",
        touchAction: "none",
      }}
    />
  );
}

function drawRoad(
  ctx: CanvasRenderingContext2D,
  road: SpatialRoad,
  to: (x: number, y: number) => { px: number; py: number },
  size: number,
  selected: boolean,
  time: number,
  showTraffic = true
): void {
  if (road.points.length < 2) return;

  const points = road.points.map((pt) => to(pt.x, pt.y));
  const color = ROAD_COLOR[road.type] ?? "#64748b";
  const strokeWidthPx = Math.max(3, (road.width / 10.0) * size);
  const level = getRoadLevel(road);
  const isElevated = level > 0 || (road.elevation !== undefined && road.elevation > 1.0);
  const isTunnel = level < 0 || (road.elevation !== undefined && road.elevation < -1.0);
  const isRamp = !!road.isRamp;

  ctx.save();

  // 1. Elevated Bridge Drop Shadow & Pier Indicators
  if (isElevated) {
    // Under-deck bridge shadow
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.px + 2, pt.py + 4);
      else ctx.lineTo(pt.px + 2, pt.py + 4);
    });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = strokeWidthPx + 6;
    ctx.stroke();

    // Structural Bridge Pier Tick Marks
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const midX = (p1.px + p2.px) / 2;
      const midY = (p1.py + p2.py) / 2;
      const angle = Math.atan2(p2.py - p1.py, p2.px - p1.px) + Math.PI / 2;
      const pierSpan = (strokeWidthPx / 2) + 4;

      ctx.beginPath();
      ctx.moveTo(midX - Math.cos(angle) * pierSpan, midY - Math.sin(angle) * pierSpan);
      ctx.lineTo(midX + Math.cos(angle) * pierSpan, midY + Math.sin(angle) * pierSpan);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  // 2. Outer Casing (Dashed for tunnels, solid/double for elevated/surface, striped for ramp)
  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.px, pt.py);
    else ctx.lineTo(pt.px, pt.py);
  });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (isTunnel) {
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = selected ? "#ffd166" : "#06b6d4";
  } else if (isRamp) {
    ctx.setLineDash([6, 3]);
    ctx.strokeStyle = selected ? "#ffd166" : "#f59e0b";
  } else {
    ctx.strokeStyle = selected ? "#ffd166" : isElevated ? "#38bdf8" : color;
  }
  ctx.lineWidth = strokeWidthPx + (isElevated ? 5 : selected ? 4 : 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3. Inner asphalt fill
  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.px, pt.py);
    else ctx.lineTo(pt.px, pt.py);
  });
  ctx.strokeStyle = isTunnel ? "#090d16" : isElevated ? "#0f172a" : "#1e293b";
  ctx.lineWidth = Math.max(1, strokeWidthPx - (isElevated ? 1 : 2));
  ctx.stroke();

  // 4. Animated Glowing Traffic Flow Dash Line
  if (showTraffic) {
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.px, pt.py);
      else ctx.lineTo(pt.px, pt.py);
    });
    ctx.setLineDash([8, 12]);
    ctx.lineDashOffset = -time * 30;
    ctx.strokeStyle = isTunnel ? "#38bdf8" : road.type === 43 ? "#ffd166" : isElevated ? "#38bdf8" : "#7cffb2";
    ctx.lineWidth = Math.max(1.5, strokeWidthPx * 0.25);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 5. Level Badge / Drafting Callout Tag (if selected or zoomed in)
  if (points.length >= 2 && (selected || size > 24)) {
    const midIdx = Math.floor((points.length - 1) / 2);
    const midP1 = points[midIdx];
    const midP2 = points[midIdx + 1] || midP1;
    const badgeX = (midP1.px + midP2.px) / 2;
    const badgeY = (midP1.py + midP2.py) / 2 - (strokeWidthPx / 2) - 8;

    const badgeText = isRamp
      ? `RAMP L${road.startLevel ?? 0}→L${road.endLevel ?? 1}`
      : LEVEL_SHORT_BADGES[level];

    ctx.font = `bold ${Math.max(9, Math.round(size * 0.35))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    // Badge bg
    const textWidth = ctx.measureText(badgeText).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(badgeX - textWidth / 2 - 4, badgeY - 12, textWidth + 8, 14);
    ctx.strokeStyle = isElevated ? "#38bdf8" : isTunnel ? "#06b6d4" : isRamp ? "#f59e0b" : "#64748b";
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX - textWidth / 2 - 4, badgeY - 12, textWidth + 8, 14);

    ctx.fillStyle = selected ? "#ffd166" : isElevated ? "#38bdf8" : isTunnel ? "#38bdf8" : isRamp ? "#fcd34d" : "#e2e8f0";
    ctx.fillText(badgeText, badgeX, badgeY);
  }

  // 6. Render Control Nodes if Selected
  if (selected) {
    points.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, HANDLE_R + 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd166";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  ctx.restore();
}

function drawRoadDraft(
  ctx: CanvasRenderingContext2D,
  points: SpatialRoadPoint[],
  currentHover: GridPoint | null,
  to: (x: number, y: number) => { px: number; py: number },
  size: number
): void {
  const pts = points.map((pt) => to(pt.x, pt.y));
  if (currentHover) {
    pts.push(to(currentHover.x, currentHover.y));
  }

  ctx.save();
  ctx.beginPath();
  pts.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.px, pt.py);
    else ctx.lineTo(pt.px, pt.py);
  });
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = Math.max(3, size * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);

  pts.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.px, pt.py, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  });
  ctx.restore();
}

const ZONE_CODES: Record<number, string> = {
  1: "RES-01",
  2: "COM-02",
  3: "PRK-03",
  4: "ROD-04",
  5: "IND-05",
  40: "PED-40",
  41: "LOC-41",
  42: "TRN-42",
  43: "HWY-43",
};

function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: SpatialZone,
  to: (x: number, y: number) => { px: number; py: number },
  size: number,
  selected: boolean
): void {
  const center = to(zone.position.x, zone.position.y);
  const color = zoneColor(zone.type);
  const widthPx = zone.footprint.width * size;
  const depthPx = zone.footprint.depth * size;
  const hwPx = widthPx / 2;
  const hdPx = depthPx / 2;
  const minDim = Math.min(widthPx, depthPx);

  ctx.save();
  ctx.translate(center.px, center.py);
  ctx.rotate(deg2rad(zone.rotation));

  // 1. Blueprint Background Fill
  ctx.fillStyle = hexToRgba(color, selected ? 0.35 : 0.22);
  ctx.fillRect(-hwPx, -hdPx, widthPx, depthPx);

  // 2. Technical crosshatch inside clipped zone (only when large enough)
  if (minDim >= 20) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-hwPx, -hdPx, widthPx, depthPx);
    ctx.clip();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const hatchStep = Math.max(10, Math.round(size * 0.4));
    const maxExtent = hwPx + hdPx;
    for (let d = -maxExtent; d <= maxExtent; d += hatchStep) {
      ctx.moveTo(-hwPx + d, -hdPx);
      ctx.lineTo(-hwPx + d + depthPx, hdPx);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 3. Primary Solid Outer Border
  ctx.strokeStyle = selected ? "#ffd166" : color;
  ctx.lineWidth = selected ? 2.5 : 1.6;
  ctx.strokeRect(-hwPx, -hdPx, widthPx, depthPx);

  // 4. Subtle Inner Inset Drafting Line (only if zone is large enough)
  if (minDim >= 24) {
    const inset = Math.min(3, minDim * 0.08);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(-hwPx + inset, -hdPx + inset, widthPx - inset * 2, depthPx - inset * 2);
    ctx.setLineDash([]);
  }

  // 5. Center Registration Tick (only when zone has breathing room)
  if (minDim >= 28) {
    const tickLen = Math.min(5, minDim * 0.15);
    ctx.strokeStyle = selected ? "#ffd166" : "#38bdf8";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-tickLen, 0);
    ctx.lineTo(tickLen, 0);
    ctx.moveTo(0, -tickLen);
    ctx.lineTo(0, tickLen);
    ctx.stroke();
  }

  // 6. Corner Handles / Dots
  const cornersLocal: [number, number][] = [
    [-hwPx, -hdPx],
    [hwPx, -hdPx],
    [hwPx, hdPx],
    [-hwPx, hdPx],
  ];
  if (selected) {
    cornersLocal.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd166";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  } else if (minDim >= 24) {
    cornersLocal.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
    });
  }

  // 7. Multi-tier Adaptive Blueprint Typography & Dimension Callouts
  const code = ZONE_CODES[zone.type] || "BLD-01";
  const widthM = zone.footprint.width * DEFAULT_TILE_METER_SIZE;
  const depthM = zone.footprint.depth * DEFAULT_TILE_METER_SIZE;

  const availW = widthPx - 8;
  const availH = depthPx - 8;

  if (availW >= 14 && availH >= 14) {
    if (availW < 45 || availH < 22) {
      // Tier 1: Single character glyph for very tight cells
      const glyph = zone.type === 1 ? "R" : zone.type === 2 ? "C" : zone.type === 3 ? "P" : "I";
      ctx.font = `bold ${Math.max(9, Math.min(13, Math.round(minDim * 0.45)))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, 0, 0);
    } else if (availW < 80 || availH < 34) {
      // Tier 2: Compact short code [RES]
      ctx.font = `bold ${Math.max(8, Math.min(11, Math.round(minDim * 0.3)))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(code, 0, 0);
    } else {
      // Tier 3: Three-line zone label (top → bottom):
      //   1. Zone Name — rendered in the zone type's color
      //   2. Zone Type
      //   3. Tile Size (real-world meter dimensions)
      const titleFontSize = Math.max(9, Math.min(12, Math.round(size * 0.38)));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const showType = availH >= 42;
      const showSize = availH >= 52;
      const name = zone.attributes?.name || zoneLabel(zone.type);

      const rows: { text: string; color: string; weight: string; scale: number }[] = [
        { text: name, color: zoneColor(zone.type), weight: "bold", scale: 1 },
      ];
      if (showType) {
        rows.push({ text: zoneLabel(zone.type), color: "#ffffff", weight: "", scale: 0.9 });
      }
      if (showSize) {
        rows.push({
          text: `${widthM.toFixed(0)}m × ${depthM.toFixed(0)}m`,
          color: "#38bdf8",
          weight: "",
          scale: 0.85,
        });
      }

      // Vertical layout, centered on the zone center; ellipsize overflow.
      const rowGap = Math.round(titleFontSize * 1.15);
      const totalH = rowGap * (rows.length - 1);
      rows.forEach((row, i) => {
        const rowFs = Math.max(8, Math.round(titleFontSize * row.scale));
        ctx.font = `${row.weight} ${rowFs}px "JetBrains Mono", monospace`.trim();
        ctx.fillStyle = row.color;
        let text = row.text;
        if (ctx.measureText(text).width > availW) {
          while (text.length > 1 && ctx.measureText(`${text}…`).width > availW) {
            text = text.slice(0, -1);
          }
          text += "…";
        }
        ctx.fillText(text, 0, -totalH / 2 + i * rowGap);
      });
    }
  }

  ctx.restore();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  zone: SpatialZone,
  to: (x: number, y: number) => { px: number; py: number },
  size: number,
  collides: boolean
): void {
  const center = to(zone.position.x, zone.position.y);
  const widthPx = zone.footprint.width * size;
  const depthPx = zone.footprint.depth * size;
  const hwPx = widthPx / 2;
  const hdPx = depthPx / 2;

  ctx.save();
  ctx.translate(center.px, center.py);
  ctx.rotate(deg2rad(zone.rotation));
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = collides ? "#ff6b6b" : "rgba(124, 255, 178, 0.85)";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-hwPx, -hdPx, widthPx, depthPx);
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