/**
 * ZoneInspectorPanel — compact contextual inspector for editing zone attributes
 * and geometry (PRD Phase 7 — Zone Attributes and Existing-Zone Editing).
 *
 * Rendered as a compact, floating non-blocking sidebar card overlay so planners can
 * select any zone in 2D or 3D view and transform (move, rotate, resize) and edit attributes.
 */

import { useEffect, useState } from "react";
import type { SpatialZone, ZoneType } from "../../types/spatial";
import { zoneColor, zoneLabel } from "../../utils/spatial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Layers,
  RotateCw,
  RotateCcw,
  Trash2,
  Sliders,
  Hash,
  ArrowUpDown,
  X,
  Move,
  Maximize2,
  Compass,
} from "lucide-react";

interface ZoneInspectorPanelProps {
  zone: SpatialZone | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateZone: (zone: SpatialZone) => void;
  onRemoveZone: (id: string) => void;
}

const ZONE_OPTIONS: Array<{ type: ZoneType; label: string; color: string }> = [
  { type: 1, label: "Residential", color: "#3b82f6" },
  { type: 2, label: "Commercial", color: "#06b6d4" },
  { type: 3, label: "Park", color: "#22c55e" },
  { type: 5, label: "Industrial", color: "#f59e0b" },
];

const ROTATION_PRESETS = [0, 45, 90, 180, 270];
const SIZE_PRESETS = [
  { label: "1×1", w: 1, d: 1 },
  { label: "2×2", w: 2, d: 2 },
  { label: "3×3", w: 3, d: 3 },
  { label: "4×4", w: 4, d: 4 },
  { label: "6×4", w: 6, d: 4 },
];

