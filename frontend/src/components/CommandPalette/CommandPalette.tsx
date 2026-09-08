/**
 * CommandPalette — Fast searchable command center (Cmd+K / Ctrl+K) for power users.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Wrench,
  Building2,
  Move3D,
  Grid3x3,
  Box,
  MapPlus,
  Download,
  Save,
  FolderOpen,
  Sun,
  Moon,
  Trash2,
  Mountain,
  Eraser,
  Route,
  Keyboard,
  X,
} from "lucide-react";
import type { ToolId } from "../../types/city";

interface CommandItem {
  id: string;
  label: string;
  category: "Tools" | "Zones" | "View" | "Project" | "Settings";
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectTool: (tool: ToolId) => void;
  isBuildRoute: boolean;
  onToggleBuildRoute: (isBuild: boolean) => void;
  view3d: boolean;
  onToggle3d: () => void;
  onOpenGis: () => void;
  onExportBlueprint: () => void;
  onOpenSave: () => void;
  onOpenLoad: () => void;
  onOpenShortcuts: () => void;
  onOpenClear: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onSelectTool,
  isBuildRoute,
  onToggleBuildRoute,
  view3d,
  onToggle3d,
  onOpenGis,
  onExportBlueprint,
  onOpenSave,
  onOpenLoad,
  onOpenShortcuts,
  onOpenClear,
  theme,
  onToggleTheme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(
    () => [
      // Tools
      {
        id: "tool-select",
        label: "Select Tool",
        category: "Tools",
        shortcut: "V",
        icon: Wrench,
        onSelect: () => onSelectTool("select"),
      },
      {
        id: "tool-erase",
        label: "Erase Tool",
        category: "Tools",
        shortcut: "X",
        icon: Eraser,
        onSelect: () => onSelectTool("erase"),
      },
      {
        id: "tool-road-local",
        label: "Place Local Road",
        category: "Tools",
        shortcut: "5",
        icon: Route,
        onSelect: () => onSelectTool("road_local"),
      },
      {
        id: "tool-road-transit",
        label: "Place Transit Avenue",
        category: "Tools",
        shortcut: "6",
        icon: Route,
        onSelect: () => onSelectTool("road_transit"),
      },
      {
        id: "tool-road-highway",
        label: "Place Express Highway",
        category: "Tools",
        shortcut: "7",
        icon: Route,
        onSelect: () => onSelectTool("road_highway"),
      },
      {
        id: "tool-terrain-raise",
        label: "Terrain Raise",
        category: "Tools",
        shortcut: "T",
        icon: Mountain,
        onSelect: () => onSelectTool("terrain_raise"),
      },
      {
        id: "tool-terrain-lower",
        label: "Terrain Lower",
        category: "Tools",
        shortcut: "G",
        icon: Mountain,
        onSelect: () => onSelectTool("terrain_lower"),
      },
      {
        id: "tool-terrain-smooth",
        label: "Terrain Smooth",
        category: "Tools",
        shortcut: "H",
        icon: Mountain,
        onSelect: () => onSelectTool("terrain_smooth"),
      },

      // Zones
      {
        id: "zone-residential",
        label: "Place Residential Zone",
        category: "Zones",
        shortcut: "1",
        icon: Building2,
        onSelect: () => onSelectTool("residential"),
      },
      {
        id: "zone-commercial",
        label: "Place Commercial Zone",
        category: "Zones",
        shortcut: "2",
        icon: Building2,
        onSelect: () => onSelectTool("commercial"),
      },
      {
        id: "zone-green",
        label: "Place Park / Green Space",
        category: "Zones",
        shortcut: "3",
        icon: Building2,
        onSelect: () => onSelectTool("green"),
      },
      {
        id: "zone-industrial",
        label: "Place Industrial Zone",
        category: "Zones",
        shortcut: "4",
        icon: Building2,
        onSelect: () => onSelectTool("industrial"),
      },

      // View
      {
        id: "view-mode-toggle",
        label: isBuildRoute ? "Switch to Plan Preview (Architectural Blueprint)" : "Switch to Build (3D Freeform)",
        category: "View",
        icon: isBuildRoute ? Grid3x3 : Move3D,
        onSelect: () => {
          const next = !isBuildRoute;
          onToggleBuildRoute(next);
          window.history.pushState(null, "", next ? "/build" : "/plan");
        },
      },
      {
        id: "view-3d-toggle",
        label: view3d ? "Switch to 2D Grid Canvas" : "Switch to 3D View",
        category: "View",
        icon: Box,
        onSelect: onToggle3d,
      },

      // Project
      {
        id: "project-gis",
        label: "Import Real-World Road Layout (GIS)",
        category: "Project",
        icon: MapPlus,
        onSelect: onOpenGis,
      },
      {
        id: "project-blueprint",
        label: "Download Architectural Blueprint (PNG)",
        category: "Project",
        icon: Download,
        onSelect: onExportBlueprint,
      },
      {
        id: "project-save",
        label: "Save City Layout",
        category: "Project",
        icon: Save,
        onSelect: onOpenSave,
      },
      {
        id: "project-load",
        label: "Load Saved City Layouts",
        category: "Project",
        icon: FolderOpen,
        onSelect: onOpenLoad,
      },
      {
        id: "project-clear",
        label: "Clear City Canvas",
        category: "Project",
        icon: Trash2,
        onSelect: onOpenClear,
      },

      // Settings
      {
        id: "settings-theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        category: "Settings",
        icon: theme === "dark" ? Sun : Moon,
        onSelect: onToggleTheme,
      },
      {
        id: "settings-shortcuts",
        label: "View All Keyboard Shortcuts",
        category: "Settings",
        icon: Keyboard,
        onSelect: onOpenShortcuts,
      },
    ],
    [
      onSelectTool,
      onToggleBuildRoute,
      view3d,
      onToggle3d,
      onOpenGis,
      onExportBlueprint,
      onOpenSave,
      onOpenLoad,
      onOpenShortcuts,
      onOpenClear,
      theme,
      onToggleTheme,
    ]
  );

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || (c.shortcut && c.shortcut.toLowerCase() === q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % filteredCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        cmd.onSelect();
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-20">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-2 shadow-2xl mg-rise">
        {/* Search Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search tools (e.g. Roads, Terrain, Residential)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent font-sans text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-1 space-y-0.5">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No matching commands found.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => {
                    cmd.onSelect();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-3.5 opacity-80" />
                    <span>{cmd.label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-mono ${
                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <kbd
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          isSelected
                            ? "border-primary-foreground/40 text-primary-foreground"
                            : "border-border bg-secondary text-muted-foreground"
                        }`}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Command Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-[10px] font-mono text-muted-foreground">
          <span>Navigate with ↑ ↓ • Select with ↵</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
