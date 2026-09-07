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
import { zoneColor, zoneCorners, zoneLabel, zoneOverlaps, resizeFromCorner } from "../../utils/spatial";
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
        time
      );
    }

    // 2. Draw Active Road Creation Polyline Draft
    if (draftRoadPointsRef.current.length > 0) {
      drawRoadDraft(ctx, draftRoadPointsRef.current, ghostRef.current, to, size);
    }

    // 2.5 Draw Terrain Brush Preview Circle
    if (p.activeTool.startsWith("terrain_") && ghostRef.current) {
      const brushPx = to(ghostRef.current.x, ghostRef.current.y);
      const rPx = (p.terrainRadius ?? 2) * size;
      ctx.save();
      ctx.beginPath();
      ctx.arc(brushPx.px, brushPx.py, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = p.activeTool === "terrain_raise" ? "#38bdf8" : p.activeTool === "terrain_lower" ? "#f43f5e" : "#a855f7";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.fillStyle = p.activeTool === "terrain_raise" ? "rgba(56, 189, 248, 0.15)" : p.activeTool === "terrain_lower" ? "rgba(244, 63, 94, 0.15)" : "rgba(168, 85, 247, 0.15)";
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw Freeform Spatial Zones (hidden when hideZones is enabled)
    if (!p.hideZones) {
      for (let i = p.zones.length - 1; i >= 0; i--) {
        drawZone(ctx, p.zones[i], to, size, p.zones[i].id === selRef.current);
      }
    }


    // 4. Ghost Footprint for Zone placement
    if (
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
        } else if (d.kind === "roadNode") {
          const r = roadsRef.current.find((rd) => rd.id === d.roadId);
          if (r) {
            const newPts = [...r.points];
            newPts[d.nodeIndex] = { x: world.x, y: world.y };
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

      // 1. If road tool active, add vertex to draft road
      if (p.freeformMode && isRoadToolActive(p.activeTool)) {
        draftRoadPointsRef.current.push({ x: world.x, y: world.y });
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
          props.freeformMode || props.activeTool === "select" || props.activeTool.startsWith("terrain_")
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
  time: number
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
    ctx.strokeStyle = selected ? "#ffd166" : "#a855f7";
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
  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.px, pt.py);
    else ctx.lineTo(pt.px, pt.py);
  });
  ctx.setLineDash([8, 12]);
  ctx.lineDashOffset = -time * 30;
  ctx.strokeStyle = isTunnel ? "#c084fc" : road.type === 43 ? "#ffd166" : isElevated ? "#38bdf8" : "#7cffb2";
  ctx.lineWidth = Math.max(1.5, strokeWidthPx * 0.25);
  ctx.stroke();
  ctx.setLineDash([]);

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
    ctx.strokeStyle = isElevated ? "#38bdf8" : isTunnel ? "#a855f7" : isRamp ? "#f59e0b" : "#64748b";
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX - textWidth / 2 - 4, badgeY - 12, textWidth + 8, 14);

    ctx.fillStyle = selected ? "#ffd166" : isElevated ? "#38bdf8" : isTunnel ? "#c084fc" : isRamp ? "#fcd34d" : "#e2e8f0";
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
  const corners = zoneCorners(zone).map((c) => to(c.x, c.y));
  const color = zoneColor(zone.type);
  const center = to(zone.position.x, zone.position.y);

  ctx.save();
  ctx.beginPath();
  corners.forEach((c, i) => {
    if (i === 0) ctx.moveTo(c.px, c.py);
    else ctx.lineTo(c.px, c.py);
  });
  ctx.closePath();

  // Blueprint background fill
  ctx.fillStyle = hexToRgba(color, 0.22);
  ctx.fill();

  // Technical crosshatch inside zone
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = -200; d < 200; d += 12) {
    ctx.moveTo(center.px + d - 200, center.py - 200);
    ctx.lineTo(center.px + d + 200, center.py + 200);
  }
  ctx.stroke();
  ctx.restore();

  // Technical double border
  ctx.strokeStyle = selected ? "#ffd166" : color;
  ctx.lineWidth = selected ? 2.5 : 1.6;
  ctx.stroke();

  // Inner dashed technical drafting line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Corner nodes
  corners.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.px, c.py, selected ? HANDLE_R : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#ffd166" : "#38bdf8";
    ctx.fill();
  });

  // Center registration tick
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(center.px - 5, center.py);
  ctx.lineTo(center.px + 5, center.py);
  ctx.moveTo(center.px, center.py - 5);
  ctx.lineTo(center.px, center.py + 5);
  ctx.stroke();

  // Blueprint Zone Text Callout
  const code = ZONE_CODES[zone.type] || "BLD-01";
  const label = zoneLabel(zone.type);
  const area = Math.round(zone.footprint.width * zone.footprint.depth);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.max(10, Math.round(size * 0.45))}px "JetBrains Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText(`[${code}] ${label.toUpperCase()}`, center.px, center.py - 10);

  if (size > 14) {
    ctx.fillStyle = "#38bdf8";
    ctx.font = `${Math.max(8, Math.round(size * 0.32))}px "JetBrains Mono", monospace`;
    ctx.fillText(
      `${zone.footprint.width.toFixed(1)}m × ${zone.footprint.depth.toFixed(1)}m (${area}m²)`,
      center.px,
      center.py + 12
    );
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