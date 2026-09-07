/**
 * App shell — minimal planner layout (PRD §14A, Phase 4 refinement):
 * header (brand · connection · compact scores · GIS import · clear) /
 * left tool sidebar (desktop) or bottom tool bar (mobile) /
 * city canvas dominating the viewport. Canvas-first: GIS lives in a compact
 * contextual sheet so the planner stays visible (PRD Phase 4).
 */

import { useEffect, lazy, useRef, Suspense, useState, useMemo } from "react";
import { MapPlus, Sun, Moon, Grid3x3, Box, Move3D } from "lucide-react";

import { CityCanvas } from "./components/CityCanvas/CityCanvas";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { ModelUpload } from "./components/ModelUpload/ModelUpload";
import { SaveLoadPanel } from "./components/SaveLoadPanel/SaveLoadPanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { TilePalette } from "./components/TilePalette/TilePalette";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { Button } from "./components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { slideDown } from "./lib/motion";
import { toolById } from "./config/tiles";
import { useTheme } from "./hooks/useTheme";
import { useCityPlanner, type ConnectionStatus } from "./state/cityState";
import type { ToolId } from "./types/city";
import type { ZoneType } from "./types/spatial";
import { LandingPage } from "./components/LandingPage/LandingPage";

/** Zone tool → freeform zone type (roads stay grid-authored in Phase 5). */
const ZONE_TOOL_TYPE: Partial<Record<ToolId, ZoneType>> = {
  residential: 1,
  commercial: 2,
  green: 3,
  industrial: 5,
};

// 3D view pulls in three.js + R3F — lazy-load so the initial planner
// (canvas + scoring) stays lean (PRD Phase 5: 3D must not block the core loop).
const CityCanvas3D = lazy(() =>
  import("./components/CityCanvas3D/CityCanvas3D").then((m) => ({
    default: m.CityCanvas3D,
  }))
);
const FreeformCanvas3D = lazy(() =>
  import("./components/FreeformCanvas3D/FreeformCanvas3D").then((m) => ({
    default: m.FreeformCanvas3D,
  }))
);
const GisImportPanel = lazy(() =>
  import("./components/GISImport/GisImportPanel").then((m) => ({
    default: m.GisImportPanel,
  }))
);
import { RoadInspectorPanel } from "./components/RoadInspector/RoadInspectorPanel";
import { ZoneInspectorPanel } from "./components/ZoneInspector/ZoneInspectorPanel";
import { CreateCustomZoneModal } from "./components/ZoneInspector/CreateCustomZoneModal";
import { TerrainToolPanel } from "./components/Terrain/TerrainToolPanel";
import { translateGridToFreeform, translateFreeformToZones } from "./utils/freeform";

const KEY_TO_TOOL: Record<string, ToolId> = {
  v: "select",
  "1": "residential",
  "2": "commercial",
  "3": "green",
  "4": "industrial",
  "5": "road_local",
  "6": "road_transit",
  "7": "road_highway",
  t: "terrain_raise",
  g: "terrain_lower",
  h: "terrain_smooth",
  x: "erase",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "SYNC",
  online: "LIVE",
  offline: "OFFLINE",
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connecting: "#ffd166",
  online: "#7cffb2",
  offline: "#ff6b6b",
};

