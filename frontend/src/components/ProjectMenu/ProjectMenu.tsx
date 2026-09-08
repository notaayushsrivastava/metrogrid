/**
 * ProjectMenu — Consolidated project and contextual actions dropdown (PRD Category 5).
 *
 * Houses:
 * - Save Layout (modal/popover)
 * - Load Saved Layouts
 * - Import GIS / Road Layout
 * - Download Architectural Blueprint (PNG)
 * - 3D Model Assets Upload (.glb/.gltf)
 * - Clear City (destructive action with confirm dialog)
 */

import { useState, useRef, useEffect } from "react";
import {
  FolderKanban,
  Save,
  FolderOpen,
  MapPlus,
  Download,
  Box,
  Trash2,
  ChevronDown,
  X,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { CityPlanner } from "../../state/cityState";
import { exportArchitecturalBlueprint } from "../../utils/blueprintExport";
import { uploadAsset } from "../../services/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface ProjectMenuProps {
  planner: CityPlanner;
  onOpenGis: () => void;
  onOpenClear: () => void;
  armedUrl: string | null;
  armedName: string | null;
  onArmModel: (url: string | null, name: string | null) => void;
}

export function ProjectMenu({
  planner,
  onOpenGis,
  onOpenClear,
  armedUrl,
  armedName,
  onArmModel,
}: ProjectMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);

  // Save layout states
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Asset upload states
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  const handleSave = async () => {
    const trimmed = saveName.trim();
    if (!trimmed) {
      setSaveNotice("Enter a name to save this layout.");
      return;
    }
    setSaveBusy(true);
    setSaveNotice(null);
    try {
      await planner.saveCity(trimmed);
      setSaveName("");
      setSaveNotice(`Saved "${trimmed}".`);
      setTimeout(() => {
        setSaveModalOpen(false);
        setSaveNotice(null);
      }, 1200);
    } catch (err) {
      setSaveNotice(err instanceof Error ? err.message : "Failed to save layout.");
    } finally {
      setSaveBusy(false);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      await planner.loadCity(id);
      setLoadModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadPhase("uploading");
    setUploadMessage(null);
    try {
      const res = await uploadAsset(file);
      onArmModel(res.model_url, res.filename);
      setUploadPhase("success");
      setUploadMessage(`Armed "${res.filename}" (${Math.round(res.size_bytes / 1024)} KB)`);
    } catch (err) {
      setUploadPhase("error");
      setUploadMessage(err instanceof Error ? err.message : "Upload failed.");
    }
    e.target.value = "";
  };

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/80 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent hover:border-primary/40 transition-colors shadow-sm"
        aria-expanded={menuOpen}
        aria-haspopup="true"
      >
        <FolderKanban className="size-3.5 text-primary" />
        <span>Project</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      {/* Dropdown Menu */}
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-md z-50 mg-rise font-sans text-xs">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Project & Actions
          </div>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setSaveModalOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Save className="size-3.5 text-emerald-400" />
            <span>Save Layout</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void planner.refreshLayouts();
              setLoadModalOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium text-foreground hover:bg-accent transition-colors"
          >
            <FolderOpen className="size-3.5 text-sky-400" />
            <span>Load Layouts ({planner.state.layouts.length})</span>
          </button>

          <div className="my-1 h-[1px] bg-border/60" />

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onOpenGis();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium text-foreground hover:bg-accent transition-colors"
          >
            <MapPlus className="size-3.5 text-amber-400" />
            <span>Import Road Layout</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              exportArchitecturalBlueprint({
                cityName: planner.state.cityName,
                tiles: planner.state.tiles,
                zones: planner.state.zones,
                roads: planner.state.roads,
                terrain: planner.state.terrain,
                scores: planner.state.scores,
              });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Download className="size-3.5 text-sky-400" />
            <span>Download Blueprint (PNG)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setAssetModalOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Box className="size-3.5 text-emerald-400" />
            <span>3D Model Assets (.glb)</span>
          </button>

          <div className="my-1 h-[1px] bg-border/60" />

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onOpenClear();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-semibold text-destructive hover:bg-destructive/15 transition-colors"
          >
            <Trash2 className="size-3.5 text-destructive" />
            <span>Clear City Canvas</span>
          </button>
        </div>
      )}

      {/* Save Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl mg-rise">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Save className="size-4 text-emerald-400" />
                Save City Layout
              </h3>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Save your current city plan, roads, zones, and 3D terrain elevation.
              </p>
              <Input
                type="text"
                placeholder="Layout name (e.g. Neo Tokyo Central)…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                }}
                className="font-mono text-xs"
                autoFocus
              />
              {saveNotice && (
                <p className="text-xs font-mono text-emerald-400">{saveNotice}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSaveModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saveBusy}
                className="gap-1.5"
              >
                {saveBusy && <Loader2 className="size-3 animate-spin" />}
                <span>Save</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Load Layouts Modal */}
      {loadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl mg-rise">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FolderOpen className="size-4 text-sky-400" />
                Saved City Layouts
              </h3>
              <button
                type="button"
                onClick={() => setLoadModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="py-4 max-h-64 overflow-y-auto space-y-1.5">
              {planner.state.layouts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No saved layouts found. Save a layout first to load it here.
                </p>
              ) : (
                planner.state.layouts.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => void handleLoad(layout.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-border/80 bg-secondary/40 p-3 text-left text-xs hover:border-sky-500/50 hover:bg-secondary transition-all"
                  >
                    <div>
                      <span className="font-bold text-foreground block">{layout.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {layout.created_at ? new Date(layout.created_at).toLocaleString() : "Recent"}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-sky-400 font-semibold">
                      {layout.tile_count} tiles
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLoadModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Asset Model Upload Modal */}
      {assetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl mg-rise">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Box className="size-4 text-emerald-400" />
                3D Model Assets
              </h3>
              <button
                type="button"
                onClick={() => setAssetModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload a custom `.glb` or `.gltf` 3D architectural model to arm subsequent placements.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={handleFileUpload}
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={uploadPhase === "uploading"}
                onClick={() => fileInputRef.current?.click()}
                className="w-full justify-center gap-2"
              >
                {uploadPhase === "uploading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                <span>{uploadPhase === "uploading" ? "Uploading Model…" : "Select .glb / .gltf File"}</span>
              </Button>

              {uploadPhase === "success" && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>{uploadMessage}</span>
                </p>
              )}

              {uploadPhase === "error" && (
                <p className="flex items-center gap-1.5 text-xs text-rose-400 font-mono">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{uploadMessage}</span>
                </p>
              )}

              {armedUrl && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">Armed Asset</span>
                    <span className="text-xs text-foreground font-mono truncate block">{armedName || "Custom 3D Model"}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onArmModel(null, null)}
                    className="text-xs h-7 text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAssetModalOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
