/**
 * Floating Road Inspector Panel (PRD Phase 6).
 *
 * Appears when a freeform road object is selected. Provides real-time controls for
 * road subtype, width (meters), node manipulation, splitting, and deletion.
 */

import React from "react";
import type { RoadSubtype, SpatialRoad } from "../../types/spatial";
import { ROAD_SUBTYPE_NAMES, getDefaultRoadWidth } from "../../utils/freeformRoads";
import { Button } from "../ui/button";
import { Trash2, Scissors, X } from "lucide-react";

interface RoadInspectorPanelProps {
  road: SpatialRoad;
  onUpdate: (updated: SpatialRoad) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onSplit?: (roadId: string, nodeIndex: number) => void;
}

export function RoadInspectorPanel({
  road,
  onUpdate,
  onRemove,
  onClose,
  onSplit,
}: RoadInspectorPanelProps) {
  const handleTypeChange = (newType: RoadSubtype) => {
    onUpdate({
      ...road,
      type: newType,
      width: getDefaultRoadWidth(newType),
    });
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const w = parseFloat(e.target.value);
    if (!isNaN(w) && w > 0) {
      onUpdate({
        ...road,
        width: Math.max(1.0, Math.min(40.0, w)),
      });
    }
  };

  return (
    <div
      className="absolute bottom-6 right-6 z-40 w-80 rounded-xl bg-slate-900/90 p-4 text-white backdrop-blur-md border border-slate-700 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4"
      aria-label="Road Inspector"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-sm font-semibold tracking-wide text-slate-200">
            Road Segment Inspector
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 text-xs">
        {/* Road Subtype Picker */}
        <div>
          <label className="block text-slate-400 font-medium mb-1.5">
            Road Subtype
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {([40, 41, 42, 43] as RoadSubtype[]).map((st) => (
              <button
                key={st}
                onClick={() => handleTypeChange(st)}
                className={`px-2.5 py-1.5 rounded-md border text-left font-medium transition-all ${
                  road.type === st
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {ROAD_SUBTYPE_NAMES[st]}
              </button>
            ))}
          </div>
        </div>

        {/* Road Width Slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-slate-400 font-medium">Road Width</label>
            <span className="text-emerald-400 font-bold">{road.width.toFixed(1)} m</span>
          </div>
          <input
            type="range"
            min="2"
            max="30"
            step="0.5"
            value={road.width}
            onChange={handleWidthChange}
            className="w-full accent-emerald-500 bg-slate-800 rounded-lg cursor-pointer h-2"
          />
        </div>

        {/* Polyline stats */}
        <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
          <span>Vertices / Nodes:</span>
          <span className="font-semibold text-slate-200">{road.points.length} nodes</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {road.points.length > 2 && onSplit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSplit(road.id, Math.floor(road.points.length / 2))}
              className="flex-1 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Scissors className="h-3.5 w-3.5 mr-1" /> Split
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onRemove(road.id)}
            className="flex-1 bg-rose-600/80 hover:bg-rose-600 text-white"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

