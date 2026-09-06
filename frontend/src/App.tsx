/**
 * App shell — minimal planner layout (PRD §14A):
 * header (brand · connection · compact scores · clear) /
 * left tool sidebar (desktop) or bottom tool bar (mobile) /
 * city canvas dominating the viewport.
 */

import { useEffect } from "react";
import { CityCanvas } from "./components/CityCanvas/CityCanvas";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { SaveLoadPanel } from "./components/SaveLoadPanel/SaveLoadPanel";
import { TilePalette } from "./components/TilePalette/TilePalette";
import { toolById } from "./config/tiles";
import { useCityPlanner, type ConnectionStatus } from "./state/cityState";
import type { ToolId } from "./types/city";

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

  const hoverColor =
    state.tool === "erase"
      ? "rgba(248, 113, 113, 0.9)"
      : state.tool === "select"
        ? "rgba(148, 163, 184, 0.6)"
        : "rgba(226, 232, 240, 0.85)";

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-teal-400 to-sky-500 text-xs font-black text-slate-950"
          >
            MG
          </span>
          <h1 className="text-sm font-bold tracking-wide text-slate-100">MetroGrid</h1>
        </div>

        <span
          className="ml-1 hidden items-center gap-1.5 text-[11px] text-slate-400 sm:flex"
          title={`Scoring engine: ${STATUS_LABEL[state.status]}`}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: STATUS_COLOR[state.status] }}
          />
          {STATUS_LABEL[state.status]}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <Dashboard
            scores={state.scores}
            movement={state.movement}
            calculating={state.calculating}
            congestion={state.congestion}
            variant="chip"
          />
          <button
            type="button"
            onClick={planner.clearCity}
            className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 outline-none transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Backend-unavailable banner (PRD §20.1) */}
      {state.status === "offline" && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200"
        >
          <span aria-hidden="true">▲</span>
          <span className="flex-1">
            {state.error ?? "Scoring backend unavailable."} Scores shown may be stale.
          </span>
          <button
            type="button"
            onClick={planner.recalculate}
            className="rounded-md border border-amber-400/50 px-2 py-1 font-semibold text-amber-100 outline-none hover:bg-amber-400/10 focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Tool sidebar (desktop) */}
        <aside className="hidden w-52 shrink-0 flex-col gap-3 border-r border-slate-800 bg-slate-900/40 p-3 md:flex">
          <div>
            <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Tools
            </p>
            <TilePalette activeTool={state.tool} onSelectTool={setTool} />
          </div>
          <SaveLoadPanel planner={planner} />
          <p className="mt-auto px-1 text-[11px] leading-relaxed text-slate-500">
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
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-slate-700/60 bg-slate-900/85 px-3 py-1 text-[11px] text-slate-300">
            {state.tool === "select"
              ? "Select mode — choose a tool to place zones"
              : `${tool.label} — click a cell${state.tool === "erase" ? " to remove" : ""}`}
          </div>
        </main>
      </div>

      {/* Tool bar (mobile) */}
      <nav className="border-t border-slate-800 bg-slate-900/60 px-2 py-2 md:hidden">
        <TilePalette activeTool={state.tool} onSelectTool={setTool} layout="row" />
      </nav>
    </div>
  );
}

