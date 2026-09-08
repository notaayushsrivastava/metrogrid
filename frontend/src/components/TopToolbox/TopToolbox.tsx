/**
 * TopToolbox — Primary compact floating urban planning command bar (PRD 5-Category Architecture).
 *
 * Positioned floating at top-center of the city canvas.
 * Organizes planner interactions into 4 primary toolbox categories:
 * 1. TOOLS (Select, Erase, Roads, Terrain)
 * 2. ZONES (Residential, Commercial, Park/Green, Industrial, + Custom)
 * 3. VIEW (Build 3D, Plan Preview, 2D/3D, Subterranean Cutaway)
 * 4. SETTINGS (Theme, Shortcuts, Simulation HUD)
 *
 * Employs progressive disclosure: active/selected category reveals its dedicated sub-toolbar.
 * Clean, technical, architectural, CAD/GIS workstation aesthetic — zero purple.
 */

import { useState, useEffect } from "react";
import {
  Wrench,
  Building2,
  Eye,
  Settings as SettingsIcon,
  MousePointer2,
  Eraser,
  Route,
  Mountain,
  ArrowDown,
  Waves,
  Plus,
  Grid3x3,
  Box,
  Layers,
  Sun,
  Moon,
  Keyboard,
  Disc,
  Sliders,
  X,
  EyeOff,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Magnet,
  Activity,
} from "lucide-react";
import type { ToolId } from "../../types/city";
import type { TerrainEditMode } from "../../types/spatial";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type ToolboxCategory = "tools" | "zones" | "view" | "settings";

interface TopToolboxProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  isBuildRoute?: boolean;
  onToggleBuildRoute?: (isBuild: boolean) => void;
  view3d?: boolean;
  onToggle3d?: () => void;
  terrainMode: TerrainEditMode;
  onTerrainModeChange: (mode: TerrainEditMode) => void;
  terrainRadius: number;
  onTerrainRadiusChange: (r: number) => void;
  terrainStrength: number;
  onTerrainStrengthChange: (s: number) => void;
  onOpenCustomZoneModal: () => void;
  onOpenShortcuts: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  hideZones?: boolean;
  onToggleHideZones?: () => void;
  viewCutawayLevel?: number | null;
  onViewCutawayLevelChange?: (lvl: number | null) => void;
  cameraFov?: number;
  onCameraFovChange?: (fov: number) => void;
  onCameraPreset?: (preset: "top" | "iso" | "street" | "reset") => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  showGridOverlay?: boolean;
  onToggleGridOverlay?: () => void;
  showTraffic?: boolean;
  onToggleTraffic?: () => void;
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
}

