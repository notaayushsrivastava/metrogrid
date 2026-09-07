/**
 * TerrainToolPanel — compact floating toolbar for brush size, strength, and terrain mode.
 * (MetroGrid Phase 8 — Terrain and Elevation).
 */

import type { TerrainEditMode } from "../../types/spatial";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mountain, ArrowDown, Waves, Sliders, Disc, X } from "lucide-react";

interface TerrainToolPanelProps {
  mode: TerrainEditMode;
  onModeChange: (mode: TerrainEditMode) => void;
  radius: number;
  onRadiusChange: (r: number) => void;
  strength: number;
  onStrengthChange: (s: number) => void;
  onClose?: () => void;
}

export function TerrainToolPanel({
  mode,
  onModeChange,
  radius,
  onRadiusChange,
  strength,
  onStrengthChange,
  onClose,
}: TerrainToolPanelProps) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-xl border border-sky-500/40 bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur-md select-none mg-rise text-xs">
      <div className="flex items-center gap-1.5 font-bold text-sky-400">
        <Mountain className="size-4 animate-pulse" />
        <span>Terrain Brush</span>
      </div>

      <div className="h-4 w-[1px] bg-border" />

      {/* Brush Mode Selectors */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant={mode === "raise" ? "default" : "secondary"}
          size="sm"
          onClick={() => onModeChange("raise")}
          className={`gap-1 text-xs h-7 px-2.5 ${mode === "raise" ? "bg-sky-500 hover:bg-sky-600 font-bold" : ""}`}
        >
          <Mountain className="size-3" />
          <span>Raise</span>
        </Button>
        <Button
          type="button"
          variant={mode === "lower" ? "default" : "secondary"}
          size="sm"
          onClick={() => onModeChange("lower")}
          className={`gap-1 text-xs h-7 px-2.5 ${mode === "lower" ? "bg-rose-500 hover:bg-rose-600 font-bold" : ""}`}
        >
          <ArrowDown className="size-3" />
          <span>Lower</span>
        </Button>
        <Button
          type="button"
          variant={mode === "smooth" ? "default" : "secondary"}
          size="sm"
          onClick={() => onModeChange("smooth")}
          className={`gap-1 text-xs h-7 px-2.5 ${mode === "smooth" ? "bg-purple-500 hover:bg-purple-600 font-bold" : ""}`}
        >
          <Waves className="size-3" />
          <span>Smooth</span>
        </Button>
      </div>

      <div className="h-4 w-[1px] bg-border" />

      {/* Brush Radius Slider */}
      <div className="flex items-center gap-2">
        <label className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
          <Disc className="size-3 text-sky-400" />
          Radius: <span className="font-bold text-foreground">{radius}m</span>
        </label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={radius}
          onChange={(e) => onRadiusChange(Number.parseInt(e.target.value, 10))}
          className="w-16 h-1.5 bg-secondary rounded appearance-none cursor-pointer accent-sky-400"
        />
      </div>

      {/* Brush Strength Slider */}
      <div className="flex items-center gap-2">
        <label className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
          <Sliders className="size-3 text-sky-400" />
          Strength: <span className="font-bold text-foreground">+{strength}m</span>
        </label>
        <input
          type="range"
          min={0.5}
          max={5.0}
          step={0.5}
          value={strength}
          onChange={(e) => onStrengthChange(Number.parseFloat(e.target.value))}
          className="w-16 h-1.5 bg-secondary rounded appearance-none cursor-pointer accent-sky-400"
        />
      </div>

      <Badge variant="success" className="font-mono text-[10px] uppercase font-bold">
        Live Slope & View Physics
      </Badge>

      {onClose && (
        <>
          <div className="h-4 w-[1px] bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
            title="Close terrain tool (Esc)"
            aria-label="Close terrain tool"
          >
            <X className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
