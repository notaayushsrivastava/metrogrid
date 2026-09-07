/**
 * GisImportPanel — compact contextual GIS import (PRD §7.1, Phase 4).
 *
 * A right-side sheet, deliberately narrow so the planner canvas stays visible
 * and live during the whole workflow. States: picking → validating →
 * importing → success / empty / error with retry. Existing city state is
 * never touched on failure and hand-placed tiles always win the merge.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  X,
} from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { successPop } from "@/lib/motion";
import type { CityPlanner } from "../../state/cityState";
import type { GisBounds } from "../../types/city";
import { estimateGridSpan, validateGisBounds } from "../../utils/gis";
import {
  searchLocations,
  getCurrentCoordinates,
  createCenteredBounds,
  type GeocodingResult,
} from "../../utils/geocoding";

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

  // Search & Current Location State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [centerTarget, setCenterTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

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

  // Live debounced search when user types in search input
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setSearchDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setLocationError(null);
      try {
        const results = await searchLocations(trimmed);
        setSearchResults(results);
        if (results.length > 0) {
          setSearchDropdownOpen(true);
        }
      } catch (err: any) {
        console.warn("Location search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (loc: GeocodingResult) => {
    setCenterTarget({ lat: loc.lat, lon: loc.lon, zoom: 16 });
    const newBounds = loc.bounds || createCenteredBounds(loc.lat, loc.lon, 450);
    setSelection(newBounds);
    setNonce((n) => n + 1);
    setSearchDropdownOpen(false);
    setSearchQuery(loc.name || loc.displayName);
    setLocationError(null);
    setPhase("idle");
    setError(null);
    setResult(null);
  };

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed || isSearching) return;
    setIsSearching(true);
    setLocationError(null);
    try {
      const results = await searchLocations(trimmed);
      setSearchResults(results);
      if (results.length > 0) {
        handleSelectLocation(results[0]);
      } else {
        setLocationError(`No locations found for "${trimmed}".`);
      }
    } catch (err: any) {
      setLocationError(err.message || "Failed to search location.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (isLocating) return;
    setIsLocating(true);
    setLocationError(null);
    try {
      const coords = await getCurrentCoordinates();
      setUserLocation(coords);
      setCenterTarget({ lat: coords.lat, lon: coords.lon, zoom: 16 });
      const newBounds = createCenteredBounds(coords.lat, coords.lon, 450);
      setSelection(newBounds);
      setNonce((n) => n + 1);
      setSearchQuery("My Current Location");
      setSearchDropdownOpen(false);
      setPhase("idle");
      setError(null);
      setResult(null);
    } catch (err: any) {
      setLocationError(err.message || "Could not retrieve current location.");
    } finally {
      setIsLocating(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    setSelection({ ...preset.bounds });
    setNonce((n) => n + 1);
    setSearchQuery(preset.label);
    setSearchDropdownOpen(false);
    setPhase("idle");
    setError(null);
    setResult(null);
  };

  const clearSelection = () => {
    setSelection(null);
    setNonce((n) => n + 1);
    setSearchQuery("");
    setSearchResults([]);
    setSearchDropdownOpen(false);
    setLocationError(null);
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
          Search any city, use your current location, or click on the map to import real road networks.
        </SheetDescription>

        {/* Location Search & Use Current Location Toolbar */}
        <div className="relative space-y-1.5">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setSearchDropdownOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchDropdownOpen(false);
                  }
                }}
                placeholder="Search city, neighborhood, address..."
                className="h-8 pl-8 pr-7 text-xs bg-background/80"
                aria-label="Search location"
              />
              {isSearching ? (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setSearchDropdownOpen(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
                  title="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            {/* Use Current Location Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="h-8 px-2.5 shrink-0 gap-1.5 border border-border text-xs font-semibold hover:border-primary/50"
                  aria-label="Use Current Location"
                >
                  {isLocating ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <LocateFixed className="size-3.5 text-primary" />
                  )}
                  <span className="hidden sm:inline">My Location</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Center map on your current GPS location</TooltipContent>
            </Tooltip>
          </form>

          {/* Autocomplete Search Dropdown */}
          {searchDropdownOpen && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md">
              {searchResults.map((loc) => (
                <button
                  key={loc.placeId}
                  type="button"
                  onClick={() => handleSelectLocation(loc)}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{loc.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{loc.displayName}</p>
                  </div>
                  {loc.type && (
                    <span className="shrink-0 rounded bg-secondary/80 px-1 py-0.5 text-[9px] uppercase font-mono text-muted-foreground">
                      {loc.type}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {locationError && (
            <p className="text-[11px] text-destructive flex items-center gap-1 mt-1 font-medium" role="alert">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>{locationError}</span>
            </p>
          )}
        </div>

        <AreaMapPicker
          selection={selection}
          onSelect={setSelection}
          nonce={nonce}
          centerTarget={centerTarget}
          userLocation={userLocation}
        />

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


