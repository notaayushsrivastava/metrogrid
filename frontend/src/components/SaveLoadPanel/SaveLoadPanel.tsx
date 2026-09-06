/**
 * SaveLoadPanel — layout persistence (PRD §17, Phase 3).
 *
 * Talks to /api/layouts via the planner hook. When the backend reports
 * storage: "memory" (no Supabase configured) it shows an explanatory note so
 * the user understands saves are local to this server process.
 */

import { useEffect, useState } from "react";
import type { CityPlanner } from "../../state/cityState";
import type { LayoutSummary } from "../../types/city";

interface SaveLoadPanelProps {
  planner: CityPlanner;
}

export function SaveLoadPanel({ planner }: SaveLoadPanelProps) {
  const { state } = planner;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void planner.refreshLayouts();
  }, [planner]);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNotice("Enter a name to save this layout.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await planner.saveCity(trimmed);
      setName("");
      setNotice(`Saved "${trimmed}".`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  const onLoad = async (layout: LayoutSummary) => {
    setBusy(true);
    setNotice(null);
    try {
      await planner.loadCity(layout.id);
      setNotice(`Loaded "${layout.name}".`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to load.");
    } finally {
      setBusy(false);
    }
  };

  const storageNote =
    state.layoutStorage === "memory"
      ? "Saves are stored in server memory (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to persist)."
      : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Layouts
      </p>

      <div className="flex gap-1">
        <input
          type="text"
          value={name}
          placeholder="Layout name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onSave();
          }}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
          aria-label="Layout name"
        />
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy}
          className="shrink-0 rounded-md border border-slate-600 px-2.5 py-1.5 text-xs font-semibold text-slate-200 outline-none transition-colors hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
        >
          Save
        </button>
      </div>

      {notice && (
        <p className="px-1 text-[11px] text-slate-400" role="status">
          {notice}
        </p>
      )}

      {storageNote && (
        <p className="px-1 text-[11px] leading-relaxed text-amber-300/80">
          {storageNote}
        </p>
      )}

      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {state.layoutLoading && (
          <p className="px-1 text-[11px] text-slate-500">Loading layouts…</p>
        )}
        {!state.layoutLoading && state.layouts.length === 0 && (
          <p className="px-1 text-[11px] text-slate-500">No saved layouts yet.</p>
        )}
        {state.layouts.map((layout) => (
          <button
            key={layout.id}
            type="button"
            onClick={() => void onLoad(layout)}
            disabled={busy}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-700/60 px-2 py-1.5 text-left text-xs text-slate-300 outline-none transition-colors hover:border-slate-500 hover:bg-slate-800/60 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
            title={`${layout.tile_count} tiles`}
          >
            <span className="truncate">{layout.name}</span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {layout.tile_count}
            </span>
          </button>
        ))}
      </div>

      {state.layoutError && (
        <p className="px-1 text-[11px] text-rose-400" role="alert">
          {state.layoutError}
        </p>
      )}
    </div>
  );
}
