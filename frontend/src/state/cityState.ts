/**
 * Authoritative city state (PRD §19) + the placement → scoring loop
 * (PRD §14.2). The sparse `Map<string, TileObject>` is the single source of
 * truth; scores, deltas, and feedback are derived/transient.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  calculateScores,
  importGisArea,
  listLayouts,
  loadLayout,
  saveLayout,
} from "../services/api";
import { mergeImportedTiles } from "../utils/gis";
import { deriveTileMap } from "../utils/spatial";
import type { GridPointXY, SpatialZone, SpatialRoad } from "../types/spatial";
import {
  GRID_MAX,
  GRID_MIN,
  TILE,
  type Feedback,
  type GisBounds,
  type GisGridOrigin,
  type GlobalScores,
  type GridBounds,
  type GridState,
  type LatestAction,
  type LayoutSummary,
  type LocalDelta,
  type TileObject,
  type TileType,
  type ToolId,
  type TrafficDetail,
} from "../types/city";

export type ConnectionStatus = "connecting" | "online" | "offline";

export interface MetricMovement {
  /** Signed change per metric from the previous scoring response. */
  livability: number;
  traffic: number;
  resources: number;
}

export interface CityState {
  tiles: GridState;
  /** Freeform spatial zones (PRD Phase 5 — Day 2). Their derived tile map
   *  is what feeds the (unchanged) scoring engine. */
  zones: SpatialZone[];
  /** Freeform multi-segment roads (PRD Phase 6 — Day 2). */
  roads: SpatialRoad[];
  /** When true the canvas places freeform zones instead of grid tiles. */
  freeformMode: boolean;
  /** Selected zone id (Select tool), enabling move/rotate/resize handles. */
  selectedZoneId: string | null;
  /** Selected road id for freeform node editing. */
  selectedRoadId: string | null;
  tool: ToolId;
  scores: GlobalScores | null;
  movement: MetricMovement | null;
  status: ConnectionStatus;
  calculating: boolean;
  error: string | null;
  feedbacks: Feedback[];
  layouts: LayoutSummary[];
  layoutStorage: "supabase" | "memory" | null;
  layoutLoading: boolean;
  layoutError: string | null;
  congestion: TrafficDetail | null;
  /** Epoch ms of the last successful layout save (status bar ticker). */
  lastSavedAt: number | null;
  /** Name of the city as last saved/loaded (status bar). */
  cityName: string | null;
  /** Undo stack of zone snapshots (spatial edits only). */
  undoStack: SpatialZone[][];
  /** Redo stack of zone snapshots. */
  redoStack: SpatialZone[][];
}

export const FEEDBACK_MS = 1500;

type CityAction =
  | { type: "SET_TOOL"; tool: ToolId }
  | { type: "PLACE"; key: string; tileType: TileType }
  | { type: "CLEAR" }
  | { type: "CALC_START" }
  | { type: "CALC_OK"; scores: GlobalScores; delta: LocalDelta | null; congestion: TrafficDetail | null }
  | { type: "CALC_FAIL"; error: string }
  | { type: "ADD_FEEDBACK"; feedback: Feedback }
  | { type: "REMOVE_FEEDBACK"; id: number }
  | { type: "LAYOUTS_LOADING" }
  | { type: "LAYOUTS_LOADED"; storage: "supabase" | "memory"; layouts: LayoutSummary[] }
  | { type: "LAYOUTS_ERROR"; error: string }
  | { type: "LAYOUT_LOAD"; grid: Record<string, { type: number }>; zones?: SpatialZone[] }
  | { type: "LAYOUT_LOAD"; grid: Record<string, { type: number }>; zones?: SpatialZone[]; roads?: SpatialRoad[] }
  | { type: "IMPORT_MERGED"; tiles: GridState; zones?: SpatialZone[]; roads?: SpatialRoad[] }

  | { type: "SAVED"; name: string; at: number }
  | { type: "CITY_NAMED"; name: string }
  | { type: "SET_FREEFORM"; on: boolean }
  | { type: "ZONE_ADD"; zone: SpatialZone }
  | { type: "ZONE_REMOVE"; id: string }
  | { type: "ZONE_MOVE"; id: string; position: GridPointXY }
  | { type: "ZONE_ROTATE"; id: string; rotation: number }
  | { type: "ZONE_UPDATE_LIVE"; zone: SpatialZone }
  | { type: "ZONE_UPDATE"; zone: SpatialZone }
  | { type: "SELECT_ZONE"; id: string | null }
  | { type: "ROAD_ADD"; road: SpatialRoad }
  | { type: "ROAD_REMOVE"; id: string }
  | { type: "ROAD_UPDATE"; road: SpatialRoad }
  | { type: "SELECT_ROAD"; id: string | null }
  | { type: "SPATIAL_SNAPSHOT"; zones: SpatialZone[] }
  | { type: "UNDO" }
  | { type: "REDO" };

