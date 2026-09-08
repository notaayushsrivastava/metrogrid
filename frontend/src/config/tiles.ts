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
  /** Human-readable leader label for the legend / a11y. */
  leader: string;
}

export const TILE_META: Record<Exclude<TileType, 0>, TileMeta> = {
  [TILE.RESIDENTIAL]: {
    label: "Residential",
    color: "#7cffb2",
    edge: "#2e7d4f",
    ink: "#06130b",
    glyph: "R",
    leader: "Housing",
  },
  [TILE.COMMERCIAL]: {
    label: "Commercial",
    color: "#62a8ff",
    edge: "#1d4e8f",
    ink: "#061523",
    glyph: "C",
    leader: "Business",
  },
  [TILE.GREEN]: {
    label: "Park",
    color: "#34d399",
    edge: "#0f5132",
    ink: "#052e16",
    glyph: "P",
    leader: "Green Space",
  },
  [TILE.INDUSTRIAL]: {
    label: "Industrial",
    color: "#ffd166",
    edge: "#8a6d1f",
    ink: "#231a04",
    glyph: "I",
    leader: "Factory",
  },
  [TILE.ROAD]: {
    label: "Road",
    color: "#8d96a5",
    edge: "#3a4150",
    ink: "#0b0e13",
    glyph: "=",
    leader: "Road",
  },
  [TILE.ROAD_PEDESTRIAN]: {
    label: "Pedestrian Path",
    color: "#5c6573",
    edge: "#2a3140",
    ink: "#0b0e13",
    glyph: "·",
    leader: "Walkway",
  },
  [TILE.ROAD_LOCAL]: {
    label: "Local Road",
    color: "#8d96a5",
    edge: "#3a4150",
    ink: "#0b0e13",
    glyph: "=",
    leader: "Local Road",
  },
  [TILE.ROAD_AVENUE]: {
    label: "Transit Avenue",
    color: "#62a8ff",
    edge: "#1d4e8f",
    ink: "#061523",
    glyph: "≡",
    leader: "Avenue",
  },
  [TILE.ROAD_HIGHWAY]: {
    label: "Express Highway",
    color: "#ffd166",
    edge: "#8a6d1f",
    ink: "#231a04",
    glyph: "≣",
    leader: "Highway",
  },
};

export interface ToolMeta {
  id: ToolId;
  label: string;
  /** Tile type placed by this tool; null for select/erase/terrain. */
  places: TileType | null;
  key: string;
  glyph: string;
  color: string;
  /** Lucide icon name for the tool button. */
  icon: string;
  /** Sidebar section (wireframe: BUILD / ZONES / ROADS / TERRAIN). */
  group: "build" | "zones" | "roads" | "terrain";
}

export const TOOLS: ToolMeta[] = [
  { id: "select", label: "Select", places: null, key: "V", glyph: "⇢", color: "#8d96a5", icon: "mouse-pointer", group: "build" },
  { id: "erase", label: "Erase", places: TILE.EMPTY, key: "X", glyph: "⌫", color: "#ff6b6b", icon: "eraser", group: "build" },
  { id: "residential", label: "Res", places: TILE.RESIDENTIAL, key: "1", glyph: "R", color: "#7cffb2", icon: "house", group: "zones" },
  { id: "commercial", label: "Com", places: TILE.COMMERCIAL, key: "2", glyph: "C", color: "#62a8ff", icon: "building-2", group: "zones" },
  { id: "green", label: "Park", places: TILE.GREEN, key: "3", glyph: "P", color: "#34d399", icon: "trees", group: "zones" },
  { id: "industrial", label: "Ind", places: TILE.INDUSTRIAL, key: "4", glyph: "I", color: "#ffd166", icon: "factory", group: "zones" },
  { id: "road_local", label: "Local", places: TILE.ROAD_LOCAL, key: "5", glyph: "=", color: "#8d96a5", icon: "minus", group: "roads" },
  { id: "road_transit", label: "Transit", places: TILE.ROAD_AVENUE, key: "6", glyph: "≡", color: "#62a8ff", icon: "train", group: "roads" },
  { id: "road_highway", label: "Highway", places: TILE.ROAD_HIGHWAY, key: "7", glyph: "≣", color: "#ffd166", icon: "rocket", group: "roads" },
  { id: "terrain_raise", label: "Raise", places: null, key: "T", glyph: "▲", color: "#38bdf8", icon: "mountain", group: "terrain" },
  { id: "terrain_lower", label: "Lower", places: null, key: "G", glyph: "▼", color: "#f43f5e", icon: "arrow-down", group: "terrain" },
  { id: "terrain_smooth", label: "Smooth", places: null, key: "H", glyph: "≈", color: "#06b6d4", icon: "waves", group: "terrain" },
];

export const TOOL_GROUPS: { id: ToolMeta["group"]; label: string; marker: string }[] = [
  { id: "build", label: "Build", marker: "▣" },
  { id: "zones", label: "Zones", marker: "□" },
  { id: "roads", label: "Roads", marker: "═" },
  { id: "terrain", label: "Terrain", marker: "▲" },
];

export function toolById(id: ToolId): ToolMeta {
  const tool = TOOLS.find((t) => t.id === id);
  return tool ?? TOOLS[0];
}
