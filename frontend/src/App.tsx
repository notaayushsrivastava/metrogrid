/**
 * App shell — minimal planner layout (PRD §14A, Phase 4 refinement):
 * header (brand · connection · compact scores · GIS import · clear) /
 * left tool sidebar (desktop) or bottom tool bar (mobile) /
 * city canvas dominating the viewport. Canvas-first: GIS lives in a compact
 * contextual sheet so the planner stays visible (PRD Phase 4).
 */

import { useEffect, lazy, useRef, Suspense, useState } from "react";
import { MapPlus } from "lucide-react";

import { CityCanvas } from "./components/CityCanvas/CityCanvas";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { SaveLoadPanel } from "./components/SaveLoadPanel/SaveLoadPanel";
import { TilePalette } from "./components/TilePalette/TilePalette";
import { Button } from "./components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { slideDown } from "./lib/motion";
import { toolById } from "./config/tiles";
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
  "5": "road",
  x: "erase",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  online: "Engine online",
  offline: "Engine offline",
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connecting: "#fbbf24",
  online: "#4ade80",
  offline: "#f87171",
};

export default function App() {
  const planner = useCityPlanner();
  const { state, setTool, placeAt } = planner;
  const tool = toolById(state.tool);
  const [gisOpen, setGisOpen] = useState(false);
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
        <header className="flex items-center gap-3 border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-teal-300 to-sky-500 text-[11px] font-black text-slate-950"
            >
              MG
            </span>
            <h1 className="font-display text-sm font-bold tracking-wide text-foreground">
              MetroGrid
            </h1>
          </div>

          <span
            className="ml-1 hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"
            title={`Scoring engine: ${STATUS_LABEL[state.status]}`}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[state.status] }}
            />
            {STATUS_LABEL[state.status]}
          </span>

          <div className="ml-auto flex items-center gap-2">
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
              size="sm"
              onClick={planner.clearCity}
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
            className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200"
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
          {/* Tool sidebar (desktop) */}
          <aside className="hidden w-52 shrink-0 flex-col gap-3 border-r border-border bg-card/40 p-3 md:flex">
            <div>
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Tools
              </p>
              <TilePalette activeTool={state.tool} onSelectTool={setTool} />
            </div>
            <SaveLoadPanel planner={planner} />
            <p className="mt-auto px-1 text-[11px] leading-relaxed text-muted-foreground">
              Roads connect zones. Parks lift nearby housing, industry harms it.
            </p>
          </aside>

          {/* City canvas */}
          <main className="relative min-w-0 flex-1">
            <CityCanvas
              tiles={state.tiles}
              toolActive={state.tool !== "select"}
              hoverColor={hoverColor}
              feedbacks={state.feedbacks}
              onPlace={placeAt}
              onBoundsChange={planner.reportBounds}
            />
            {/* Current action hint (information hierarchy #1, PRD §14A) */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border/70 bg-card/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
              {state.tool === "select"
                ? "Select mode — choose a tool to place zones"
                : `${tool.label} — click a cell${state.tool === "erase" ? " to remove" : ""}`}
            </div>
          </main>
        </div>

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
      </div>
    </TooltipProvider>
  );
}
