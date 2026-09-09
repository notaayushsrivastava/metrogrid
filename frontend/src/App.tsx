/**
 * App shell — MetroGrid Professional Urban Planning Workstation (PRD 5-Category Architecture).
 *
 * Layout Structure:
 * 1. Streamlined Top Header (Brand, City Name, Mode Switcher, Connection Status, Compact Score Metrics, Project Menu, Search & Settings)
 * 2. Floating Top Toolbox (Tools, Zones, View, Settings with progressive disclosure)
 * 3. Dominant Edge-to-Edge City Canvas (100% viewport width)
 * 4. Contextual Floating Inspectors (Zone / Road inspectors)
 * 5. Minimal Status Bar (Live hint, tools, Alpine ticker)
 * 6. Power User Command Palette (Cmd+K / Ctrl+K) & Shortcuts Modal
 */

import { useEffect, lazy, useCallback, useRef, Suspense, useState, useMemo } from "react";
import { Grid3x3, Move3D, Search, Keyboard } from "lucide-react";
import { exportArchitecturalBlueprint } from "./utils/blueprintExport";

import { CityCanvas } from "./components/CityCanvas/CityCanvas";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { TopToolbox } from "./components/TopToolbox/TopToolbox";
import { ProjectMenu } from "./components/ProjectMenu/ProjectMenu";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal/ShortcutsModal";
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
import type { ZoneType, TerrainEditMode } from "./types/spatial";
import { LandingPage } from "./components/LandingPage/LandingPage";
import { ProjectInfoPage } from "./components/ProjectInfo/ProjectInfoPage";
import {
  OnboardingTutorial,
  shouldShowOnboarding,
  markOnboardingComplete,
} from "./components/OnboardingTutorial/OnboardingTutorial";

/** Zone tool → freeform zone type (roads stay grid-authored in Phase 5). */
const ZONE_TOOL_TYPE: Partial<Record<ToolId, ZoneType>> = {
  residential: 1,
  commercial: 2,
  green: 3,
  industrial: 5,
};

