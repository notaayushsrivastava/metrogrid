/**
 * ShortcutsModal — Keyboard shortcuts and navigation cheatsheet dialog.
 */

import { Keyboard, X } from "lucide-react";
import { Button } from "../ui/button";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;

  const sections = [
    {
      title: "Editing Tools",
      shortcuts: [
        { key: "V", label: "Select Tool" },
        { key: "X", label: "Erase Tool" },
        { key: "Delete / ⌫", label: "Delete Selected Zone or Road" },
        { key: "Esc", label: "Deselect / Exit Tool" },
      ],
    },
    {
      title: "Zoning & Placement",
      shortcuts: [
        { key: "1", label: "Residential Zone" },
        { key: "2", label: "Commercial Zone" },
        { key: "3", label: "Park / Green Space" },
        { key: "4", label: "Industrial Zone" },
      ],
    },
    {
      title: "Infrastructure & Roads",
      shortcuts: [
        { key: "5", label: "Local Road (8m width)" },
        { key: "6", label: "Transit Avenue (12m width)" },
        { key: "7", label: "Express Highway (16m width)" },
      ],
    },
    {
      title: "Terrain Elevation",
      shortcuts: [
        { key: "T", label: "Raise Terrain (+Elevation)" },
        { key: "G", label: "Lower Terrain (-Elevation)" },
        { key: "H", label: "Smooth Terrain Contours" },
      ],
    },
    {
      title: "3D Camera & Navigation",
      shortcuts: [
        { key: "W / A / S / D", label: "Pan Map (Forward / Left / Backward / Right)" },
        { key: "Q / E", label: "Camera Elevation (Ascend / Descend)" },
        { key: "Left Drag", label: "Orbit 3D Camera / Pan 2D Grid" },
        { key: "Scroll Wheel", label: "Zoom In / Out" },
      ],
    },
    {
      title: "General & Quick Actions",
      shortcuts: [
        { key: "⌘K / Ctrl+K", label: "Command Palette" },
        { key: "T / R / S", label: "3D Transform (Translate / Rotate / Scale)" },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl mg-rise font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Keyboard className="size-4 text-primary" />
            Keyboard Shortcuts & Navigation
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
          {sections.map((sec) => (
            <div key={sec.title} className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block font-mono">
                {sec.title}
              </span>
              <div className="rounded-xl border border-border/80 bg-secondary/30 p-2 space-y-1">
                {sec.shortcuts.map((sc) => (
                  <div key={sc.key} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-foreground">{sc.label}</span>
                    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