export const initialState: CityState = {
  tiles: new Map(),
  zones: [],
  roads: [],
  freeformMode: false,
  selectedZoneId: null,
  selectedRoadId: null,
  tool: "residential",
  scores: null,
  movement: null,
  status: "connecting",
  calculating: false,
  error: null,
  feedbacks: [],
  layouts: [],
  layoutStorage: null,
  layoutLoading: false,
  layoutError: null,
  congestion: null,
  lastSavedAt: null,
  cityName: null,
  undoStack: [],
  redoStack: [],
};

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Placement bounds: the full signed 32-bit coordinate space (PRD §5.2).
 * Phase 2 removed the fixed 20×20 restriction — the sparse map grows freely.
 */
export function inBounds(x: number, y: number): boolean {
  return x >= GRID_MIN && x <= GRID_MAX && y >= GRID_MIN && y <= GRID_MAX;
}

function applyMovement(
  previous: GlobalScores | null,
  next: GlobalScores
): MetricMovement {
  if (!previous) return { livability: 0, traffic: 0, resources: 0 };
  return {
    livability: next.livability - previous.livability,
    traffic: next.traffic - previous.traffic,
    resources: next.resources - previous.resources,
  };
}

export function cityReducer(state: CityState, action: CityAction): CityState {
  switch (action.type) {
    case "SET_TOOL":
      return { ...state, tool: action.tool };

    case "PLACE": {
      const tiles = new Map(state.tiles);
      if (action.tileType === TILE.EMPTY) {
        tiles.delete(action.key);
      } else {
        tiles.set(action.key, { type: action.tileType });
      }
      return { ...state, tiles };
    }

    case "CLEAR":
      return { ...state, tiles: new Map(), feedbacks: [] };

    case "CALC_START":
      return { ...state, calculating: true, error: null };

    case "CALC_OK":
      return {
        ...state,
        status: "online",
        calculating: false,
        error: null,
        scores: action.scores,
        congestion: action.congestion,
        movement: applyMovement(state.scores, action.scores),
      };

    case "CALC_FAIL":
      return { ...state, status: "offline", calculating: false, error: action.error };

    case "ADD_FEEDBACK":
      return { ...state, feedbacks: [...state.feedbacks.slice(-4), action.feedback] };

    case "REMOVE_FEEDBACK":
      return { ...state, feedbacks: state.feedbacks.filter((f) => f.id !== action.id) };

    case "LAYOUTS_LOADING":
      return { ...state, layoutLoading: true, layoutError: null };

    case "LAYOUTS_LOADED":
      return {
        ...state,
        layoutLoading: false,
        layoutStorage: action.storage,
        layouts: action.layouts,
      };

    case "LAYOUTS_ERROR":
      return { ...state, layoutLoading: false, layoutError: action.error };

    case "LAYOUT_LOAD": {
      const tiles = new Map<string, TileObject>();
      for (const [key, tile] of Object.entries(action.grid)) {
        tiles.set(key, { type: tile.type as TileType });
      }
      return {
        ...state,
        tiles,
        zones: action.zones ?? [],
        selectedZoneId: null,
        feedbacks: [],
      };
    }

    case "IMPORT_MERGED":
      // Commit merged GIS tiles into the rendered state atomically.
      return {
        ...state,
        tiles: action.tiles,
        zones: action.zones ? [...state.zones, ...action.zones] : state.zones,
        roads: action.roads ? [...state.roads, ...action.roads] : state.roads,
        feedbacks: [],
      };


    case "SAVED":
      return { ...state, lastSavedAt: action.at, cityName: action.name };

    case "CITY_NAMED":
      return { ...state, cityName: action.name };

    case "SET_FREEFORM":
      return { ...state, freeformMode: action.on, selectedZoneId: null };

    case "SELECT_ZONE":
      return { ...state, selectedZoneId: action.id };

    case "SELECT_ROAD":
      return { ...state, selectedRoadId: action.id };

    case "ROAD_ADD": {
      const roads = [...state.roads, action.road];
      return { ...state, roads, selectedRoadId: action.road.id };
    }

    case "ROAD_REMOVE": {
      const roads = state.roads.filter((r) => r.id !== action.id);
      return { ...state, roads, selectedRoadId: null };
    }

    case "ROAD_UPDATE": {
      const roads = state.roads.map((r) => (r.id === action.road.id ? action.road : r));
      return { ...state, roads };
    }

    case "ZONE_ADD": {
      const zones = [...state.zones, action.zone];
      return {
        ...state,
        zones,
        selectedZoneId: action.zone.id,
        undoStack: [...state.undoStack.slice(-49), state.zones],
        redoStack: [],
      };
    }

    case "ZONE_REMOVE": {
      const zones = state.zones.filter((z) => z.id !== action.id);
      return {
        ...state,
        zones,
        selectedZoneId: null,
        undoStack: [...state.undoStack.slice(-49), state.zones],
        redoStack: [],
      };
    }

    case "ZONE_MOVE": {
      const zones = state.zones.map((z) =>
        z.id === action.id ? { ...z, position: action.position } : z
      );
      return { ...state, zones };
    }

    case "ZONE_ROTATE": {
      const zones = state.zones.map((z) =>
        z.id === action.id ? { ...z, rotation: action.rotation } : z
      );
      return { ...state, zones };
    }

    case "ZONE_UPDATE": {
      const zones = state.zones.map((z) => (z.id === action.zone.id ? action.zone : z));
      return {
        ...state,
        zones,
        undoStack: [...state.undoStack.slice(-49), state.zones],
        redoStack: [],
      };
    }

    case "ZONE_UPDATE_LIVE": {
      // Live drag update — no undo entry (the gesture commit handles it).
      const zones = state.zones.map((z) => (z.id === action.zone.id ? action.zone : z));
      return { ...state, zones };
    }

    case "SPATIAL_SNAPSHOT": {
      // Push the *pre-gesture* zone list onto undo, keep the current one.
      return {
        ...state,
        undoStack: [...state.undoStack.slice(-49), action.zones],
        redoStack: [],
      };
    }

    case "UNDO": {
      if (!state.undoStack.length) return state;
      const previous = state.undoStack[state.undoStack.length - 1];
      return {
        ...state,
        zones: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack.slice(-49), state.zones],
        selectedZoneId: null,
      };
    }

    case "REDO": {
      if (!state.redoStack.length) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        ...state,
        zones: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack.slice(-49), state.zones],
        selectedZoneId: null,
      };
    }

    default:
      return state;
  }
}