// 3D view pulls in three.js + R3F — lazy-load so the initial planner stays lean
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

  if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
    return <LandingPage theme={theme} toggleTheme={toggleTheme} />;
  }

  if (
    window.location.pathname === "/about" ||
    window.location.pathname === "/info" ||
    window.location.pathname === "/about.html"
  ) {
    return <ProjectInfoPage theme={theme} toggleTheme={toggleTheme} />;
  }

  const planner = useCityPlanner();
  const { state, setTool, placeAt } = planner;
  const tool = toolById(state.tool);

  // Modal / Panel states
  const [gisOpen, setGisOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [customZoneOpen, setCustomZoneOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);

  // Show the onboarding tutorial when the planner was entered from the
  // landing page (index URL) and the user has never completed it. Can also
  // be forced with `?onboarding` or replayed from the command palette.
  const onboardingCheckedRef = useRef(false);
  useEffect(() => {
    if (onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;
    const forced = new URLSearchParams(window.location.search).get("t") === "1";
    // Clear one-time URL args (e.g. `/planner?t=1` → `/planner`) once read,
    // without adding a history entry or reloading.
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    let fromIndex = false;
    try {
      const referrer = new URL(document.referrer);
      fromIndex =
        referrer.origin === window.location.origin &&
        (referrer.pathname === "/" || referrer.pathname === "/index.html");
    } catch {
      fromIndex = false;
    }
    if (forced || (fromIndex && shouldShowOnboarding())) {
      setOnboardingOpen(true);
    }
  }, []);

  const finishOnboarding = useCallback(() => {
    markOnboardingComplete();
    setOnboardingOpen(false);
  }, []);

  // Viewport & Mode states
  const [view3d, setView3d] = useState(false);
  const [hideZones, setHideZones] = useState(false);
  const [viewCutawayLevel, setViewCutawayLevel] = useState<number | null>(null);
  const [cameraFov, setCameraFov] = useState<number>(45);
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState<{ type: "top" | "iso" | "street" | "reset"; timestamp: number } | null>(null);
  const [showGridOverlay, setShowGridOverlay] = useState<boolean>(true);
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);

  const handleCameraPreset = (type: "top" | "iso" | "street" | "reset") => {
    setCameraPresetTrigger({ type, timestamp: Date.now() });
  };

  const handleZoomIn = () => {
    setCameraFov((f) => Math.max(25, f - 5));
  };

  const handleZoomOut = () => {
    setCameraFov((f) => Math.min(85, f + 5));
  };

  // Model armed states
  const [armedUrl, setArmedUrl] = useState<string | null>(null);
  const [armedName, setArmedName] = useState<string | null>(null);

  // Terrain tool states
  const [terrainMode, setTerrainMode] = useState<TerrainEditMode>("raise");
  const [terrainRadius, setTerrainRadius] = useState<number>(2);
  const [terrainStrength, setTerrainStrength] = useState<number>(1.0);

  const bannerRef = useRef<HTMLDivElement>(null);
  const [isBuildRoute, setIsBuildRoute] = useState(
    window.location.pathname === "/build" ||
    window.location.pathname === "/freeform" ||
    window.location.pathname === "/planner" ||
    (!["/grid", "/plan"].includes(window.location.pathname))
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
    if (isBuildRoute && !state.freeformMode) {
      planner.setFreeform(true);
    } else if (!isBuildRoute && state.freeformMode) {
      planner.setFreeform(false);
    }
  }, [isBuildRoute, state.freeformMode, planner]);

  // Handle browser popstate navigation
  useEffect(() => {
    const onPopState = () => {
      const isBuild =
        window.location.pathname === "/build" ||
        window.location.pathname === "/freeform" ||
        window.location.pathname === "/planner" ||
        (!["/grid", "/plan"].includes(window.location.pathname));
      setIsBuildRoute(isBuild);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const armModel = planner.armModel;

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Toggle Command Palette on Cmd+K or Ctrl+K
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((o) => !o);
        return;
      }

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
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedRoadId) {
        planner.removeRoad(state.selectedRoadId);
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
      <div className="flex h-dvh flex-col bg-background text-foreground overflow-hidden font-sans">
        {/* =========================================================================
            HEADER (Streamlined: Brand, City, View Switcher, Scores, Project Menu)
            ========================================================================= */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/85 px-4 backdrop-blur-md z-30">
          {/* Left: Brand & City Name */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary shadow-sm"
              >
                <Grid3x3 className="size-4" />
              </span>
              <div className="leading-none">
                <h1
                  className="font-display text-xs font-black uppercase tracking-[0.16em] text-foreground"
                  translate="no"
                >
                  MetroGrid
                </h1>
                <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.25em] text-faint">
                  Urban Planner
                </span>
              </div>
            </div>

            <div className="hidden sm:block h-4 w-[1px] bg-border" />

            <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-border/80 bg-secondary/30 px-2 py-0.5">
              <span className="font-mono text-[10px] text-muted-foreground">City:</span>
              <span className="font-mono text-xs font-bold text-foreground truncate max-w-[140px]">
                {state.cityName || "Untitled City"}
              </span>
            </div>
          </div>

          {/* Center: Primary View Switcher Pill */}
          <div data-tour="view3d" className="flex items-center rounded-lg border border-border bg-secondary/50 p-0.5 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => {
                setIsBuildRoute(true);
                planner.setFreeform(true);
                window.history.pushState(null, "", "/build");
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all ${
                isBuildRoute
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Move3D className="size-3.5" aria-hidden="true" />
              <span>Build (3D)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsBuildRoute(false);
                planner.setFreeform(false);
                window.history.pushState(null, "", "/plan");
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all ${
                !isBuildRoute
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid3x3 className="size-3.5" aria-hidden="true" />
              <span>Plan Preview</span>
            </button>
          </div>

          {/* Right: Status, Scores, Project Menu, Search & Settings */}
          <div className="flex items-center gap-2">
            {/* Live Indicator */}
            <div
              className="flex items-center gap-1.5 px-1.5 py-0.5"
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
                className="hidden font-mono text-[9px] font-bold tracking-[0.2em] md:inline"
                style={{ color: STATUS_COLOR[state.status] }}
              >
                {STATUS_LABEL[state.status]}
              </span>
            </div>

            {/* Dashboard Score Chips */}
            <div data-tour="scores" className="hidden lg:block">
              <Dashboard
                scores={state.scores}
                movement={state.movement}
                calculating={state.calculating}
                congestion={state.congestion}
                variant="chip"
              />
            </div>

            {/* Project Contextual Actions Menu */}
            <span data-tour="project" className="inline-flex">
              <ProjectMenu
                planner={planner}
                onOpenGis={() => setGisOpen(true)}
                onOpenClear={() => setClearOpen(true)}
                onOpenAbout={() => setProjectInfoOpen(true)}
                armedUrl={armedUrl}
                armedName={armedName}
                onArmModel={(url, name) => {
                  setArmedUrl(url);
                  setArmedName(name);
                  armModel(url);
                }}
              />
            </span>

            {/* Command Palette Trigger */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label="Open command palette (Cmd+K)"
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Command Palette (⌘K)</TooltipContent>
            </Tooltip>

            {/* Keyboard Shortcuts Trigger */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShortcutsModalOpen(true)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:flex"
                  aria-label="Keyboard shortcuts"
                >
                  <Keyboard className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard Shortcuts</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Backend-unavailable alert banner */}
        {state.status === "offline" && (
          <div
            ref={bannerRef}
            role="alert"
            className="flex items-center gap-3 border-b border-[#ffd166]/30 bg-[#ffd166]/10 px-4 py-1.5 text-xs text-[#ffd166] z-40"
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

        {/* =========================================================================
            MAIN CITY CANVAS (DOMINANT 100% WIDTH, NO SIDEBAR)
            ========================================================================= */}
        <main data-tour="canvas" className="mg-backdrop relative min-h-0 flex-1 overflow-hidden">
          {/* FLOATING TOP TOOLBOX */}
          <TopToolbox
            activeTool={state.tool}
            onSelectTool={setTool}
            isBuildRoute={isBuildRoute}
            onToggleBuildRoute={setIsBuildRoute}
            view3d={view3d}
            onToggle3d={() => setView3d((v) => !v)}
            terrainMode={terrainMode}
            onTerrainModeChange={setTerrainMode}
            terrainRadius={terrainRadius}
            onTerrainRadiusChange={setTerrainRadius}
            terrainStrength={terrainStrength}
            onTerrainStrengthChange={setTerrainStrength}
            onOpenCustomZoneModal={() => setCustomZoneOpen(true)}
            onOpenShortcuts={() => setShortcutsModalOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
            hideZones={hideZones}
            onToggleHideZones={() => setHideZones((h) => !h)}
            viewCutawayLevel={viewCutawayLevel}
            onViewCutawayLevelChange={setViewCutawayLevel}
            cameraFov={cameraFov}
            onCameraFovChange={setCameraFov}
            onCameraPreset={handleCameraPreset}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            showGridOverlay={showGridOverlay}
            onToggleGridOverlay={() => setShowGridOverlay((g) => !g)}
            showTraffic={showTraffic}
            onToggleTraffic={() => setShowTraffic((t) => !t)}
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled((s) => !s)}
          />

          {/* Canvas Rendering: 3D Build vs 2D/3D Plan Preview */}
          {isBuildRoute ? (
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground font-mono">
                  Loading 3D Build Canvas…
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
                cameraFov={cameraFov}
                cameraPresetTrigger={cameraPresetTrigger}
                showGridOverlay={showGridOverlay}
                showTraffic={showTraffic}
                snapEnabled={snapEnabled}
                hideZones={hideZones}
                viewCutawayLevel={viewCutawayLevel}
                onViewCutawayLevelChange={setViewCutawayLevel}
                armedUrl={armedUrl}
              />
            </Suspense>
          ) : view3d ? (
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground font-mono">
                  Loading 3D Plan Canvas…
                </div>
              }
            >
              <CityCanvas3D
                tiles={state.tiles}
                activeTool={state.tool}
                cameraFov={cameraFov}
                onSelect={
                  isBuildRoute && state.tool === "select" ? (x, y) => placeAt(x, y) : undefined
                }
              />
            </Suspense>
          ) : (
            <CityCanvas
              tiles={state.tiles}
              cityName={state.cityName}
              scores={state.scores}
              toolActive={isBuildRoute && state.tool !== "select"}
              hoverColor={hoverColor}
              feedbacks={state.feedbacks}
              onPlace={isBuildRoute ? placeAt : () => {}}
              onBoundsChange={planner.reportBounds}
              zones={state.zones}
              roads={state.roads}
              terrain={state.terrain}
              terrainMode={terrainMode}
              terrainRadius={terrainRadius}
              terrainStrength={terrainStrength}
              onEditTerrain={isBuildRoute ? planner.editTerrain : undefined}
              activeTool={state.tool}
              snapEnabled={snapEnabled}
              readOnly={!isBuildRoute}
              showGridOverlay={showGridOverlay}
              showTraffic={showTraffic}
              freeformMode={isBuildRoute && state.freeformMode}
              selectedZoneId={isBuildRoute ? state.selectedZoneId : null}
              selectedRoadId={isBuildRoute ? state.selectedRoadId : null}
              onAddZone={isBuildRoute ? (world) => {
                const type = ZONE_TOOL_TYPE[state.tool] ?? 1;
                planner.addZone({
                  id: `z${Date.now()}`,
                  type,
                  position: { x: world.x, y: world.y },
                  rotation: 0,
                  footprint: { width: 3, depth: 3 },
                  attributes: {},
                });
              } : undefined}
              onSelectZone={isBuildRoute ? (id) => planner.selectZone(id) : undefined}
              onMoveZone={isBuildRoute ? (id, world) => planner.moveZone(id, world) : undefined}
              onRotateZone={isBuildRoute ? (id, deg) => planner.rotateZone(id, deg) : undefined}
              onResizeZone={isBuildRoute ? (zone) => planner.resizeZone(zone) : undefined}
              onGestureStart={isBuildRoute ? planner.beginSpatialGesture : undefined}
              onCommitZones={isBuildRoute ? planner.commitZones : () => {}}
              onRemoveZone={isBuildRoute ? planner.removeZone : undefined}
              onAddRoad={isBuildRoute ? (road) => planner.addRoad(road) : undefined}
              onSelectRoad={isBuildRoute ? (id) => planner.selectRoad(id) : undefined}
              onUpdateRoad={isBuildRoute ? (road) => planner.updateRoad(road) : undefined}
              onRemoveRoad={isBuildRoute ? planner.removeRoad : undefined}
            />
          )}

          {/* Contextual Zone Inspector (Docked Overlay — only when in build route) */}
          {isBuildRoute && state.selectedZoneId && (
            (() => {
              const selectedZone = state.zones.find(
                (z) =>
                  z.id === state.selectedZoneId ||
                  `mesh_${z.id}` === state.selectedZoneId ||
                  z.id === state.selectedZoneId?.replace(/^mesh_/, "")
              );
              return selectedZone ? (
                <ZoneInspectorPanel
                  zone={selectedZone}
                  open={Boolean(state.selectedZoneId)}
                  onOpenChange={(open) => {
                    if (!open) planner.selectZone(null);
                  }}
                  onUpdateZone={(zone) => {
                    planner.updateZone(zone);
                    if (isBuildRoute) {
                      planner.resizeZone(zone);
                    }
                  }}
                  onRemoveZone={(id) => planner.removeZone(id)}
                />
              ) : null;
            })()
          )}

          {/* Contextual Road Inspector (Docked Overlay — only when in build route) */}
          {isBuildRoute && state.selectedRoadId && (
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

        {/* =========================================================================
            STATUS BAR (Minimal Footer: Live Tool Hint, Navigation, Save Status)
            ========================================================================= */}
        <StatusBar
          actionHint={
            state.tool === "select"
              ? "Select mode — choose a tool to place or click an object to inspect"
              : `${tool.label} — click canvas to place${state.tool === "erase" ? " / remove" : ""}`
          }
          city={state.cityName}
          savedAt={state.lastSavedAt}
        />

        {/* GIS Import Panel Dialog */}
        <Suspense fallback={null}>
          <GisImportPanel open={gisOpen} onOpenChange={setGisOpen} planner={planner} />
        </Suspense>

        {/* Clear City Confirmation Dialog */}
        <ConfirmDialog
          open={clearOpen}
          onOpenChange={setClearOpen}
          onConfirm={planner.clearCity}
          title="Clear the city?"
          description="This removes every structure, road, and zone from the canvas. This action cannot be undone."
          confirmLabel="Clear City"
        />

        {/* Power User Command Palette (Cmd+K) */}
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onSelectTool={setTool}
          isBuildRoute={isBuildRoute}
          onToggleBuildRoute={setIsBuildRoute}
          view3d={view3d}
          onToggle3d={() => setView3d((v) => !v)}
          onOpenGis={() => setGisOpen(true)}
          onExportBlueprint={() => {
            exportArchitecturalBlueprint({
              cityName: state.cityName,
              tiles: state.tiles,
              zones: state.zones,
              roads: state.roads,
              terrain: state.terrain,
              scores: state.scores,
            });
          }}
          onOpenSave={() => planner.saveCity(state.cityName || "City Layout")}
          onOpenLoad={() => planner.refreshLayouts()}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
          onOpenClear={() => setClearOpen(true)}
          onOpenOnboarding={() => setOnboardingOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Keyboard Shortcuts Cheatsheet Modal */}
        <ShortcutsModal
          open={shortcutsModalOpen}
          onClose={() => setShortcutsModalOpen(false)}
        />

        {/* First-run onboarding tutorial (from landing page / palette) */}
        <OnboardingTutorial open={onboardingOpen} onFinish={finishOnboarding} />

        {/* Project Info & Code2Create Page / Modal */}
        {projectInfoOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0c0004]">
            <ProjectInfoPage
              theme={theme}
              toggleTheme={toggleTheme}
              onClose={() => setProjectInfoOpen(false)}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