export default function App() {
  const { theme, toggleTheme } = useTheme();

  if (window.location.pathname === "/") {
    return <LandingPage theme={theme} toggleTheme={toggleTheme} />;
  }

  const planner = useCityPlanner();
  const { state, setTool, placeAt } = planner;
  const tool = toolById(state.tool);
  const [gisOpen, setGisOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [view3d, setView3d] = useState(false);
  const [armedUrl, setArmedUrl] = useState<string | null>(null);
  const [armedName, setArmedName] = useState<string | null>(null);
  const [customZoneOpen, setCustomZoneOpen] = useState(false);
  const [terrainMode, setTerrainMode] = useState<import("./types/spatial").TerrainEditMode>("raise");
  const [terrainRadius, setTerrainRadius] = useState<number>(2);
  const [terrainStrength, setTerrainStrength] = useState<number>(1.0);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [isFreeformRoute, setIsFreeformRoute] = useState(
    window.location.pathname === "/freeform"
  );

  // Sync terrainMode when tool changes
  useEffect(() => {
    if (state.tool === "terrain_raise") setTerrainMode("raise");
    if (state.tool === "terrain_lower") setTerrainMode("lower");
    if (state.tool === "terrain_smooth") setTerrainMode("smooth");
  }, [state.tool]);

  const freeformMeshes = useMemo(() => {
    return translateGridToFreeform(state.tiles, state.zones);
  }, [state.tiles, state.zones]);

  // Sync state freeformMode when route changes
  useEffect(() => {
    if (isFreeformRoute && !state.freeformMode) {
      planner.setFreeform(true);
    } else if (!isFreeformRoute && state.freeformMode) {
      planner.setFreeform(false);
    }
  }, [isFreeformRoute, state.freeformMode, planner]);

  // Handle browser popstate navigation
  useEffect(() => {
    const onPopState = () => {
      setIsFreeformRoute(window.location.pathname === "/freeform");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const armModel = planner.armModel;

  // Keyboard shortcuts (ignored while typing in inputs).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "Escape") {
        if (state.tool.startsWith("terrain_") || state.tool !== "select") {
          setTool("select");
        }
        if (state.selectedZoneId) {
          planner.selectZone(null);
        }
        if (state.selectedRoadId) {
          planner.selectRoad(null);
        }
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedZoneId) {
        planner.removeZone(state.selectedZoneId);
        return;
      }
      const next = KEY_TO_TOOL[event.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool, state.selectedZoneId, state.selectedRoadId, state.tool, planner]);

  useEffect(() => {
    if (state.status === "offline") slideDown(bannerRef.current);
  }, [state.status]);

  const hoverColor =
    state.tool === "erase"
      ? "rgba(248, 113, 113, 0.9)"
      : state.tool === "select"
        ? "rgba(148, 163, 184, 0.6)"
        : "rgba(226, 232, 240, 0.85)";

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        {/* Header */}
        <header className="flex items-center gap-4 border-b border-border bg-card/70 px-4 py-2.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary"
            >
              <Grid3x3 className="size-[18px]" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1
                className="font-display text-sm font-extrabold uppercase tracking-[0.18em] text-foreground"
                translate="no"
              >
                MetroGrid
              </h1>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.3em] text-faint">
                Urban Simulator
              </p>
            </div>
          </div>

          {/* Mode Switcher Route Nav */}
          <div className="flex items-center rounded-lg border border-border bg-secondary/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setIsFreeformRoute(false);
                planner.setFreeform(false);
                window.history.pushState(null, "", "/grid");
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors ${
                !isFreeformRoute
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid3x3 className="size-3.5" aria-hidden="true" />
              <span>Grid Mode</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsFreeformRoute(true);
                planner.setFreeform(true);
                window.history.pushState(null, "", "/freeform");
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors ${
                isFreeformRoute
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Move3D className="size-3.5" aria-hidden="true" />
              <span>Freeform 3D</span>
            </button>
          </div>

          <div
            className="ml-auto flex items-center gap-2"
            role="status"
            aria-label={`Scoring engine: ${STATUS_LABEL[state.status]}`}
          >
            <span
              aria-hidden="true"
              className={
                state.status === "online"
                  ? "mg-live-dot h-2 w-2 rounded-full"
                  : "h-2 w-2 rounded-full"
              }
              style={{ backgroundColor: STATUS_COLOR[state.status] }}
            />
            <span
              className="hidden font-mono text-[10px] font-bold tracking-[0.2em] sm:inline"
              style={{ color: STATUS_COLOR[state.status] }}
            >
              {STATUS_LABEL[state.status]}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Dashboard
              scores={state.scores}
              movement={state.movement}
              calculating={state.calculating}
              congestion={state.congestion}
              variant="chip"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Import Road Layout"
                  onClick={() => setGisOpen(true)}
                >
                  <MapPlus aria-hidden="true" />
                  <span className="hidden sm:inline">Import Road Layout</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import real street polylines and road layout</TooltipContent>

            </Tooltip>
            {!isFreeformRoute && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={view3d ? "default" : "secondary"}
                    size="icon"
                    aria-pressed={view3d}
                    aria-label={view3d ? "Switch to 2D view" : "Switch to 3D view"}
                    title={view3d ? "2D view" : "3D view"}
                    onClick={() => setView3d((v) => !v)}
                  >
                    <Box className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{view3d ? "2D view" : "3D view"}</TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClearOpen(true)}
              aria-label="Clear the city"
            >
              Clear
            </Button>
          </div>
        </header>

        {/* Backend-unavailable banner (PRD §20.1) */}
        {state.status === "offline" && (
          <div
            ref={bannerRef}
            role="alert"
            className="flex items-center gap-3 border-b border-[#ffd166]/30 bg-[#ffd166]/10 px-4 py-2 text-xs text-[#ffd166]"
          >
            <span aria-hidden="true">▲</span>
            <span className="flex-1">
              {state.error ?? "Scoring backend unavailable."} Scores shown may be stale.
            </span>
            <Button variant="destructive" size="sm" onClick={planner.recalculate}>
              Retry
            </Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* Tool rail (desktop) */}
          <aside className="hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card/40 p-3 md:flex">
            <TilePalette
              activeTool={state.tool}
              onSelectTool={setTool}
              onOpenCustomZoneModal={() => setCustomZoneOpen(true)}
            />
            <ModelUpload
              armedUrl={armedUrl}
              armedName={armedName}
              onArm={(url, name) => {
                setArmedUrl(url);
                setArmedName(name);
                armModel(url);
              }}
            />
            <SaveLoadPanel planner={planner} />
            <p className="mt-auto px-1 text-[11px] leading-relaxed text-faint">
              Parks lift nearby housing. Industry harms it. Roads connect
              everything.
            </p>
          </aside>

          {/* City canvas — Freeform 3D route vs Grid 2D/3D route */}
          <main className="mg-backdrop relative min-w-0 flex-1">
            {/* Terrain Brush Tool Panel Overlay */}
            {state.tool.startsWith("terrain_") && (
              <TerrainToolPanel
                mode={terrainMode}
                onModeChange={(m) => {
                  setTerrainMode(m);
                  if (m === "raise") setTool("terrain_raise");
                  else if (m === "lower") setTool("terrain_lower");
                  else if (m === "smooth") setTool("terrain_smooth");
                }}
                radius={terrainRadius}
                onRadiusChange={setTerrainRadius}
                strength={terrainStrength}
                onStrengthChange={setTerrainStrength}
                onClose={() => setTool("select")}
              />
            )}

            {isFreeformRoute ? (
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    Loading Freeform 3D WebGL Canvas…
                  </div>
                }
              >
                <FreeformCanvas3D
                  meshes={freeformMeshes}
                  roads={state.roads}
                  terrain={state.terrain}
                  terrainMode={terrainMode}
                  terrainRadius={terrainRadius}
                  terrainStrength={terrainStrength}
                  onEditTerrain={planner.editTerrain}
                  selectedMeshId={state.selectedZoneId}
                  selectedRoadId={state.selectedRoadId}
                  activeTool={state.tool}
                  onSelectMesh={(id) => planner.selectZone(id)}
                  onSelectRoad={(id) => planner.selectRoad(id)}
                  onAddMesh={(mesh) => {
                    const zones = translateFreeformToZones([mesh]);
                    if (zones.length > 0) planner.addZone(zones[0]);
                  }}
                  onUpdateMesh={(mesh) => {
                    const zones = translateFreeformToZones([mesh]);
                    if (zones.length > 0) planner.resizeZone(zones[0]);
                  }}
                  onRemoveMesh={(id) => planner.removeZone(id)}
                  onAddRoad={(road) => planner.addRoad(road)}
                  onUpdateRoad={(road) => planner.updateRoad(road)}
                  onRemoveRoad={(id) => planner.removeRoad(id)}
                  onGestureStart={planner.beginSpatialGesture}
                  onCommitGesture={planner.commitZones}
                />
              </Suspense>
            ) : view3d ? (
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    Loading 3D view…
                  </div>
                }
              >
                <CityCanvas3D
                  tiles={state.tiles}
                  activeTool={state.tool}
                  onSelect={
                    state.tool === "select" ? (x, y) => placeAt(x, y) : undefined
                  }
                />
              </Suspense>
            ) : (
              <CityCanvas
                tiles={state.tiles}
                toolActive={state.tool !== "select"}
                hoverColor={hoverColor}
                feedbacks={state.feedbacks}
                onPlace={placeAt}
                onBoundsChange={planner.reportBounds}
                zones={state.zones}
                roads={state.roads}
                terrain={state.terrain}
                terrainMode={terrainMode}
                terrainRadius={terrainRadius}
                terrainStrength={terrainStrength}
                onEditTerrain={planner.editTerrain}
                activeTool={state.tool}
                freeformMode={state.freeformMode}
                selectedZoneId={state.selectedZoneId}
                selectedRoadId={state.selectedRoadId}
                onAddZone={(world) => {
                  const type = ZONE_TOOL_TYPE[state.tool] ?? 1;
                  planner.addZone({
                    id: `z${Date.now()}`,
                    type,
                    position: { x: world.x, y: world.y },
                    rotation: 0,
                    footprint: { width: 3, depth: 3 },
                    attributes: {},
                  });
                }}
                onSelectZone={(id) => planner.selectZone(id)}
                onMoveZone={(id, world) => planner.moveZone(id, world)}
                onRotateZone={(id, deg) => planner.rotateZone(id, deg)}
                onResizeZone={(zone) => planner.resizeZone(zone)}
                onGestureStart={planner.beginSpatialGesture}
                onCommitZones={planner.commitZones}
                onRemoveZone={planner.removeZone}
                onAddRoad={(road) => planner.addRoad(road)}
                onSelectRoad={(id) => planner.selectRoad(id)}
                onUpdateRoad={(road) => planner.updateRoad(road)}
                onRemoveRoad={(id) => planner.removeRoad(id)}
              />
            )}

            {/* Selected Zone Inspector Panel Overlay */}
            {state.selectedZoneId && (
              (() => {
                const selectedZone = state.zones.find((z) => z.id === state.selectedZoneId);
                return selectedZone ? (
                  <ZoneInspectorPanel
                    zone={selectedZone}
                    open={Boolean(state.selectedZoneId)}
                    onOpenChange={(open) => {
                      if (!open) planner.selectZone(null);
                    }}
                    onUpdateZone={(zone) => planner.updateZone(zone)}
                    onRemoveZone={(id) => planner.removeZone(id)}
                  />
                ) : null;
              })()
            )}

            {/* Selected Road Inspector Panel Overlay */}
            {state.selectedRoadId && (
              (() => {
                const selectedRoad = state.roads.find((r) => r.id === state.selectedRoadId);
                return selectedRoad ? (
                  <RoadInspectorPanel
                    road={selectedRoad}
                    onUpdate={(road) => planner.updateRoad(road)}
                    onRemove={(id) => planner.removeRoad(id)}
                    onClose={() => planner.selectRoad(null)}
                  />
                ) : null;
              })()
            )}

            {/* Create Custom Zone Modal */}
            <CreateCustomZoneModal
              open={customZoneOpen}
              onClose={() => setCustomZoneOpen(false)}
              onAddZone={(zone) => planner.addZone(zone)}
            />
          </main>
        </div>

        {/* Status rail (wireframe footer): hints + city/save ticker */}
        <StatusBar
          actionHint={
            state.tool === "select"
              ? "Select mode — choose a tool to place zones"
              : `${tool.label} — click a cell${state.tool === "erase" ? " to remove" : ""}`
          }
          city={state.cityName}
          savedAt={state.lastSavedAt}
        />

        {/* Tool bar (mobile) */}
        <nav className="flex items-center gap-2 border-t border-border bg-card/60 px-2 py-2 md:hidden">
          <div className="min-w-0 flex-1">
            <TilePalette activeTool={state.tool} onSelectTool={setTool} layout="row" />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Import map area"
                onClick={() => setGisOpen(true)}
                className="shrink-0"
              >
                <MapPlus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import map area</TooltipContent>
          </Tooltip>
        </nav>

        <Suspense fallback={null}>
          <GisImportPanel open={gisOpen} onOpenChange={setGisOpen} planner={planner} />
        </Suspense>

        <ConfirmDialog
          open={clearOpen}
          onOpenChange={setClearOpen}
          onConfirm={planner.clearCity}
          title="Clear the city?"
          description="This removes every tile from the canvas. This cannot be undone — save your layout first if you want to keep it."
          confirmLabel="Clear city"
        />
      </div>
    </TooltipProvider>
  );
}
