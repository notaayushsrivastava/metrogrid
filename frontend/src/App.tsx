/**
 * App shell — minimal planner layout (PRD §14A, Phase 4 refinement):
 * header (brand · connection · compact scores · GIS import · clear) /
 * left tool sidebar (desktop) or bottom tool bar (mobile) /
 * city canvas dominating the viewport. Canvas-first: GIS lives in a compact
 * contextual sheet so the planner stays visible (PRD Phase 4).
 */

import { useEffect, lazy, useRef, Suspense, useState } from "react";
import { MapPlus, Sun, Moon, Grid3x3 } from "lucide-react";

import { CityCanvas } from "./components/CityCanvas/CityCanvas";
import { Dashboard } from "./components/Dashboard/Dashboard";
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

// GIS import pulls in Leaflet + anime.js — lazy-load so the initial planner
// (canvas + scoring) stays lean (PRD Phase 4: performance-conscious rendering).
const GisImportPanel = lazy(() =>
  import("./components/GISImport/GisImportPanel").then((m) => ({
    default: m.GisImportPanel,
  }))
);

const KEY_TO_TOOL: Record<string, ToolId> = {
  v: "select",
  "1": "residential",
  "2": "commercial",
  "3": "green",
  "4": "industrial",
  "5": "road_local",
  "6": "road_transit",
  "7": "road_highway",
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
  const planner = useCityPlanner();
  const { state, setTool, placeAt } = planner;
  const tool = toolById(state.tool);
  const [gisOpen, setGisOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const bannerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts (ignored while typing in inputs).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const next = KEY_TO_TOOL[event.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool]);

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
                  aria-label="Import map area"
                  onClick={() => setGisOpen(true)}
                >
                  <MapPlus aria-hidden="true" />
                  <span className="hidden sm:inline">Import map</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import a real area as editable tiles</TooltipContent>
            </Tooltip>
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
            <TilePalette activeTool={state.tool} onSelectTool={setTool} />
            <SaveLoadPanel planner={planner} />
            <p className="mt-auto px-1 text-[11px] leading-relaxed text-faint">
              Parks lift nearby housing. Industry harms it. Roads connect
              everything.
            </p>
          </aside>

          {/* City canvas */}
          <main className="mg-backdrop relative min-w-0 flex-1">
            <CityCanvas
              tiles={state.tiles}
              toolActive={state.tool !== "select"}
              hoverColor={hoverColor}
              feedbacks={state.feedbacks}
              onPlace={placeAt}
              onBoundsChange={planner.reportBounds}
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