let feedbackCounter = 0;

export interface CityPlanner {
  state: CityState;
  setTool: (tool: ToolId) => void;
  placeAt: (x: number, y: number) => void;
  clearCity: () => void;
  recalculate: () => void;
  /** Canvas reports the visible active bounds (PRD §6.1) for API calls. */
  reportBounds: (bounds: GridBounds) => void;
  refreshLayouts: () => void;
  saveCity: (name: string) => Promise<void>;
  loadCity: (layoutId: string) => Promise<void>;
  /** Arm a 3D model URL so the next placed tile carries it (PRD §16.2). */
  armModel: (url: string | null) => void;
  /* Phase 5 (Day 2) — freeform spatial zones */
  setFreeform: (on: boolean) => void;
  selectZone: (id: string | null) => void;
  addZone: (zone: SpatialZone) => void;
  removeZone: (id: string) => void;
  moveZone: (id: string, position: GridPointXY) => void;
  rotateZone: (id: string, rotation: number) => void;
  resizeZone: (zone: SpatialZone) => void;
  updateZone: (zone: SpatialZone) => void;
  beginSpatialGesture: () => void;
  commitZones: () => void;
  undoZones: () => void;
  redoZones: () => void;
  /* Phase 6 (Day 2) — freeform roads */
  selectRoad: (id: string | null) => void;
  addRoad: (road: SpatialRoad) => void;
  removeRoad: (id: string) => void;
  updateRoad: (road: SpatialRoad) => void;
  /**
   * GIS bounding-box import (PRD §7, Phase 4). Fetches the imported sparse
   * tiles, merges them into the authoritative state (existing tiles win), and
   * re-scores. Returns counts for compact UI feedback. Never mutates the city
   * on failure — a failed import leaves the current state untouched.
   */
  importGis: (
    bounds: GisBounds,
    origin: GisGridOrigin
  ) => Promise<{ imported: number; added: number }>;
}

