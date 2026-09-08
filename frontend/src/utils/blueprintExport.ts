/**
 * Blueprint Export Utility
 * Renders a high-resolution, full-detail architectural blueprint schematic
 * of the city (grid tiles, freeform zones, roads, terrain contours, technical title block,
 * scale bar, north arrow, and legend) and triggers browser download as PNG.
 */

import type { GridState, GlobalScores } from "../types/city";
import type { SpatialZone, SpatialRoad } from "../types/spatial";
import { TILE_META } from "../config/tiles";
import { zoneColor, zoneLabel, deg2rad } from "./spatial";
import { getRoadLevel } from "./freeformRoads";
import { DEFAULT_TILE_METER_SIZE } from "./freeform";

interface ExportBlueprintOptions {
  cityName?: string | null;
  tiles: GridState;
  zones?: SpatialZone[];
  roads?: SpatialRoad[];
  terrain?: Map<string, number>;
  scores?: GlobalScores | null;
  filename?: string;
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

export interface BlueprintLabel {
  id: string;
  x: number;
  y: number;
  localEffect: number;
  category: "zone" | "road_node" | "tile";
  type: number;
  render: (
    ctx: CanvasRenderingContext2D,
    toPx: (wx: number, wy: number) => { x: number; y: number },
    scale: number
  ) => void;
}

export const ROAD_NODE_SYMBOLS: Record<number, string> = {
  43: "HWY",
  42: "TRN",
  41: "LOC",
  4: "ROD",
  40: "PED",
};

export const TILE_NODE_SYMBOLS: Record<number, string> = {
  1: "R",
  2: "C",
  3: "P",
  5: "I",
};

/**
 * Filters repetitive label candidates using spatial clustering and local effect ranking.
 * "if at a single point, more than 5 labels are present, use the one with the highest local effect."
 */
export function filterBlueprintLabels(labels: BlueprintLabel[], radius = 3.2): BlueprintLabel[] {
  if (labels.length <= 1) return labels;

  const suppressed = new Set<string>();

  for (let i = 0; i < labels.length; i++) {
    const l1 = labels[i];
    if (suppressed.has(l1.id)) continue;

    // Find all active candidate neighbors within distance <= radius
    const neighbors: BlueprintLabel[] = [];
    for (let j = 0; j < labels.length; j++) {
      const l2 = labels[j];
      if (suppressed.has(l2.id)) continue;
      const dist = Math.hypot(l1.x - l2.x, l1.y - l2.y);
      if (dist <= radius) {
        neighbors.push(l2);
      }
    }

    // "if at a single point, more than 5 labels are present, use the one with the highest local effect."
    if (neighbors.length > 5) {
      let best = neighbors[0];
      for (let k = 1; k < neighbors.length; k++) {
        const candidate = neighbors[k];
        if (candidate.localEffect > best.localEffect) {
          best = candidate;
        } else if (candidate.localEffect === best.localEffect) {
          const catPriority = (cat: string) => (cat === "zone" ? 3 : cat === "road_node" ? 2 : 1);
          if (catPriority(candidate.category) > catPriority(best.category)) {
            best = candidate;
          } else if (candidate.id < best.id) {
            best = candidate;
          }
        }
      }

      // Suppress all candidates in this congested cluster except the best
      for (const n of neighbors) {
        if (n.id !== best.id) {
          suppressed.add(n.id);
        }
      }
    }
  }

  return labels.filter((l) => !suppressed.has(l.id));
}


export function exportArchitecturalBlueprint(options: ExportBlueprintOptions): void {
  const cityName = options.cityName || "METROPOLIS";
  const scores = options.scores || { livability: 75, traffic: 70, resources: 80 };
  const {
    tiles,
    zones = [],
    roads = [],
    terrain = new Map(),
    filename,
  } = options;

  // 1. Calculate Bounding Box of all elements in meters/units
  let minX = -30;
  let maxX = 30;
  let minY = -30;
  let maxY = 30;
  let hasContent = false;

  const includePt = (x: number, y: number) => {
    if (!hasContent) {
      minX = maxX = x;
      minY = maxY = y;
      hasContent = true;
      return;
    }
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  tiles.forEach((_tile, key) => {
    const [x, y] = key.split(",").map(Number);
    includePt(x, y);
    includePt(x + 1, y + 1);
  });

  zones.forEach((z) => {
    const rad = deg2rad(z.rotation || 0);
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const hw = (z.footprint.width * cos + z.footprint.depth * sin) / 2;
    const hd = (z.footprint.width * sin + z.footprint.depth * cos) / 2;
    includePt(z.position.x - hw, z.position.y - hd);
    includePt(z.position.x + hw, z.position.y + hd);
  });

  roads.forEach((r) => {
    r.points.forEach((p) => {
      includePt(p.x, p.y);
    });
  });

  if (terrain.size > 0) {
    terrain.forEach((_elev, key) => {
      const [x, y] = key.split(",").map(Number);
      includePt(x, y);
    });
  }

  if (typeof document === "undefined") return;

  // 2. High-Resolution Blueprint Canvas Setup (2560x1600 or 16:10 aspect ratio)
  const canvasWidth = 2560;
  const canvasHeight = 1600;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Margins for technical border and title blocks
  const marginX = 140;
  const marginY = 110;
  const drawWidth = canvasWidth - marginX * 2;
  const drawHeight = canvasHeight - marginY * 2 - 80; // Reserve space for title block

  // Determine scaling & centering
  const contentSpanX = Math.max(20, (maxX - minX) * 1.35);
  const contentSpanY = Math.max(20, (maxY - minY) * 1.35);
  const scale = Math.min(drawWidth / contentSpanX, drawHeight / contentSpanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const drawCenterX = marginX + drawWidth / 2;
  const drawCenterY = marginY + drawHeight / 2;

  const toPx = (wx: number, wy: number) => ({
    x: drawCenterX + (wx - centerX) * scale,
    y: drawCenterY + (wy - centerY) * scale,
  });

  const labelCandidates: BlueprintLabel[] = [];

  // 3. Render Blueprint Background
  const bgGrad = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  bgGrad.addColorStop(0, "#08162d");
  bgGrad.addColorStop(1, "#050e1f");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 4. Minor and Major Drafting Grid Lines
  const gridMinorSize = scale * 1.0; // 1 meter minor grid
  const gridMajorSize = scale * 5.0; // 5 meter major grid

  // Fine minor grid
  ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = marginX; x <= canvasWidth - marginX; x += Math.max(12, gridMinorSize)) {
    ctx.moveTo(x, marginY);
    ctx.lineTo(x, canvasHeight - marginY);
  }
  for (let y = marginY; y <= canvasHeight - marginY; y += Math.max(12, gridMinorSize)) {
    ctx.moveTo(marginX, y);
    ctx.lineTo(canvasWidth - marginX, y);
  }
  ctx.stroke();

  // Major architectural grid with coordinate tick marks
  ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = marginX; x <= canvasWidth - marginX; x += Math.max(50, gridMajorSize)) {
    ctx.moveTo(x, marginY);
    ctx.lineTo(x, canvasHeight - marginY);
  }
  for (let y = marginY; y <= canvasHeight - marginY; y += Math.max(50, gridMajorSize)) {
    ctx.moveTo(marginX, y);
    ctx.lineTo(canvasWidth - marginX, y);
  }
  ctx.stroke();

  // Draw '+' intersection ticks on major grid
  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 1.2;
  const tickStep = Math.max(50, gridMajorSize);
  for (let x = marginX; x <= canvasWidth - marginX; x += tickStep) {
    for (let y = marginY; y <= canvasHeight - marginY; y += tickStep) {
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
    }
  }

  // 5. Draw Terrain Contours
  if (terrain.size > 0) {
    terrain.forEach((elev, key) => {
      if (elev <= 0) return;
      const [cx, cy] = key.split(",").map(Number);
      const pt = toPx(cx, cy);
      const r = Math.max(8, scale * 1.5);

      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 189, 248, ${Math.min(0.25, (elev / 20) * 0.25)})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
      ctx.fillText(`+${elev}m`, pt.x + 2, pt.y - 4);
      ctx.restore();
    });
  }