export function TopToolbox({
  activeTool,
  onSelectTool,
  isBuildRoute = true,
  onToggleBuildRoute: _onToggleBuildRoute,
  view3d = false,
  onToggle3d,
  terrainMode,
  onTerrainModeChange,
  terrainRadius,
  onTerrainRadiusChange,
  terrainStrength,
  onTerrainStrengthChange,
  onOpenCustomZoneModal,
  onOpenShortcuts,
  theme,
  onToggleTheme,
  hideZones = false,
  onToggleHideZones,
  viewCutawayLevel = null,
  onViewCutawayLevelChange,
  cameraFov = 45,
  onCameraFovChange,
  onCameraPreset,
  onZoomIn,
  onZoomOut,
  showGridOverlay = true,
  onToggleGridOverlay,
  showTraffic = true,
  onToggleTraffic,
  snapEnabled = true,
  onToggleSnap,
}: TopToolboxProps) {
  // Infer active category from the selected tool or route
  const getInitialCategory = (): ToolboxCategory => {
    if (!isBuildRoute) return "view";
    if (["residential", "commercial", "green", "industrial"].includes(activeTool)) return "zones";
    if (activeTool.startsWith("terrain_") || activeTool.startsWith("road_") || ["select", "erase"].includes(activeTool)) return "tools";
    return "tools";
  };

  const [activeCategory, setActiveCategory] = useState<ToolboxCategory | null>(getInitialCategory);
  const [roadSubmenuOpen, setRoadSubmenuOpen] = useState(activeTool.startsWith("road_"));

  const toggleCategory = (cat: ToolboxCategory) => {
    setActiveCategory((prev) => (prev === cat ? null : cat));
  };

  // Keep category in sync when tool is switched via keyboard shortcut
  useEffect(() => {
    if (!isBuildRoute) {
      if (activeCategory === "tools" || activeCategory === "zones") {
        setActiveCategory("view");
      }
      return;
    }
    if (["residential", "commercial", "green", "industrial"].includes(activeTool)) {
      setActiveCategory("zones");
      setRoadSubmenuOpen(false);
    } else if (["select", "erase", "road_local", "road_transit", "road_highway", "terrain_raise", "terrain_lower", "terrain_smooth"].includes(activeTool)) {
      setActiveCategory("tools");
      if (activeTool.startsWith("road_")) setRoadSubmenuOpen(true);
    }
  }, [activeTool, isBuildRoute]);

  const isTerrainActive = isBuildRoute && activeTool.startsWith("terrain_");
  const isRoadActive = isBuildRoute && activeTool.startsWith("road_");

  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 select-none mg-rise max-w-[calc(100vw-24px)]">
      {/* Primary Category Bar */}
      <div className="flex items-center gap-1 rounded-xl border border-border/90 bg-card/95 p-1 shadow-2xl backdrop-blur-md">
        {/* Read-Only Status Badge when in Plan Preview */}
        {!isBuildRoute ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-1 text-xs font-mono font-semibold text-sky-300">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
            <span>Plan Preview • Read Only</span>
          </div>
        ) : (
          <>
            {/* Category 1: TOOLS */}
            <button
              type="button"
              onClick={() => {
                const next = activeCategory === "tools" ? null : "tools";
                setActiveCategory(next);
                if (next === "tools" && activeTool === "select") onSelectTool("select");
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeCategory === "tools"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              aria-pressed={activeCategory === "tools"}
            >
              <Wrench className="size-3.5" />
              <span>Tools</span>
            </button>

            {/* Category 2: ZONES */}
            <button
              type="button"
              onClick={() => {
                const next = activeCategory === "zones" ? null : "zones";
                setActiveCategory(next);
                if (next === "zones" && !["residential", "commercial", "green", "industrial"].includes(activeTool)) {
                  onSelectTool("residential");
                }
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeCategory === "zones"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              aria-pressed={activeCategory === "zones"}
            >
              <Building2 className="size-3.5" />
              <span>Zones</span>
            </button>
          </>
        )}

        {/* Category 3: VIEW */}
        <button
          type="button"
          onClick={() => toggleCategory("view")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
            activeCategory === "view"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
          aria-pressed={activeCategory === "view"}
        >
          <Eye className="size-3.5" />
          <span>View</span>
        </button>

        {/* Category 4: SETTINGS */}
        <button
          type="button"
          onClick={() => toggleCategory("settings")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
            activeCategory === "settings"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
          aria-pressed={activeCategory === "settings"}
        >
          <SettingsIcon className="size-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {/* Progressive Disclosure Sub-Toolbar (Only rendered when a category is open) */}
      {activeCategory !== null && (
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-border/80 bg-card/90 px-2 py-1.5 shadow-xl backdrop-blur-md">
        {/* =========================================================================
            CATEGORY 1: TOOLS SUB-BAR
            ========================================================================= */}
        {activeCategory === "tools" && !isTerrainActive && (
          <div className="flex items-center gap-1">
            {/* Select Tool */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onSelectTool("select");
                    setRoadSubmenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeTool === "select"
                      ? "bg-secondary border border-primary/40 text-foreground font-bold shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  }`}
                >
                  <MousePointer2 className="size-3.5 text-slate-400" />
                  <span>Select</span>
                  <kbd className="text-[10px] text-faint font-mono">V</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>Select & inspect structures or roads (V)</TooltipContent>
            </Tooltip>

            {/* Erase Tool */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onSelectTool("erase");
                    setRoadSubmenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeTool === "erase"
                      ? "bg-rose-500/20 border border-rose-500/50 text-rose-300 font-bold shadow-sm"
                      : "text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                  }`}
                >
                  <Eraser className="size-3.5 text-rose-400" />
                  <span>Erase</span>
                  <kbd className="text-[10px] text-faint font-mono">X</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>Erase tile or zone (X)</TooltipContent>
            </Tooltip>

            <div className="mx-1 h-3.5 w-[1px] bg-border/80" />

            {/* Roads Tool Group */}
            <div className="flex items-center rounded-lg bg-secondary/50 p-0.5 border border-border/60">
              <button
                type="button"
                onClick={() => {
                  setRoadSubmenuOpen((o) => !o);
                  if (!isRoadActive) onSelectTool("road_local");
                }}
                className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${
                  isRoadActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Route className="size-3.5" />
                <span>Roads</span>
                <ChevronDown className="size-3" />
              </button>

              {roadSubmenuOpen && (
                <div className="flex items-center gap-1 pl-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelectTool("road_local")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          activeTool === "road_local"
                            ? "bg-slate-700 text-slate-100 font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Local <kbd className="text-[9px] font-mono">5</kbd>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Local Road 8m width (5)</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelectTool("road_transit")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          activeTool === "road_transit"
                            ? "bg-sky-600 text-white font-bold"
                            : "text-muted-foreground hover:text-sky-300"
                        }`}
                      >
                        Transit <kbd className="text-[9px] font-mono">6</kbd>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Transit Avenue 12m width (6)</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelectTool("road_highway")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          activeTool === "road_highway"
                            ? "bg-amber-600 text-white font-bold"
                            : "text-muted-foreground hover:text-amber-300"
                        }`}
                      >
                        Highway <kbd className="text-[9px] font-mono">7</kbd>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Express Highway 16m width (7)</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            <div className="mx-1 h-3.5 w-[1px] bg-border/80" />

            {/* Terrain Brush Mode Trigger */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onSelectTool("terrain_raise");
                    setRoadSubmenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    isTerrainActive
                      ? "bg-sky-500/20 border border-sky-500/50 text-sky-300 font-bold shadow-sm"
                      : "text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10"
                  }`}
                >
                  <Mountain className="size-3.5 text-sky-400" />
                  <span>Terrain</span>
                  <kbd className="text-[10px] text-faint font-mono">T</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>Edit 3D Terrain elevation (T / G / H)</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 1: TERRAIN ACTIVE CONTEXTUAL BAR
            ========================================================================= */}
        {activeCategory === "tools" && isTerrainActive && (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1 font-bold text-sky-400">
              <Mountain className="size-3.5 animate-pulse" />
              <span>Terrain:</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onTerrainModeChange("raise");
                  onSelectTool("terrain_raise");
                }}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  terrainMode === "raise"
                    ? "bg-sky-500 text-white font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Mountain className="size-3" />
                <span>Raise (T)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onTerrainModeChange("lower");
                  onSelectTool("terrain_lower");
                }}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  terrainMode === "lower"
                    ? "bg-rose-500 text-white font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <ArrowDown className="size-3" />
                <span>Lower (G)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onTerrainModeChange("smooth");
                  onSelectTool("terrain_smooth");
                }}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  terrainMode === "smooth"
                    ? "bg-cyan-500 text-slate-950 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Waves className="size-3" />
                <span>Smooth (H)</span>
              </button>
            </div>

            <div className="mx-1 h-3.5 w-[1px] bg-border/80" />

            {/* Brush Radius Slider */}
            <div className="flex items-center gap-1.5">
              <Disc className="size-3 text-sky-400" />
              <span className="font-mono text-[10px] text-muted-foreground">R: <strong className="text-foreground">{terrainRadius}m</strong></span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={terrainRadius}
                onChange={(e) => onTerrainRadiusChange(Number.parseInt(e.target.value, 10))}
                className="w-12 h-1 bg-secondary rounded appearance-none cursor-pointer accent-sky-400"
              />
            </div>

            {/* Brush Strength Slider */}
            <div className="flex items-center gap-1.5">
              <Sliders className="size-3 text-sky-400" />
              <span className="font-mono text-[10px] text-muted-foreground">S: <strong className="text-foreground">+{terrainStrength}m</strong></span>
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.5}
                value={terrainStrength}
                onChange={(e) => onTerrainStrengthChange(Number.parseFloat(e.target.value))}
                className="w-12 h-1 bg-secondary rounded appearance-none cursor-pointer accent-sky-400"
              />
            </div>

            <div className="mx-1 h-3.5 w-[1px] bg-border/80" />

            <button
              type="button"
              onClick={() => onSelectTool("select")}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors"
              title="Close Terrain Tool (Esc)"
            >
              <X className="size-3" />
              <span>Exit</span>
            </button>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 2: ZONES SUB-BAR
            ========================================================================= */}
        {activeCategory === "zones" && (
          <div className="flex items-center gap-1">
            {/* Residential */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectTool("residential")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeTool === "residential"
                      ? "bg-[#7cffb2]/20 border border-[#7cffb2]/60 text-[#7cffb2] shadow-sm"
                      : "text-muted-foreground hover:text-[#7cffb2] hover:bg-[#7cffb2]/10"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-[#7cffb2]" />
                  <span>Residential</span>
                  <kbd className="text-[10px] text-faint font-mono">1</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>Residential Housing Zone (1)</TooltipContent>
            </Tooltip>

            {/* Commercial */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectTool("commercial")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeTool === "commercial"
                      ? "bg-[#38bdf8]/20 border border-[#38bdf8]/60 text-[#38bdf8] shadow-sm"
                      : "text-muted-foreground hover:text-[#38bdf8] hover:bg-[#38bdf8]/10"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-[#38bdf8]" />
                  <span>Commercial</span>
                  <kbd className="text-[10px] text-faint font-mono">2</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>Commercial Business Zone (2)</TooltipContent>
            </Tooltip>

            {/* Park / Green */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectTool("green")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeTool === "green"
                      ? "bg-[#34d399]/20 border border-[#34d399]/60 text-[#34d399] shadow-sm"
                      : "text-muted-foreground hover:text-[#34d399] hover:bg-[#34d399]/10"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
                  <span>Park</span>
                  <kbd className="text-[10px] text-faint font-mono">3</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>Park & Green Leisure Space (3)</TooltipContent>
            </Tooltip>

            {/* Industrial */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectTool("industrial")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeTool === "industrial"
                      ? "bg-[#ffd166]/20 border border-[#ffd166]/60 text-[#ffd166] shadow-sm"
                      : "text-muted-foreground hover:text-[#ffd166] hover:bg-[#ffd166]/10"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
                  <span>Industrial</span>
                  <kbd className="text-[10px] text-faint font-mono">4</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>Industrial Factory & Warehouse Zone (4)</TooltipContent>
            </Tooltip>

            <div className="mx-1 h-3.5 w-[1px] bg-border/80" />

            {/* Add Custom Zone */}
            <button
              type="button"
              onClick={onOpenCustomZoneModal}
              className="flex items-center gap-1 rounded-lg border border-dashed border-primary/50 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="size-3.5" />
              <span>Custom Zone</span>
            </button>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 3: VIEW SUB-BAR
            ========================================================================= */}
        {activeCategory === "view" && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            {/* 2D / 3D Mode Toggle (when on Plan Preview route) */}
            {!isBuildRoute && onToggle3d && (
              <div className="flex items-center rounded-lg bg-secondary/60 p-0.5 border border-border/80 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (view3d) onToggle3d();
                  }}
                  className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                    !view3d
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  2D Plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!view3d) onToggle3d();
                  }}
                  className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                    view3d
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Box className="inline size-3.5 mr-1" />
                  3D Grid
                </button>
              </div>
            )}

            {/* Camera FOV Control */}
            <div className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-2.5 py-1 border border-border/80">
              <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                FOV
              </span>
              <span className="font-mono text-[11px] font-bold text-foreground min-w-[26px] text-center">
                {cameraFov}°
              </span>
              <input
                type="range"
                min={25}
                max={85}
                step={5}
                value={cameraFov}
                onChange={(e) => onCameraFovChange?.(Number.parseInt(e.target.value, 10))}
                className="w-14 h-1 bg-secondary rounded appearance-none cursor-pointer accent-sky-400"
                title="Adjust Camera Field of View (25° - 85°)"
              />
              <div className="flex items-center gap-0.5 ml-1 border-l border-border/60 pl-1.5">
                <button
                  type="button"
                  onClick={() => onCameraFovChange?.(30)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold transition-colors ${
                    cameraFov === 30
                      ? "bg-sky-500 text-white font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title="Telephoto / Architectural (30°)"
                >
                  30°
                </button>
                <button
                  type="button"
                  onClick={() => onCameraFovChange?.(45)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold transition-colors ${
                    cameraFov === 45
                      ? "bg-sky-500 text-white font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title="Standard perspective (45°)"
                >
                  45°
                </button>
                <button
                  type="button"
                  onClick={() => onCameraFovChange?.(65)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold transition-colors ${
                    cameraFov === 65
                      ? "bg-sky-500 text-white font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title="Wide perspective (65°)"
                >
                  65°
                </button>
              </div>
            </div>

            {/* Zoom & Camera Angle Presets */}
            <div className="flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5 border border-border/80">
              {onZoomIn && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onZoomIn}
                      className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label="Zoom In"
                    >
                      <ZoomIn className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom In</TooltipContent>
                </Tooltip>
              )}

              {onZoomOut && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onZoomOut}
                      className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label="Zoom Out"
                    >
                      <ZoomOut className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom Out</TooltipContent>
                </Tooltip>
              )}

              <div className="mx-0.5 h-3.5 w-[1px] bg-border/80" />

              {/* Angle Presets */}
              <button
                type="button"
                onClick={() => onCameraPreset?.("top")}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Top-Down Plan View (90°)"
              >
                Top-Down
              </button>
              <button
                type="button"
                onClick={() => onCameraPreset?.("iso")}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="45° Isometric CAD Angle"
              >
                Isometric
              </button>
              <button
                type="button"
                onClick={() => onCameraPreset?.("street")}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Low Street Angle Perspective"
              >
                Street
              </button>
              <button
                type="button"
                onClick={() => onCameraPreset?.("reset")}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Reset Camera to Default Orbit"
              >
                <RotateCcw className="size-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* Subterranean Cutaway Level Filter (in 3D mode) */}
            {isBuildRoute && onViewCutawayLevelChange && (
              <div className="flex items-center rounded-lg bg-secondary/60 p-0.5 border border-border/80 text-xs">
                <Layers className="size-3.5 text-muted-foreground ml-1.5 mr-0.5" />
                <button
                  type="button"
                  onClick={() => onViewCutawayLevelChange(null)}
                  className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                    viewCutawayLevel === null
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title="Show all elevation levels (flyovers, surface, subterranean)"
                >
                  All Levels
                </button>
                <button
                  type="button"
                  onClick={() => onViewCutawayLevelChange(0)}
                  className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                    viewCutawayLevel === 0
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title="Hide elevated bridges to inspect surface level (L0 & Below)"
                >
                  L0 & Below
                </button>
                <button
                  type="button"
                  onClick={() => onViewCutawayLevelChange(-1)}
                  className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                    viewCutawayLevel === -1
                      ? "bg-sky-500 text-white shadow-sm font-bold"
                      : "text-muted-foreground hover:text-sky-300 hover:bg-accent"
                  }`}
                  title="View under the map: transparent ground to view subterranean tunnels"
                >
                  Subterranean
                </button>
              </div>
            )}

            {/* Layer Toggles: Zones Visibility & Structural Grid Overlay */}
            <div className="flex items-center gap-1">
              {onToggleHideZones && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onToggleHideZones}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border ${
                        hideZones
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                          : "bg-secondary/60 border-border/80 text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      {hideZones ? <EyeOff className="size-3 text-amber-300" /> : <Eye className="size-3" />}
                      <span>{hideZones ? "Zones Hidden" : "Zones"}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{hideZones ? "Show Building Zones" : "Hide Zones to inspect street traffic flow"}</TooltipContent>
                </Tooltip>
              )}

              {onToggleGridOverlay && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onToggleGridOverlay}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border ${
                        showGridOverlay
                          ? "bg-sky-500/15 border-sky-500/40 text-sky-300 font-bold"
                          : "bg-secondary/60 border-border/80 text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <Grid3x3 className="size-3" />
                      <span>Grid</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{showGridOverlay ? "Hide Structural Grid Lines" : "Show Structural Grid Lines"}</TooltipContent>
                </Tooltip>
              )}

              {onToggleTraffic && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onToggleTraffic}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border ${
                        showTraffic
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold"
                          : "bg-secondary/60 border-border/80 text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <Activity className={`size-3 ${showTraffic ? "text-emerald-400" : "text-muted-foreground"}`} />
                      <span>Traffic</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {showTraffic
                      ? "Hide Traffic Flow Info & Disable Road Flashing Animation"
                      : "Show Traffic Flow Info & Enable Road Flashing Animation"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 4: SETTINGS SUB-BAR
            ========================================================================= */}
        {activeCategory === "settings" && (
          <div className="flex items-center gap-2">
            {/* Cursor Snapping Toggle */}
            {onToggleSnap && (
              <button
                type="button"
                onClick={onToggleSnap}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  snapEnabled
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-300 font-semibold"
                    : "border-border bg-secondary/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title="Toggle cursor grid & angle snapping on rotate, resize, and translate handles"
              >
                <Magnet className="size-3.5 text-sky-400" />
                <span>Cursor Snap: {snapEnabled ? "ON (15°/1m)" : "OFF"}</span>
              </button>
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
            >
              {theme === "dark" ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5 text-sky-400" />}
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>

            {/* Keyboard Shortcuts Dialog Trigger */}
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
            >
              <Keyboard className="size-3.5 text-primary" />
              <span>Shortcuts</span>
              <kbd className="text-[10px] text-faint font-mono">⌘K</kbd>
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

