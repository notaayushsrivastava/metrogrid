/**
 * Tile display metadata — the single source of truth for tile visuals
 * (canvas renderer, palette, legend). PRD §15.1-style centralization.
 */

import { TILE, type ToolId, type TileType } from "../types/city";

export const GRID_SIZE = 20;

/** Chunk size for Phase 2 viewport chunking (PRD §6.2). Centralized once. */
export const CHUNK_SIZE = 16;

/** Base tile size in CSS pixels at zoom 1 (Phase 2 camera). */
export const BASE_TILE = 28;

/** Cells visible horizontally/vertically in the default (initial) view. */
export const DEFAULT_VIEW_SPAN = 20;

export interface TileMeta {
  label: string;
  /** Base fill color for the canvas and the palette swatch. */
  color: string;
  /** Dimmer variant used for tile edges / strokes. */
  edge: string;
  /** High-contrast glyph color drawn on top of the fill. */
  ink: string;
  /** Short non-color cue rendered as text. */
  glyph: string;
}

export const TILE_META: Record<Exclude<TileType, 0>, TileMeta> = {
  [TILE.RESIDENTIAL]: {
    label: "Residential",
    color: "#2dd4bf",
    edge: "#0f766e",
    ink: "#042f2e",
    glyph: "R",
  },
  [TILE.COMMERCIAL]: {
    label: "Commercial",
    color: "#38bdf8",
    edge: "#0369a1",
    ink: "#082f49",
    glyph: "C",
  },
  [TILE.GREEN]: {
    label: "Green Space",
    color: "#4ade80",
    edge: "#15803d",
    ink: "#052e16",
    glyph: "P",
  },
  [TILE.INDUSTRIAL]: {
    label: "Industrial",
    color: "#fbbf24",
    edge: "#b45309",
    ink: "#451a03",
    glyph: "I",
  },
  [TILE.ROAD]: {
    label: "Road",
    color: "#64748b",
    edge: "#334155",
    ink: "#e2e8f0",
    glyph: "=",
  },
  [TILE.ROAD_PEDESTRIAN]: {
    label: "Pedestrian Path",
    color: "#94a3b8",
    edge: "#475569",
    ink: "#0f172a",
    glyph: "·",
  },
  [TILE.ROAD_LOCAL]: {
    label: "Local Road",
    color: "#64748b",
    edge: "#334155",
    ink: "#e2e8f0",
    glyph: "=",
  },
  [TILE.ROAD_AVENUE]: {
    label: "Transit Avenue",
    color: "#7c8ba1",
    edge: "#334155",
    ink: "#ffffff",
    glyph: "≡",
  },
  [TILE.ROAD_HIGHWAY]: {
    label: "Express Highway",
    color: "#8b9cb3",
    edge: "#1e293b",
    ink: "#fbbf24",
    glyph: "⌂",
  },
};

export interface ToolMeta {
  id: ToolId;
  label: string;
  /** Tile type placed by this tool; null for select/erase. */
  places: TileType | null;
  key: string;
  glyph: string;
  color: string;
}

export const TOOLS: ToolMeta[] = [
  { id: "select", label: "Select", places: null, key: "V", glyph: "◻", color: "#94a3b8" },
  { id: "residential", label: "Residential", places: TILE.RESIDENTIAL, key: "1", glyph: "R", color: "#2dd4bf" },
  { id: "commercial", label: "Commercial", places: TILE.COMMERCIAL, key: "2", glyph: "C", color: "#38bdf8" },
  { id: "green", label: "Park", places: TILE.GREEN, key: "3", glyph: "P", color: "#4ade80" },
  { id: "industrial", label: "Industrial", places: TILE.INDUSTRIAL, key: "4", glyph: "I", color: "#fbbf24" },
  { id: "road", label: "Road", places: TILE.ROAD, key: "5", glyph: "=", color: "#64748b" },
  { id: "erase", label: "Erase", places: TILE.EMPTY, key: "X", glyph: "⌫", color: "#f87171" },
];

export function toolById(id: ToolId): ToolMeta {
  const tool = TOOLS.find((t) => t.id === id);
  return tool ?? TOOLS[0];
}