export function ZoneInspectorPanel({
  zone,
  open,
  onOpenChange,
  onUpdateZone,
  onRemoveZone,
}: ZoneInspectorPanelProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ZoneType>(1);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [floors, setFloors] = useState(1);
  const [density, setDensity] = useState(1.0);
  const [intensity, setIntensity] = useState(1.0);
  const [width, setWidth] = useState(3.0);
  const [depth, setDepth] = useState(3.0);
  const [rotation, setRotation] = useState(0);
  const [modelUrl, setModelUrl] = useState("");

  // Populate local form state when zone prop changes
  useEffect(() => {
    if (zone) {
      setName(zone.attributes?.name ?? zoneLabel(zone.type));
      setType(zone.type);
      setPosX(Math.round(zone.position.x * 10) / 10);
      setPosY(Math.round(zone.position.y * 10) / 10);
      setFloors(zone.type === 3 ? 0 : zone.attributes?.floors ?? (zone.type === 1 ? 4 : zone.type === 2 ? 6 : 5));
      setDensity(zone.attributes?.density ?? 1.0);
      setIntensity(zone.attributes?.developmentIntensity ?? 1.0);
      setWidth(Math.round(zone.footprint.width * 10) / 10);
      setDepth(Math.round(zone.footprint.depth * 10) / 10);
      setRotation(Math.round(zone.rotation) % 360);
      setModelUrl(zone.attributes?.modelUrl ?? zone.attributes?.model_url ?? "");
    }
  }, [zone]);

  if (!open || !zone) return null;

  const handleApply = (updates: Partial<{
    name: string;
    type: ZoneType;
    posX: number;
    posY: number;
    floors: number;
    density: number;
    intensity: number;
    width: number;
    depth: number;
    rotation: number;
    modelUrl: string;
  }>) => {
    const nextType = updates.type ?? type;
    const nextName = updates.name ?? name;
    const nextPosX = updates.posX ?? posX;
    const nextPosY = updates.posY ?? posY;
    const isPark = nextType === 3;
    const nextFloors = isPark ? 0 : (updates.floors ?? (floors === 0 ? 4 : floors));
    const nextDensity = updates.density ?? density;
    const nextIntensity = updates.intensity ?? intensity;
    const nextWidth = updates.width ?? width;
    const nextDepth = updates.depth ?? depth;
    let nextRotation = updates.rotation ?? rotation;
    while (nextRotation < 0) nextRotation += 360;
    nextRotation = nextRotation % 360;
    const nextModelUrl = updates.modelUrl ?? modelUrl;

    const updatedZone: SpatialZone = {
      ...zone,
      type: nextType,
      position: { x: nextPosX, y: nextPosY },
      rotation: nextRotation,
      footprint: { width: Math.max(0.5, nextWidth), depth: Math.max(0.5, nextDepth) },
      attributes: {
        ...zone.attributes,
        name: nextName,
        floors: nextFloors,
        height: isPark ? 0.15 : Math.max(1, nextFloors) * 3.0,
        density: nextDensity,
        developmentIntensity: nextIntensity,
        modelUrl: nextModelUrl,
        model_url: nextModelUrl,
      },
    };

    onUpdateZone(updatedZone);
  };

  const handleNudgePosition = (dx: number, dy: number) => {
    const nx = Math.round((posX + dx) * 10) / 10;
    const ny = Math.round((posY + dy) * 10) / 10;
    setPosX(nx);
    setPosY(ny);
    handleApply({ posX: nx, posY: ny });
  };

  const handleNudgeRotation = (delta: number) => {
    let nextRot = (rotation + delta) % 360;
    if (nextRot < 0) nextRot += 360;
    setRotation(nextRot);
    handleApply({ rotation: nextRot });
  };

  const handleNudgeSize = (dw: number, dd: number) => {
    const nw = Math.max(0.5, Math.round((width + dw) * 10) / 10);
    const nd = Math.max(0.5, Math.round((depth + dd) * 10) / 10);
    setWidth(nw);
    setDepth(nd);
    handleApply({ width: nw, depth: nd });
  };

  return (
    <div className="absolute top-16 right-4 z-30 w-80 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md select-none mg-rise">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" aria-hidden="true" />
          <h3 className="font-display text-sm font-bold tracking-wide text-foreground">
            Zone Inspector
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="default"
            className="font-mono text-[10px] uppercase font-bold"
            style={{ backgroundColor: `${zoneColor(type)}20`, color: zoneColor(type), borderColor: `${zoneColor(type)}50` }}
          >
            {zoneLabel(type)}
          </Badge>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close Inspector"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3.5 text-xs">
        {/* Zone Name */}
        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Hash className="size-3.5 text-primary" />
            Zone Label / Name
          </label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              handleApply({ name: e.target.value });
            }}
            placeholder="e.g. Skyline Towers"
            className="h-8 text-xs bg-background"
          />
        </div>

        {/* Zone Type Selector */}
        <div className="space-y-1.5">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" />
            Zone Type
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {ZONE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  setType(opt.type);
                  const isParkType = opt.type === 3;
                  if (isParkType) setFloors(0);
                  else if (floors === 0) setFloors(4);
                  handleApply({ type: opt.type, floors: isParkType ? 0 : floors === 0 ? 4 : floors });
                }}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  type === opt.type
                    ? "border-primary bg-primary/10 text-foreground font-bold shadow-sm"
                    : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary"
                }`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: opt.color }} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* =========================================================================
            SECTION: TRANSFORM (POSITION X / Z)
            ========================================================================= */}
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <Move className="size-3.5 text-primary" />
              Position (X, Z Coordinates)
            </label>
            <span className="font-mono text-[10px] text-muted-foreground">
              {posX}m, {posY}m
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>X Position (m)</span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleNudgePosition(-1, 0)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="Nudge X -1m"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgePosition(1, 0)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="Nudge X +1m"
                  >
                    +1
                  </button>
                </div>
              </div>
              <Input
                type="number"
                step="0.5"
                value={posX}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value) || 0;
                  setPosX(val);
                  handleApply({ posX: val });
                }}
                className="h-7 font-mono text-xs bg-background"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>Z Position (m)</span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleNudgePosition(0, -1)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="Nudge Z -1m"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgePosition(0, 1)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="Nudge Z +1m"
                  >
                    +1
                  </button>
                </div>
              </div>
              <Input
                type="number"
                step="0.5"
                value={posY}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value) || 0;
                  setPosY(val);
                  handleApply({ posY: val });
                }}
                className="h-7 font-mono text-xs bg-background"
              />
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION: ROTATE & ORIENTATION
            ========================================================================= */}
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <Compass className="size-3.5 text-primary" />
              Rotation & Orientation
            </label>
            <div className="flex items-center gap-1 font-mono text-xs font-bold text-primary">
              <span>{rotation}°</span>
              <div className="flex gap-0.5 ml-1">
                <button
                  type="button"
                  onClick={() => handleNudgeRotation(-15)}
                  className="rounded p-0.5 bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Rotate -15°"
                >
                  <RotateCcw className="size-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudgeRotation(15)}
                  className="rounded p-0.5 bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Rotate +15°"
                >
                  <RotateCw className="size-2.5" />
                </button>
              </div>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={355}
            step={5}
            value={rotation}
            onChange={(e) => {
              const val = Number.parseInt(e.target.value, 10) || 0;
              setRotation(val);
              handleApply({ rotation: val });
            }}
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
          />

          {/* Quick Rotation Angle Presets */}
          <div className="grid grid-cols-5 gap-1 pt-0.5">
            {ROTATION_PRESETS.map((deg) => (
              <button
                key={deg}
                type="button"
                onClick={() => {
                  setRotation(deg);
                  handleApply({ rotation: deg });
                }}
                className={`rounded py-0.5 font-mono text-[10px] font-semibold transition-colors border ${
                  rotation === deg
                    ? "border-primary bg-primary/20 text-primary font-bold shadow-xs"
                    : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {deg}°
              </button>
            ))}
          </div>
        </div>

        {/* =========================================================================
            SECTION: RESIZE & FOOTPRINT DIMENSIONS
            ========================================================================= */}
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <Maximize2 className="size-3.5 text-primary" />
              Footprint & Resizing
            </label>
            <span className="font-mono text-xs font-bold text-primary">
              {width}m × {depth}m ({(width * depth).toFixed(0)}m²)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>Width (m)</span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleNudgeSize(-1, 0)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="-1m Width"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSize(1, 0)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="+1m Width"
                  >
                    +1
                  </button>
                </div>
              </div>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="50"
                value={width}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value) || 1;
                  setWidth(val);
                  handleApply({ width: val });
                }}
                className="h-7 font-mono text-xs bg-background"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>Depth (m)</span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleNudgeSize(0, -1)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="-1m Depth"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSize(0, 1)}
                    className="rounded px-1 bg-secondary hover:bg-accent text-[9px]"
                    title="+1m Depth"
                  >
                    +1
                  </button>
                </div>
              </div>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="50"
                value={depth}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value) || 1;
                  setDepth(val);
                  handleApply({ depth: val });
                }}
                className="h-7 font-mono text-xs bg-background"
              />
            </div>
          </div>

          {/* Quick Footprint Presets */}
          <div className="grid grid-cols-5 gap-1 pt-0.5">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setWidth(preset.w);
                  setDepth(preset.d);
                  handleApply({ width: preset.w, depth: preset.d });
                }}
                className={`rounded py-0.5 font-mono text-[10px] font-semibold transition-colors border ${
                  width === preset.w && depth === preset.d
                    ? "border-primary bg-primary/20 text-primary font-bold shadow-xs"
                    : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Floors & Height Slider (Hidden for Parks) */}
        {type === 3 ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 font-medium flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-400" />
              Park & Open Green Space
            </span>
            <Badge variant="success" className="font-mono text-[10px]">
              Ground Level (0 Floors)
            </Badge>
          </div>
        ) : (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-foreground flex items-center gap-1.5">
                <ArrowUpDown className="size-3.5 text-primary" />
                Floors & 3D Height
              </label>
              <span className="font-mono text-xs font-bold text-primary">
                {floors} {floors === 1 ? "Floor" : "Floors"} ({floors * 3}m)
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              value={floors || 1}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10);
                setFloors(val);
                handleApply({ floors: val });
              }}
              className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>1 (3m)</span>
              <span>30 (90m)</span>
              <span>60 (180m)</span>
            </div>
          </div>
        )}

        {/* Density & Intensity Multipliers */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Sliders className="size-3.5 text-primary" />
              Density
            </label>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              max="10.0"
              value={density}
              onChange={(e) => {
                const val = Number.parseFloat(e.target.value) || 1.0;
                setDensity(val);
                handleApply({ density: val });
              }}
              className="h-8 font-mono text-xs bg-background"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Sliders className="size-3.5 text-primary" />
              Intensity
            </label>
            <Input
              type="number"
              step="0.5"
              min="0.5"
              max="5.0"
              value={intensity}
              onChange={(e) => {
                const val = Number.parseFloat(e.target.value) || 1.0;
                setIntensity(val);
                handleApply({ intensity: val });
              }}
              className="h-8 font-mono text-xs bg-background"
            />
          </div>
        </div>

        {/* 3D Custom Model Asset URL */}
        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground">Custom 3D Model (.glb / .gltf)</label>
          <Input
            value={modelUrl}
            onChange={(e) => {
              setModelUrl(e.target.value);
              handleApply({ modelUrl: e.target.value });
            }}
            placeholder="https://.../building.glb"
            className="h-8 font-mono text-[11px] bg-background"
          />
        </div>

        {/* Footer Actions */}
        <div className="pt-1 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onRemoveZone(zone.id);
              onOpenChange(false);
            }}
            className="gap-1.5 text-xs"
          >
            <Trash2 className="size-3.5" />
            Delete Zone
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
