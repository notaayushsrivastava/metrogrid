/**
 * StatusBar — the wireframe's bottom rail.
 *
 * Left: interaction hints (static) + the live action hint (React).
 * Right: city name + "Saved N seconds ago" — an Alpine.js island whose
 * 1-second ticker never touches React state (see lib/alpine.ts).
 */

import { useEffect, useRef } from "react";
import { mountAlpineIsland, pushCityStatus } from "@/lib/alpine";

const ISLAND_HTML = `
  <div x-data="mgTicker" class="flex min-w-0 items-center gap-2">
    <span class="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-foreground" translate="no" x-text="city"></span>
    <span aria-hidden="true" class="h-3 w-px shrink-0 bg-border"></span>
    <span class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" x-text="savedLabel"></span>
  </div>
`;

interface StatusBarProps {
  /** Live description of what the current tool does. */
  actionHint: string;
  city: string | null;
  savedAt: number | null;
}

const HINTS: { glyph: string; label: string; title: string }[] = [
  { glyph: "✥", label: "Pan", title: "Drag the canvas (or hold Space / middle-drag) to pan" },
  { glyph: "−/+", label: "Zoom", title: "Scroll or pinch to zoom" },
];

export function StatusBar({ actionHint, city, savedAt }: StatusBarProps) {
  const islandRef = useRef<HTMLDivElement>(null);

  // Mount the Alpine island once; React never reconciles inside it.
  useEffect(() => {
    const host = islandRef.current;
    if (!host) return undefined;
    return mountAlpineIsland(host, ISLAND_HTML);
  }, []);

  // One-way data push into the island (no React re-render of the island).
  useEffect(() => {
    pushCityStatus({ city, savedAt });
  }, [city, savedAt]);

  return (
    <footer className="flex h-10 shrink-0 items-center gap-3 border-t border-border bg-card/70 px-3 backdrop-blur">
      <p className="min-w-0 truncate text-[11px] text-muted-foreground">
        <span aria-hidden="true" className="mr-1.5 text-primary">
          +
        </span>
        {actionHint}
      </p>

      <div aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />

      <ul aria-label="Canvas controls" className="hidden items-center gap-3 sm:flex">
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Click a cell with a zone or road tool selected to place it">
          <span aria-hidden="true" className="text-faint">
            ▣
          </span>
          Place
        </li>
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Press V for the select tool">
          <span aria-hidden="true" className="text-faint">
            ↖
          </span>
          Select
        </li>
        {HINTS.map((hint) => (
          <li key={hint.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={hint.title}>
            <span aria-hidden="true" className="font-mono text-faint">
              {hint.glyph}
            </span>
            {hint.label}
          </li>
        ))}
      </ul>

      <div className="ml-auto flex min-w-0 items-center">
        <div ref={islandRef} />
      </div>
    </footer>
  );
}