  // 6. Draw Roads (Multi-segment polylines & Grid Roads)
  // 6a. Grid roads
  tiles.forEach((tile, key) => {
    if (tile.type === 4 || tile.type === 40 || tile.type === 41 || tile.type === 42 || tile.type === 43) {
      const [gx, gy] = key.split(",").map(Number);
      const p = toPx(gx, gy);
      const s = scale;

      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(p.x, p.y, s, s);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x, p.y, s, s);

      // Centerline dash
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(p.x + s / 2, p.y);
      ctx.lineTo(p.x + s / 2, p.y + s);
      ctx.moveTo(p.x, p.y + s / 2);
      ctx.lineTo(p.x + s, p.y + s / 2);
      ctx.stroke();
      ctx.restore();
    }
  });

  // 6b. Freeform Roads (Sorted by Infrastructure Level)
  const sortedBlueprintRoads = [...roads].sort((a, b) => {
    const la = a.level ?? 0;
    const lb = b.level ?? 0;
    return la - lb;
  });

  sortedBlueprintRoads.forEach((road) => {
    if (road.points.length < 2) return;
    const pts = road.points.map((pt) => toPx(pt.x, pt.y));
    const roadWidthPx = Math.max(4, (road.width / 10.0) * scale);
    const level = getRoadLevel(road);
    const isElevated = level > 0 || (road.elevation !== undefined && road.elevation > 1.0);
    const isTunnel = level < 0 || (road.elevation !== undefined && road.elevation < -1.0);
    const isRamp = !!road.isRamp;

    ctx.save();

    // Elevated Bridge Drop Shadow & Structural Support Pier Ticks
    if (isElevated) {
      ctx.beginPath();
      pts.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x + 3, pt.y + 5);
        else ctx.lineTo(pt.x + 3, pt.y + 5);
      });
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
      ctx.lineWidth = roadWidthPx + 6;
      ctx.stroke();

      // Pier tick marks
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
        const span = (roadWidthPx / 2) + 5;

        ctx.beginPath();
        ctx.moveTo(midX - Math.cos(angle) * span, midY - Math.sin(angle) * span);
        ctx.lineTo(midX + Math.cos(angle) * span, midY + Math.sin(angle) * span);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Outer road casing
    ctx.beginPath();
    pts.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (isTunnel) {
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = "rgba(168, 85, 247, 0.85)";
    } else if (isRamp) {
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
    } else if (isElevated) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.95)";
    } else {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
    }
    ctx.lineWidth = roadWidthPx + (isElevated ? 6 : 3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Road body
    ctx.beginPath();
    pts.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = isTunnel ? "#080c16" : isElevated ? "#061226" : "#0d1f3b";
    ctx.lineWidth = roadWidthPx;
    ctx.stroke();

    // Centerline drafting dash
    ctx.beginPath();
    pts.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = isTunnel ? "#c084fc" : isRamp ? "#fcd34d" : road.type === 43 ? "#ffd166" : "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  });

  // Collect road network nodes for symbolic labeling
  const roadNodeMap = new Map<string, { x: number; y: number; road: SpatialRoad }>();
  roads.forEach((road) => {
    if (road.points.length < 2) return;
    const registerNode = (pt: { x: number; y: number }) => {
      const key = `${Math.round(pt.x * 2) / 2},${Math.round(pt.y * 2) / 2}`;
      const existing = roadNodeMap.get(key);
      if (!existing || (road.type === 43 && existing.road.type !== 43) || (road.type === 42 && existing.road.type < 42)) {
        roadNodeMap.set(key, { x: pt.x, y: pt.y, road });
      }
    };
    registerNode(road.points[0]);
    registerNode(road.points[road.points.length - 1]);
    if (road.points.length > 2) {
      for (let i = 1; i < road.points.length - 1; i++) {
        registerNode(road.points[i]);
      }
    }
  });

  roadNodeMap.forEach(({ x, y, road }, key) => {
    const level = getRoadLevel(road);
    const isElevated = level > 0;
    const isTunnel = level < 0;
    const isRamp = !!road.isRamp;
    const levelBonus = Math.abs(level) * 20;

    let baseEffect = 45;
    if (road.type === 43) baseEffect = 95;
    else if (road.type === 42) baseEffect = 80;
    else if (road.type === 4) baseEffect = 55;
    else if (road.type === 40) baseEffect = 30;

    labelCandidates.push({
      id: `road_node_${key}`,
      x,
      y,
      localEffect: baseEffect + levelBonus,
      category: "road_node",
      type: road.type,
      render: (ctx, toPx, scale) => {
        const p = toPx(x, y);
        const symbolText = ROAD_NODE_SYMBOLS[road.type] || "ROD";
        const badgeText = isRamp ? "RMP" : symbolText;
        const levelTag = isElevated ? `+${level}` : isTunnel ? `${level}` : "";
        const fullText = levelTag ? `${badgeText} ${levelTag}` : badgeText;

        ctx.save();
        const fontSize = Math.max(8, Math.min(10, Math.round(scale * 0.28)));
        ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textWidth = ctx.measureText ? ctx.measureText(fullText).width : fullText.length * fontSize * 0.6;
        const badgeW = Math.max(22, textWidth + 8);
        const badgeH = Math.max(14, fontSize + 6);

        ctx.fillStyle = "rgba(7, 21, 43, 0.92)";
        ctx.fillRect(p.x - badgeW / 2, p.y - badgeH / 2, badgeW, badgeH);

        ctx.strokeStyle = isTunnel ? "#c084fc" : isRamp ? "#f59e0b" : road.type === 43 ? "#ffd166" : isElevated ? "#38bdf8" : "#94a3b8";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(p.x - badgeW / 2, p.y - badgeH / 2, badgeW, badgeH);

        ctx.fillStyle = isTunnel ? "#e9d5ff" : isRamp ? "#fcd34d" : road.type === 43 ? "#fef08a" : isElevated ? "#bae6fd" : "#f8fafc";
        ctx.fillText(fullText, p.x, p.y);
        ctx.restore();
      },
    });
  });

  // 7. Draw Grid Tiles (Non-road zones)
  tiles.forEach((tile, key) => {
    if (tile.type !== 4 && tile.type !== 40 && tile.type !== 41 && tile.type !== 42 && tile.type !== 43) {
      const [gx, gy] = key.split(",").map(Number);
      const p = toPx(gx, gy);
      const s = scale;
      const meta = TILE_META[tile.type as keyof typeof TILE_META];
      const color = meta ? meta.color : "#38bdf8";

      ctx.save();
      // Translucent blueprint fill
      ctx.fillStyle = "rgba(14, 40, 75, 0.75)";
      ctx.fillRect(p.x + 1, p.y + 1, s - 2, s - 2);

      // Blueprint Crosshatching pattern
      ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let d = -s; d < s * 2; d += 8) {
        ctx.moveTo(p.x + d, p.y);
        ctx.lineTo(p.x + d + s, p.y + s);
      }
      ctx.rect(p.x + 1, p.y + 1, s - 2, s - 2);
      ctx.clip();
      ctx.stroke();
      ctx.restore();

      // Outer double border
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(p.x + 1, p.y + 1, s - 2, s - 2);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(p.x + 3, p.y + 3, s - 6, s - 6);

      // Center cross registration mark
      ctx.strokeStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(p.x + s / 2 - 3, p.y + s / 2);
      ctx.lineTo(p.x + s / 2 + 3, p.y + s / 2);
      ctx.moveTo(p.x + s / 2, p.y + s / 2 - 3);
      ctx.lineTo(p.x + s / 2, p.y + s / 2 + 3);
      ctx.stroke();

      // Repetitive label as symbolic node marker candidate
      if (s >= 14) {
        const localEffect = tile.type === 5 ? 35 : tile.type === 2 ? 30 : tile.type === 1 ? 25 : 15;
        labelCandidates.push({
          id: `tile_${key}`,
          x: gx + 0.5,
          y: gy + 0.5,
          localEffect,
          category: "tile",
          type: tile.type,
          render: (ctx, toPx, scale) => {
            const pt = toPx(gx + 0.5, gy + 0.5);
            const sym = TILE_NODE_SYMBOLS[tile.type] || "?";
            ctx.save();
            const r = Math.max(5, Math.min(8.5, scale * 0.2));
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(7, 21, 43, 0.9)";
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.stroke();

            const fSize = Math.max(7, Math.min(10, Math.round(r * 1.3)));
            ctx.font = `bold ${fSize}px "JetBrains Mono", monospace`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(sym, pt.x, pt.y);
            ctx.restore();
          },
        });
      }
      ctx.restore();
    }
  });

  // 8. Draw Freeform Spatial Zones
  zones.forEach((zone) => {
    const center = toPx(zone.position.x, zone.position.y);
    const color = zoneColor(zone.type);
    const widthPx = zone.footprint.width * scale;
    const depthPx = zone.footprint.depth * scale;
    const hwPx = widthPx / 2;
    const hdPx = depthPx / 2;
    const minDim = Math.min(widthPx, depthPx);

    ctx.save();
    if (ctx.translate && ctx.rotate) {
      ctx.translate(center.x, center.y);
      ctx.rotate(deg2rad(zone.rotation || 0));
    }

    // 1. Blueprint Background Fill (Solid drafting base + tinted category color)
    ctx.fillStyle = "#08162d";
    ctx.fillRect(-hwPx, -hdPx, widthPx, depthPx);
    ctx.fillStyle = hexToRgba(color, 0.28);
    ctx.fillRect(-hwPx, -hdPx, widthPx, depthPx);

    // 2. Technical crosshatch inside clipped zone (only when large enough)
    if (minDim >= 18) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-hwPx, -hdPx, widthPx, depthPx);
      ctx.clip();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const hatchStep = Math.max(10, Math.round(scale * 0.4));
      const maxExtent = hwPx + hdPx;
      for (let d = -maxExtent; d <= maxExtent; d += hatchStep) {
        ctx.moveTo(-hwPx + d, -hdPx);
        ctx.lineTo(-hwPx + d + depthPx, hdPx);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Primary Solid Outer Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.strokeRect(-hwPx, -hdPx, widthPx, depthPx);

    // 4. Subtle Inner Inset Drafting Line (only if zone is large enough)
    if (minDim >= 22) {
      const inset = Math.min(3.5, minDim * 0.08);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-hwPx + inset, -hdPx + inset, widthPx - inset * 2, depthPx - inset * 2);
      ctx.setLineDash([]);
    }

    // 5. Center Registration Tick
    if (minDim >= 26) {
      const tickLen = Math.min(6, minDim * 0.15);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-tickLen, 0);
      ctx.lineTo(tickLen, 0);
      ctx.moveTo(0, -tickLen);
      ctx.lineTo(0, tickLen);
      ctx.stroke();
    }

    // 6. Corner Drafting Ticks
    if (minDim >= 22) {
      const cornersLocal: [number, number][] = [
        [-hwPx, -hdPx],
        [hwPx, -hdPx],
        [hwPx, hdPx],
        [-hwPx, hdPx],
      ];
      cornersLocal.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();
      });
    }

    ctx.restore();

    // 7. Register Zone Label Candidate
    const area = zone.footprint.width * zone.footprint.depth;
    const baseEffect = zone.type === 5 ? 85 : zone.type === 2 ? 75 : zone.type === 1 ? 60 : 40;
    const localEffect = baseEffect + Math.min(100, Math.sqrt(area) * 15);

    labelCandidates.push({
      id: `zone_${zone.id}`,
      x: zone.position.x,
      y: zone.position.y,
      localEffect,
      category: "zone",
      type: zone.type,
      render: (ctx, toPx, scale) => {
        const center = toPx(zone.position.x, zone.position.y);
        ctx.save();
        if (ctx.translate && ctx.rotate) {
          ctx.translate(center.x, center.y);
          ctx.rotate(deg2rad(zone.rotation || 0));
        }

        const widthPx = zone.footprint.width * scale;
        const depthPx = zone.footprint.depth * scale;
        const minDim = Math.min(widthPx, depthPx);

        const code = ZONE_CODES[zone.type] || "BLD-01";
        const label = zone.attributes?.name || zoneLabel(zone.type);
        const widthM = zone.footprint.width * DEFAULT_TILE_METER_SIZE;
        const depthM = zone.footprint.depth * DEFAULT_TILE_METER_SIZE;
        const areaM2 = Math.round(widthM * depthM);

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
            // Tier 3: Full architectural label and real-world meter dimensions
            const titleFontSize = Math.max(9, Math.min(13, Math.round(scale * 0.35)));
            ctx.font = `bold ${titleFontSize}px "JetBrains Mono", monospace`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const showSubtitle = availH >= 42;
            const titleY = showSubtitle ? -Math.round(titleFontSize * 0.65) : 0;
            const fullText = `[${code}] ${label.toUpperCase()}`;
            const measured = ctx.measureText ? ctx.measureText(fullText).width : fullText.length * titleFontSize * 0.6;
            const titleText = measured <= availW ? fullText : `[${code}]`;
            ctx.fillText(titleText, 0, titleY);

            if (showSubtitle) {
              const subFontSize = Math.max(8, titleFontSize - 2);
              ctx.font = `${subFontSize}px "JetBrains Mono", monospace`;
              ctx.fillStyle = "#38bdf8";
              const dimText = `${widthM.toFixed(0)}m × ${depthM.toFixed(0)}m (${areaM2.toLocaleString()}m²)`;
              const shortDimText = `${widthM.toFixed(0)}×${depthM.toFixed(0)}m`;
              const subMeasured = ctx.measureText ? ctx.measureText(dimText).width : dimText.length * subFontSize * 0.6;
              const subText = subMeasured <= availW ? dimText : shortDimText;
              ctx.fillText(subText, 0, Math.round(titleFontSize * 0.85));
            }
          }
        }

        ctx.restore();
      },
    });
  });

  // 8b. Declutter Labels & Node Symbols (Highest Local Effect at Congested Points)
  // "if at a single point, more than 5 labels are present, use the one with the highest local effect."
  const filteredLabels = filterBlueprintLabels(labelCandidates, 3.2);
  filteredLabels.forEach((lbl) => lbl.render(ctx, toPx, scale));

  // 9. Outer Architectural Sheet Border & Registration Frame
  ctx.save();
  // Outer thick frame
  ctx.strokeStyle = "#0284c7";
  ctx.lineWidth = 3;
  ctx.strokeRect(marginX, marginY, canvasWidth - marginX * 2, canvasHeight - marginY * 2);

  // Inner thin frame
  ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(marginX + 8, marginY + 8, canvasWidth - marginX * 2 - 16, canvasHeight - marginY * 2 - 16);

  // Corner L-shaped Crop & Registration Marks
  const cornerSize = 24;
  const drawCorner = (x: number, y: number, dx: number, dy: number) => {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + dy * cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * cornerSize, y);
    ctx.stroke();
  };
  drawCorner(marginX - 6, marginY - 6, 1, 1);
  drawCorner(canvasWidth - marginX + 6, marginY - 6, -1, 1);
  drawCorner(marginX - 6, canvasHeight - marginY + 6, 1, -1);
  drawCorner(canvasWidth - marginX + 6, canvasHeight - marginY + 6, -1, -1);

  // Sheet Grid Alphanumeric Reference Markers along margins
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = "#38bdf8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const numCols = 10;
  const colStep = (canvasWidth - marginX * 2) / numCols;
  for (let i = 0; i < numCols; i++) {
    const label = String(i + 1).padStart(2, "0");
    const x = marginX + colStep * (i + 0.5);
    ctx.fillText(label, x, marginY - 14);
    ctx.fillText(label, x, canvasHeight - marginY + 14);
  }

  const numRows = 8;
  const rowStep = (canvasHeight - marginY * 2) / numRows;
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
  for (let i = 0; i < numRows; i++) {
    const y = marginY + rowStep * (i + 0.5);
    ctx.fillText(letters[i], marginX - 16, y);
    ctx.fillText(letters[i], canvasWidth - marginX + 16, y);
  }
  ctx.restore();

  // 10. Architectural Title Block (Bottom-Right Corner)
  const tbWidth = 540;
  const tbHeight = 175;
  const tbX = canvasWidth - marginX - 8 - tbWidth;
  const tbY = canvasHeight - marginY - 8 - tbHeight;

  ctx.save();
  // Title block backdrop
  ctx.fillStyle = "#091c38";
  ctx.fillRect(tbX, tbY, tbWidth, tbHeight);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(tbX, tbY, tbWidth, tbHeight);

  // Section division lines
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tbX, tbY + 40);
  ctx.lineTo(tbX + tbWidth, tbY + 40);
  ctx.moveTo(tbX, tbY + 80);
  ctx.lineTo(tbX + tbWidth, tbY + 80);
  ctx.moveTo(tbX, tbY + 120);
  ctx.lineTo(tbX + tbWidth, tbY + 120);
  ctx.moveTo(tbX + 340, tbY + 40);
  ctx.lineTo(tbX + 340, tbY + tbHeight);
  ctx.stroke();

  // Title Block Typography
  ctx.font = "bold 13px monospace";
  ctx.fillStyle = "#38bdf8";
  ctx.textAlign = "left";
  ctx.fillText("METROGRID URBAN SYSTEMS • MASTER PLAN SCHEMATIC", tbX + 14, tbY + 25);

  ctx.font = "9px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("PROJECT IDENTIFICATION", tbX + 14, tbY + 54);
  ctx.font = "bold 14px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(cityName.toUpperCase(), tbX + 14, tbY + 70);

  ctx.font = "9px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("SHEET & DISCIPLINE", tbX + 350, tbY + 54);
  ctx.font = "bold 12px monospace";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText("ARCH-01 / MASTER PLAN", tbX + 350, tbY + 70);

  ctx.font = "9px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("DATE / SCALE", tbX + 14, tbY + 94);
  ctx.font = "11px monospace";
  ctx.fillStyle = "#f8fafc";
  const now = new Date().toISOString().split("T")[0];
  ctx.fillText(`${now} • SCALE 1:500 (METRIC)`, tbX + 14, tbY + 110);

  ctx.font = "9px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("SYSTEM REVISION", tbX + 350, tbY + 94);
  ctx.font = "11px monospace";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText("REV 2.4-PROD", tbX + 350, tbY + 110);

  // Live Performance Metric Scores in Title Block
  ctx.font = "9px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("SIMULATION METRICS", tbX + 14, tbY + 135);
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = "#4ade80";
  ctx.fillText(`LIV: ${scores.livability}/100`, tbX + 14, tbY + 158);
  ctx.fillStyle = "#38bdf8";
  ctx.fillText(`TRAF: ${scores.traffic}/100`, tbX + 120, tbY + 158);
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(`RES: ${scores.resources}/100`, tbX + 225, tbY + 158);

  // Stamp Box
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tbX + 348, tbY + 126, 180, 42);
  ctx.font = "bold 9px monospace";
  ctx.fillStyle = "#4ade80";
  ctx.textAlign = "center";
  ctx.fillText("APPROVED SCHEMATIC", tbX + 438, tbY + 144);
  ctx.font = "8px monospace";
  ctx.fillStyle = "#86efac";
  ctx.fillText("VALIDATED BY ENGINE", tbX + 438, tbY + 158);
  ctx.restore();

  // 11. North Arrow Compass Rose (Top-Left Corner)
  const compassX = marginX + 45;
  const compassY = marginY + 45;

  ctx.save();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(compassX, compassY, 24, 0, Math.PI * 2);
  ctx.stroke();

  // North arrow polygon
  ctx.beginPath();
  ctx.moveTo(compassX, compassY - 22);
  ctx.lineTo(compassX + 6, compassY + 12);
  ctx.lineTo(compassX, compassY + 4);
  ctx.closePath();
  ctx.fillStyle = "#38bdf8";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(compassX, compassY - 22);
  ctx.lineTo(compassX - 6, compassY + 12);
  ctx.lineTo(compassX, compassY + 4);
  ctx.closePath();
  ctx.fillStyle = "#0d2b52";
  ctx.fill();
  ctx.stroke();

  ctx.font = "bold 13px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("N", compassX, compassY - 28);
  ctx.restore();

  // 12. Graphic Scale Bar (Bottom-Left Corner)
  const scaleBarX = marginX + 30;
  const scaleBarY = canvasHeight - marginY - 30;

  // Determine an appropriate meter increment based on scale (1 cell = 10m = scale pixels)
  let metersPerSegment = 25;
  if (scale >= 25) metersPerSegment = 10;
  else if (scale >= 12) metersPerSegment = 25;
  else if (scale >= 6) metersPerSegment = 50;
  else metersPerSegment = 100;

  const barSegmentW = (metersPerSegment / DEFAULT_TILE_METER_SIZE) * scale;

  ctx.save();
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#38bdf8";
  ctx.textAlign = "center";
  ctx.fillText("METRIC GRAPHIC SCALE", scaleBarX + barSegmentW * 2, scaleBarY - 14);

  for (let i = 0; i < 4; i++) {
    const x = scaleBarX + i * barSegmentW;
    ctx.fillStyle = i % 2 === 0 ? "#38bdf8" : "#0d2347";
    ctx.fillRect(x, scaleBarY, barSegmentW, 8);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, scaleBarY, barSegmentW, 8);

    ctx.font = "9px monospace";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(`${i * metersPerSegment}m`, x, scaleBarY + 20);
  }
  ctx.fillText(`${4 * metersPerSegment}m`, scaleBarX + 4 * barSegmentW, scaleBarY + 20);
  ctx.restore();

  // 13. Blueprint Legend Block (Top-Right Corner)
  const legX = canvasWidth - marginX - 260;
  const legY = marginY + 25;
  ctx.save();
  ctx.fillStyle = "rgba(9, 28, 56, 0.88)";
  ctx.fillRect(legX, legY, 245, 175);
  ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(legX, legY, 245, 175);

  ctx.font = "bold 11px monospace";
  ctx.fillStyle = "#38bdf8";
  ctx.textAlign = "left";
  ctx.fillText("ARCHITECTURAL LEGEND", legX + 12, legY + 20);

  const legendItems = [
    { color: "#38bdf8", sym: "R", code: "RES-01", label: "Residential" },
    { color: "#06b6d4", sym: "C", code: "COM-02", label: "Commercial" },
    { color: "#4ade80", sym: "P", code: "PRK-03", label: "Park & Public" },
    { color: "#f97316", sym: "I", code: "IND-05", label: "Industrial" },
    { color: "#ffd166", sym: "H", code: "HWY-43", label: "Express Highway" },
    { color: "#38bdf8", sym: "T", code: "TRN-42", label: "Transit Artery" },
    { color: "#94a3b8", sym: "S", code: "LOC-41", label: "Local Street" },
  ];

  legendItems.forEach((item, idx) => {
    const itemY = legY + 38 + idx * 19;
    ctx.fillStyle = item.color;
    ctx.fillRect(legX + 12, itemY - 9, 14, 11);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(legX + 12, itemY - 9, 14, 11);

    ctx.font = "bold 9px monospace";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(`[${item.sym}] ${item.label} (${item.code})`, legX + 32, itemY);
  });
  ctx.restore();

  // 14. Trigger PNG Download
  const cleanCity = cityName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const defaultFilename = `${cleanCity || "metrogrid"}_architectural_blueprint.png`;
  const exportName = filename || defaultFilename;

  try {
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = exportName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error("Failed to export architectural blueprint:", err);
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
