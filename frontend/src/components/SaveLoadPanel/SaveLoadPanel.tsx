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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SaveLoadPanelProps {
  planner: CityPlanner;
}

export function SaveLoadPanel({ planner }: SaveLoadPanelProps) {
  const { state } = planner;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Refresh the layout list once on mount. Depending on `planner` directly
  // would re-run on every render (the planner object identity changes), which
  // caused an infinite refresh loop (PRD Phase 4: minimal React re-renders).
  // `planner.refreshLayouts` is a stable useCallback, so this fires exactly once.
  useEffect(() => {
    void planner.refreshLayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planner.refreshLayouts]);

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
      <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-faint">
        Layouts
      </p>

      <div className="flex gap-1">
        <Input
          type="text"
          value={name}
          placeholder="Layout name…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onSave();
          }}
          className="h-7 min-w-0 flex-1 font-mono text-xs"
          aria-label="Layout name"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void onSave()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>

      {notice && (
        <p className="px-1 text-[11px] text-muted-foreground" role="status">
          {notice}
        </p>
      )}

      {storageNote && (
        <p className="px-1 text-[11px] leading-relaxed text-[#ffd166]">{storageNote}</p>
      )}

      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {state.layoutLoading && (
          <p className="px-1 text-[11px] text-muted-foreground">Loading layouts…</p>
        )}
        {!state.layoutLoading && state.layouts.length === 0 && (
          <p className="px-1 text-[11px] text-faint">No saved layouts yet.</p>
        )}
        {state.layouts.map((layout) => (
          <button
            key={layout.id}
            type="button"
            onClick={() => void onLoad(layout)}
            disabled={busy}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs text-secondary-foreground outline-none transition-colors hover:border-[#7cffb2]/40 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            title={`${layout.tile_count} tiles`}
          >
            <span className="min-w-0 truncate">{layout.name}</span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-faint">
              {layout.tile_count}
            </span>
          </button>
        ))}
      </div>

      {state.layoutError && (
        <p className="px-1 text-[11px] text-[#ff6b6b]" role="alert">
          {state.layoutError}
        </p>
      )}
    </div>
  );
}
