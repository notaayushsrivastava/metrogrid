/**
 * CreateCustomZoneModal — interactive modal for creating custom user-defined zones
 * with custom names, dimensions, floors, density, intensity, and 3D models.
 */

import { useState } from "react";
import type { SpatialZone, ZoneType } from "../../types/spatial";
import { zoneLabel } from "../../utils/spatial";
import { DEFAULT_TILE_METER_SIZE } from "../../utils/freeform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Layers, Sliders, Hash, ArrowUpDown, X, Sparkles } from "lucide-react";

interface CreateCustomZoneModalProps {
  open: boolean;
  onClose: () => void;
  onAddZone: (zone: SpatialZone) => void;
}

const ZONE_OPTIONS: Array<{ type: ZoneType; label: string; color: string }> = [
  { type: 1, label: "Residential", color: "#3b82f6" },
  { type: 2, label: "Commercial", color: "#06b6d4" },
  { type: 3, label: "Park", color: "#22c55e" },
  { type: 5, label: "Industrial", color: "#f59e0b" },
];

export function CreateCustomZoneModal({
  open,
  onClose,
  onAddZone,
}: CreateCustomZoneModalProps) {
  const [name, setName] = useState("Custom Tech Hub");
  const [type, setType] = useState<ZoneType>(2);
  const [floors, setFloors] = useState(8);
  const [density, setDensity] = useState(2.0);
  const [intensity, setIntensity] = useState(1.5);
  const [widthMeters, setWidthMeters] = useState(30.0);
  const [depthMeters, setDepthMeters] = useState(30.0);
  const [rotation] = useState(0);
  const [modelUrl, setModelUrl] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isPark = type === 3;
    const finalFloors = isPark ? 0 : floors;

    const widthCells = Math.max(0.5, widthMeters / DEFAULT_TILE_METER_SIZE);
    const depthCells = Math.max(0.5, depthMeters / DEFAULT_TILE_METER_SIZE);

    const newZone: SpatialZone = {
      id: `z_custom_${Date.now()}`,
      type,
      position: { x: 0, y: 0 }, // Center of world / viewport
      rotation: rotation || 0,
      footprint: {
        width: widthCells,
        depth: depthCells,
      },
      attributes: {
        name: name.trim() || zoneLabel(type),
        floors: finalFloors,
        height: isPark ? 0.15 : Math.max(1, finalFloors) * 3.0,
        density: Math.max(0.1, density),
        developmentIntensity: Math.max(0.5, intensity),
        modelUrl: modelUrl.trim() || undefined,
        model_url: modelUrl.trim() || undefined,
      },
    };

    onAddZone(newZone);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 shadow-2xl backdrop-blur-md select-none mg-rise space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold tracking-wide text-foreground">
                Create Custom Zone
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Configure custom attributes & place a new zone template
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Custom Zone Name */}
          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Hash className="size-3.5 text-primary" />
              Custom Zone Label / Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Innovation Campus, Eco District"
              className="h-9 text-xs bg-background font-medium"
              required
            />
          </div>

          {/* Base Category */}
          <div className="space-y-1.5">
            <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Layers className="size-3.5 text-primary" />
              Zone Category
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {ZONE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => {
                    setType(opt.type);
                    if (opt.type === 3) setFloors(0);
                    else if (floors === 0) setFloors(6);
                  }}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                    type === opt.type
                      ? "border-primary bg-primary/10 text-foreground font-bold shadow-sm"
                      : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Floors (Hidden for Parks) */}
          {type === 3 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-400" />
                Park & Open Green Space
              </span>
              <Badge variant="success" className="font-mono text-[10px]">
                Ground Level (0 Floors)
              </Badge>
            </div>
          ) : (
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
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
                value={floors}
                onChange={(e) => setFloors(Number.parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          )}

          {/* Footprint Dimensions */}
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-foreground">Footprint Dimensions</span>
              <span className="font-mono text-[10px] text-primary font-bold">
                {widthMeters}m × {depthMeters}m ({(widthMeters / 10).toFixed(1)} × {(depthMeters / 10).toFixed(1)} tiles)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="font-mono text-[10px] text-muted-foreground">Width (m)</label>
                <Input
                  type="number"
                  step="5"
                  min="5"
                  value={widthMeters}
                  onChange={(e) => setWidthMeters(Number.parseFloat(e.target.value) || 5)}
                  className="h-8 font-mono text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[10px] text-muted-foreground">Depth (m)</label>
                <Input
                  type="number"
                  step="5"
                  min="5"
                  value={depthMeters}
                  onChange={(e) => setDepthMeters(Number.parseFloat(e.target.value) || 5)}
                  className="h-8 font-mono text-xs bg-background"
                />
              </div>
            </div>
          </div>

          {/* Density & Intensity */}
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
                onChange={(e) => setDensity(Number.parseFloat(e.target.value) || 1.0)}
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
                onChange={(e) => setIntensity(Number.parseFloat(e.target.value) || 1.0)}
                className="h-8 font-mono text-xs bg-background"
              />
            </div>
          </div>

          {/* Optional Custom 3D Model URL */}
          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground">Custom 3D Model (.glb / .gltf)</label>
            <Input
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              placeholder="https://.../building.glb (Optional)"
              className="h-8 font-mono text-[11px] bg-background"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border/60">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="default" size="sm" className="gap-1.5 font-bold">
              <PlusCircle className="size-4" />
              Add Custom Zone
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