const TOOL_TO_TILE: Partial<Record<ToolId, TileType>> = {
  residential: TILE.RESIDENTIAL,
  commercial: TILE.COMMERCIAL,
  green: TILE.GREEN,
  industrial: TILE.INDUSTRIAL,
  road: TILE.ROAD,
  road_local: TILE.ROAD_LOCAL,
  road_transit: TILE.ROAD_AVENUE,
  road_highway: TILE.ROAD_HIGHWAY,
};

/**
 * Bundles the reducer with the async scoring loop so components stay
 * declarative. Guards against out-of-order responses with a sequence ref.
 */
export function useCityPlanner(): CityPlanner {
  const [state, dispatch] = useReducer(cityReducer, initialState);
  const requestSeq = useRef(0);
  const boundsRef = useRef<GridBounds | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reportBounds = useCallback((bounds: GridBounds) => {
    boundsRef.current = bounds;
  }, []);

  const runCalculation = useCallback(
    async (tiles: GridState, action: LatestAction | null) => {
      const seq = ++requestSeq.current;
      dispatch({ type: "CALC_START" });
      try {
        const response = await calculateScores(
          tiles,
          action,
          boundsRef.current ?? undefined,
          undefined,
          stateRef.current.freeformMode,
          stateRef.current.zones,
          stateRef.current.roads
        );
        if (seq !== requestSeq.current) return; // stale response
        dispatch({
          type: "CALC_OK",
          scores: response.global_scores,
          delta: response.local_deltas,
          congestion: response.traffic_detail ?? null,
        });
        const delta = response.local_deltas;
        if (delta && delta.value !== 0) {
          const feedback: Feedback = {
            id: ++feedbackCounter,
            x: delta.x,
            y: delta.y,
            value: delta.value,
            metric: delta.metric,
          };
          dispatch({ type: "ADD_FEEDBACK", feedback });
          window.setTimeout(
            () => dispatch({ type: "REMOVE_FEEDBACK", id: feedback.id }),
            FEEDBACK_MS
          );
        }
      } catch (error) {
        if (seq !== requestSeq.current) return;
        const message = error instanceof Error ? error.message : "Unknown scoring error.";
        dispatch({ type: "CALC_FAIL", error: message });
      }
    },
    []
  );

  const modelUrlRef = useRef<string | null>(null);
  /** Pre-gesture zone snapshot for spatial undo (set on gesture start). */
  const gestureSnapshotRef = useRef<SpatialZone[] | null>(null);

  const placeAt = useCallback(
    (x: number, y: number) => {
      if (!inBounds(x, y)) return;
      const current = stateRef.current;
      const tool = current.tool;
      if (tool === "select") return;

      const key = tileKey(x, y);
      const existing = current.tiles.get(key);
      const previousType = existing?.type;

      if (tool === "erase") {
        if (!existing) return;
        const tiles = new Map(current.tiles);
        tiles.delete(key);
        stateRef.current = { ...stateRef.current, tiles };
        dispatch({ type: "PLACE", key, tileType: TILE.EMPTY });
        void runCalculation(tiles, {
          x,
          y,
          type: TILE.EMPTY,
          previous_type: previousType,
        });
        return;
      }

      const tileType = TOOL_TO_TILE[tool];
      if (tileType === undefined) return;

      // Attach the armed 3D model reference when present (PRD §16.2). The
      // model_url is tile metadata only — simulation semantics are unchanged.
      const tile: TileObject = { type: tileType };
      if (modelUrlRef.current) {
        tile.model_url = modelUrlRef.current;
      }

      const tiles = new Map(current.tiles);
      tiles.set(key, tile);
      stateRef.current = { ...stateRef.current, tiles };
      dispatch({ type: "PLACE", key, tileType });
      void runCalculation(tiles, { x, y, type: tileType, previous_type: previousType });
    },
    [runCalculation]
  );

  const armModel = useCallback((url: string | null) => {
    modelUrlRef.current = url;
  }, []);

  const setTool = useCallback(
    (tool: ToolId) => {
      // Eagerly sync the ref so a tool change followed immediately by a
      // placement in the same task sees the new tool.
      stateRef.current = cityReducer(stateRef.current, { type: "SET_TOOL", tool });
      dispatch({ type: "SET_TOOL", tool });
    },
    []
  );

  const clearCity = useCallback(() => {
    dispatch({ type: "CLEAR" });
    // Re-score the emptied city (no action → no local delta).
    void runCalculation(new Map(), null);
  }, [runCalculation]);

  const recalculate = useCallback(() => {
    void runCalculation(new Map(stateRef.current.tiles), null);
  }, [runCalculation]);

  const refreshLayouts = useCallback(async () => {
    dispatch({ type: "LAYOUTS_LOADING" });
    try {
      const result = await listLayouts();
      dispatch({ type: "LAYOUTS_LOADED", storage: result.storage, layouts: result.layouts });
    } catch (error) {
      dispatch({
        type: "LAYOUTS_ERROR",
        error: error instanceof Error ? error.message : "Failed to load layouts.",
      });
    }
  }, []);

  const saveCity = useCallback(
    async (name: string) => {
      const current = stateRef.current;
      const tilesPayload: Record<string, { type: number }> = {};
      current.tiles.forEach((tile, key) => {
        tilesPayload[key] = { type: tile.type };
      });
      // v2 wrapper when freeform zones exist (PRD Phase 5); legacy flat map
      // otherwise — both shapes load on both backends.
      const grid_state: Record<string, unknown> =
        current.zones.length > 0
          ? { version: 2, tiles: tilesPayload, zones: current.zones }
          : tilesPayload;
      await saveLayout({ name, grid_state });
      dispatch({ type: "SAVED", name, at: Date.now() });
      await refreshLayouts();
    },
    [refreshLayouts]
  );

  const loadCity = useCallback(async (layoutId: string) => {
    const detail = await loadLayout(layoutId);
    // Detect the v2 wrapper (tiles + zones) vs the legacy flat map.
    const raw = detail.grid_state as unknown;
    const isV2 =
      typeof raw === "object" &&
      raw !== null &&
      "version" in (raw as Record<string, unknown>) &&
      "tiles" in (raw as Record<string, unknown>);
    const grid: Record<string, { type: number }> = isV2
      ? ((raw as { tiles: Record<string, { type: number }> }).tiles)
      : (detail.grid_state as Record<string, { type: number }>);
    const zones: SpatialZone[] = isV2
      ? ((raw as { zones: SpatialZone[] }).zones ?? [])
      : [];
    dispatch({ type: "LAYOUT_LOAD", grid, zones });
    dispatch({ type: "CITY_NAMED", name: detail.name });
    dispatch({ type: "SAVED", name: detail.name, at: Date.now() });
    stateRef.current = {
      ...stateRef.current,
      zones,
      selectedZoneId: null,
    };
    void runCalculation(
      deriveTileMap(
        new Map(Object.entries(grid).map(([k, v]) => [k, { type: v.type as TileType }])),
        zones
      ),
      null
    );
  }, [runCalculation]);

  const importGis = useCallback(
    async (bounds: GisBounds, origin: GisGridOrigin) => {
      const response = await importGisArea(bounds, origin);
      const { merged, added } = mergeImportedTiles(
        stateRef.current.tiles,
        response.updated_grid
      );

      const importedZones: SpatialZone[] = (response.spatial_zones ?? []).map((sz) => ({
        id: sz.id,
        type: (sz.type as 1 | 2 | 3 | 5) ?? 1,
        position: sz.position,
        rotation: sz.rotation,
        footprint: sz.footprint,
        attributes: {},
      }));

      const importedRoads: SpatialRoad[] = (response.spatial_roads ?? []).map((sr) => ({
        id: sr.id,
        type: (sr.type as 4 | 40 | 41 | 42 | 43) ?? 41,
        points: sr.points,
        width: sr.width,
      }));

      const hasNewSpatial = importedZones.length > 0 || importedRoads.length > 0;

      if (added > 0 || hasNewSpatial) {
        const newZones = [...stateRef.current.zones, ...importedZones];
        const newRoads = [...stateRef.current.roads, ...importedRoads];
        const next = { ...stateRef.current, tiles: merged, zones: newZones, roads: newRoads };
        stateRef.current = next;
        dispatch({
          type: "IMPORT_MERGED",
          tiles: merged,
          zones: importedZones,
          roads: importedRoads,
        });
      }
      // Re-score after import (no latest action → no local delta).
      void runCalculation(added > 0 ? merged : new Map(stateRef.current.tiles), null);
      return { imported: response.tiles_imported, added: added + importedRoads.length + importedZones.length };
    },
    [runCalculation]
  );


  // Initial connection probe: score the empty city once on mount.
  useEffect(() => {
    void runCalculation(new Map(), null);
  }, [runCalculation]);

  // --- Phase 5 (Day 2): freeform spatial zones ----------------------------

  const recalcDerived = useCallback(() => {
    void runCalculation(
      deriveTileMap(stateRef.current.tiles, stateRef.current.zones),
      null
    );
  }, [runCalculation]);

  const setFreeform = useCallback((on: boolean) => {
    dispatch({ type: "SET_FREEFORM", on });
  }, []);

  const selectZone = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_ZONE", id });
  }, []);

  /** Add a freeform zone and re-score from the derived map. */
  const addZone = useCallback(
    (zone: SpatialZone) => {
      dispatch({ type: "ZONE_ADD", zone });
      stateRef.current = {
        ...stateRef.current,
        zones: [...stateRef.current.zones, zone],
        selectedZoneId: zone.id,
      };
      void recalcDerived();
    },
    [recalcDerived]
  );

  /** Remove a freeform zone and re-score. */
  const removeZone = useCallback(
    (id: string) => {
      const next = stateRef.current.zones.filter((z) => z.id !== id);
      stateRef.current = { ...stateRef.current, zones: next, selectedZoneId: null };
      dispatch({ type: "ZONE_REMOVE", id });
      void recalcDerived();
    },
    [recalcDerived]
  );

  /** Live move (drag) — update without pushing an undo entry. */
  const moveZone = useCallback(
    (id: string, position: GridPointXY) => {
      dispatch({ type: "ZONE_MOVE", id, position });
      stateRef.current = {
        ...stateRef.current,
        zones: stateRef.current.zones.map((z) =>
          z.id === id ? { ...z, position } : z
        ),
      };
      void recalcDerived();
    },
    [recalcDerived]
  );

  /** Live rotate (R key / handle) — update without an undo entry. */
  const rotateZone = useCallback(
    (id: string, rotation: number) => {
      dispatch({ type: "ZONE_ROTATE", id, rotation });
      stateRef.current = {
        ...stateRef.current,
        zones: stateRef.current.zones.map((z) =>
          z.id === id ? { ...z, rotation } : z
        ),
      };
      void recalcDerived();
    },
    [recalcDerived]
  );

  /** Live resize (corner drag) — full zone update without an undo entry. */
  const resizeZone = useCallback(
    (zone: SpatialZone) => {
      dispatch({ type: "ZONE_UPDATE_LIVE", zone });
      stateRef.current = {
        ...stateRef.current,
        zones: stateRef.current.zones.map((z) => (z.id === zone.id ? zone : z)),
      };
      void recalcDerived();
    },
    [recalcDerived]
  );

  /** Begin a spatial gesture — snapshot the pre-gesture zones for undo. */
  const beginSpatialGesture = useCallback(() => {
    gestureSnapshotRef.current = stateRef.current.zones.map((z) => ({ ...z }));
  }, []);

  /** Commit an in-progress spatial edit (push the pre-gesture snapshot once). */
  const commitZones = useCallback(() => {
    const snapshot = gestureSnapshotRef.current;
    gestureSnapshotRef.current = null;
    if (!snapshot) return;
    dispatch({ type: "SPATIAL_SNAPSHOT", zones: snapshot });
  }, []);

  const undoZones = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  const redoZones = useCallback(() => {
    dispatch({ type: "REDO" });
  }, []);

  // --- Phase 6 (Day 2): freeform roads -----------------------------------

  const selectRoad = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_ROAD", id });
  }, []);

  const addRoad = useCallback(
    (road: SpatialRoad) => {
      dispatch({ type: "ROAD_ADD", road });
      stateRef.current = {
        ...stateRef.current,
        roads: [...stateRef.current.roads, road],
        selectedRoadId: road.id,
      };
      void recalcDerived();
    },
    [recalcDerived]
  );

  const removeRoad = useCallback(
    (id: string) => {
      const next = stateRef.current.roads.filter((r) => r.id !== id);
      stateRef.current = { ...stateRef.current, roads: next, selectedRoadId: null };
      dispatch({ type: "ROAD_REMOVE", id });
      void recalcDerived();
    },
    [recalcDerived]
  );

  const updateRoad = useCallback(
    (road: SpatialRoad) => {
      const next = stateRef.current.roads.map((r) => (r.id === road.id ? road : r));
      stateRef.current = { ...stateRef.current, roads: next };
      dispatch({ type: "ROAD_UPDATE", road });
      void recalcDerived();
    },
    [recalcDerived]
  );

  const updateZone = useCallback(
    (zone: SpatialZone) => {
      const next = stateRef.current.zones.map((z) => (z.id === zone.id ? zone : z));
      stateRef.current = { ...stateRef.current, zones: next };
      dispatch({ type: "ZONE_UPDATE", zone });
      void recalcDerived();
    },
    [recalcDerived]
  );

  return {
    state,
    setTool,
    placeAt,
    clearCity,
    recalculate,
    reportBounds,
    refreshLayouts,
    saveCity,
    loadCity,
    importGis,
    armModel,
    setFreeform,
    selectZone,
    addZone,
    removeZone,
    moveZone,
    rotateZone,
    resizeZone,
    updateZone,
    beginSpatialGesture,
    commitZones,
    undoZones,
    redoZones,
    selectRoad,
    addRoad,
    removeRoad,
    updateRoad,
  };
}

