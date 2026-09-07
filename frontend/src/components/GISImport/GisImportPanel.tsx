/**
 * GisImportPanel — compact contextual GIS import (PRD §7.1, Phase 4).
 *
 * A right-side sheet, deliberately narrow so the planner canvas stays visible
 * and live during the whole workflow. States: picking → validating →
 * importing → success / empty / error with retry. Existing city state is
 * never touched on failure and hand-placed tiles always win the merge.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MapPin } from "lucide-react";

import { AreaMapPicker } from "./AreaMapPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { successPop } from "@/lib/motion";
import type { CityPlanner } from "../../state/cityState";
import type { GisBounds } from "../../types/city";
import { estimateGridSpan, validateGisBounds } from "../../utils/gis";

interface GisImportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planner: CityPlanner;
}

interface Preset {
  label: string;
  bounds: GisBounds;
}

const PRESETS: Preset[] = [
  {
    label: "Midtown NYC",
    bounds: { north: 40.7585, south: 40.7515, east: -73.9775, west: -73.9875 },
  },
  {
    label: "Paris 11e",
    bounds: { north: 48.866, south: 48.858, east: 2.384, west: 2.369 },
  },
  {
    label: "Shibuya",
    bounds: { north: 35.6625, south: 35.656, east: 139.706, west: 139.696 },
  },
];

type Phase = "idle" | "importing" | "success" | "empty" | "error";

export function GisImportPanel({ open, onOpenChange, planner }: GisImportPanelProps) {
  const [selection, setSelection] = useState<GisBounds | null>(null);
  const [nonce, setNonce] = useState(0);
  const [originX, setOriginX] = useState("0");
  const [originY, setOriginY] = useState("0");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; added: number } | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const issues = useMemo(
    () => (selection ? validateGisBounds(selection) : []),
    [selection]
  );
  const span = useMemo(
    () => (selection && issues.length === 0 ? estimateGridSpan(selection) : null),
    [selection, issues.length]
  );

  useEffect(() => {
    if (phase === "success") successPop(successRef.current);
  }, [phase]);

  const applyPreset = (preset: Preset) => {
    setSelection({ ...preset.bounds });
    setNonce((n) => n + 1);
    setPhase("idle");
    setError(null);
    setResult(null);
  };

  const clearSelection = () => {
    setSelection(null);
    setNonce((n) => n + 1);
    setPhase("idle");
    setError(null);
    setResult(null);
  };

  const importArea = async () => {
    if (!selection || issues.length > 0 || phase === "importing") return;
    setPhase("importing");
    setError(null);
    setResult(null);
    const origin = {
      x: Number.parseInt(originX, 10) || 0,
      y: Number.parseInt(originY, 10) || 0,
    };
    try {
      const outcome = await planner.importGis(selection, origin);
      setResult(outcome);
      setPhase(outcome.added > 0 ? "success" : "empty");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setPhase("error");
    }
  };

  const ready = selection !== null && issues.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="gis-panel-desc">
        <div className="flex items-center gap-2 pr-6">
          <MapPin className="size-4 text-primary" aria-hidden="true" />
          <SheetTitle className="font-display text-sm font-bold tracking-wide text-foreground">
            Import Road Layout
          </SheetTitle>
        </div>
        <SheetDescription id="gis-panel-desc" className="text-xs leading-relaxed text-muted-foreground">
          Click two corners on the map to select an area. Street polylines and road networks are imported directly into the canvas.
        </SheetDescription>


        <AreaMapPicker selection={selection} onSelect={setSelection} nonce={nonce} />

        <div className="rounded-md border border-border bg-background/60 px-2.5 py-2">
          {selection ? (
            <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              N {selection.north.toFixed(4)} · S {selection.south.toFixed(4)}
              <br />
              E {selection.east.toFixed(4)} · W {selection.west.toFixed(4)}
              {span && (
                <>
                  <br />
                  <span className="text-primary">
                    ≈ {span.cellsX} × {span.cellsY} cells
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No area selected — click two corners on the map, or pick a preset.
            </p>
          )}
        </div>

        {issues.length > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-[#ffd166]" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {issues[0].message}
          </p>
        )}

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Quick picks
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
            {selection && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Place at grid origin
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              x
              <Input
                type="number"
                value={originX}
                onChange={(e) => setOriginX(e.target.value)}
                className="h-7 w-20 font-mono text-xs"
                aria-label="Grid origin x"
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              y
              <Input
                type="number"
                value={originY}
                onChange={(e) => setOriginY(e.target.value)}
                className="h-7 w-20 font-mono text-xs"
                aria-label="Grid origin y"
              />
            </label>
          </div>
        </div>

        <Button
          onClick={() => void importArea()}
          disabled={!ready || phase === "importing"}
          className="w-full"
        >
          {phase === "importing" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Importing… (up to a minute)
            </>
          ) : (
            "Import Road Layout"
          )}

        </Button>

        <div aria-live="polite">
          {phase === "success" && result && (
            <div
              ref={successRef}
              className="flex items-start gap-2 rounded-md border border-[#7cffb2]/40 bg-[#7cffb2]/10 px-2.5 py-2 text-[11px] text-[#7cffb2]"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Imported <Badge variant="success">{result.added} tiles</Badge>{" "}
                onto the grid. Your existing tiles were preserved — keep
                planning.
              </span>
            </div>
          )}
          {phase === "empty" && (
            <p className="flex items-start gap-1.5 text-[11px] text-[#ffd166]" role="status">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              No streets or buildings found here (or every cell was already
              occupied). Try a denser area or a different origin.
            </p>
          )}
          {phase === "error" && (
            <div
              className="rounded-md border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 px-2.5 py-2"
              role="alert"
            >
              <p className="text-[11px] text-[#ff6b6b]">{error}</p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-2"
                onClick={() => void importArea()}
              >
                Retry import
              </Button>
            </div>
          )}
        </div>

        <p className="mt-auto text-[10px] leading-relaxed text-muted-foreground/70">
          Imports fill empty cells only — hand-placed tiles always win. Map
          data © OpenStreetMap contributors.
        </p>
      </SheetContent>
    </Sheet>
  );
}


