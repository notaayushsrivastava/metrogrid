/**
 * Authoritative city state (PRD §19) + the placement → scoring loop
 * (PRD §14.2). The sparse `Map<string, TileObject>` is the single source of
 * truth; scores, deltas, and feedback are derived/transient.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { calculateScores } from "../services/api";
import {
  GRID_MAX,
  GRID_MIN,
  TILE,
  type Feedback,
  type GlobalScores,
  type GridBounds,
  type GridState,
  type LatestAction,
  type LocalDelta,
  type TileType,
  type ToolId,
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
  tool: ToolId;
  scores: GlobalScores | null;
  movement: MetricMovement | null;
  status: ConnectionStatus;
  calculating: boolean;
  error: string | null;
  feedbacks: Feedback[];
}

export const FEEDBACK_MS = 1500;

type CityAction =
  | { type: "SET_TOOL"; tool: ToolId }
  | { type: "PLACE"; key: string; tileType: TileType }
  | { type: "CLEAR" }
  | { type: "CALC_START" }
  | { type: "CALC_OK"; scores: GlobalScores; delta: LocalDelta | null }
  | { type: "CALC_FAIL"; error: string }
  | { type: "ADD_FEEDBACK"; feedback: Feedback }
  | { type: "REMOVE_FEEDBACK"; id: number };

export const initialState: CityState = {
  tiles: new Map(),
  tool: "residential",
  scores: null,
  movement: null,
  status: "connecting",
  calculating: false,
  error: null,
  feedbacks: [],
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
        movement: applyMovement(state.scores, action.scores),
      };

    case "CALC_FAIL":
      return { ...state, status: "offline", calculating: false, error: action.error };

    case "ADD_FEEDBACK":
      return { ...state, feedbacks: [...state.feedbacks.slice(-4), action.feedback] };

    case "REMOVE_FEEDBACK":
      return { ...state, feedbacks: state.feedbacks.filter((f) => f.id !== action.id) };

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
}

const TOOL_TO_TILE: Partial<Record<ToolId, TileType>> = {
  residential: TILE.RESIDENTIAL,
  commercial: TILE.COMMERCIAL,
  green: TILE.GREEN,
  industrial: TILE.INDUSTRIAL,
  road: TILE.ROAD,
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
        const response = await calculateScores(tiles, action, boundsRef.current ?? undefined);
        if (seq !== requestSeq.current) return; // stale response
        dispatch({
          type: "CALC_OK",
          scores: response.global_scores,
          delta: response.local_deltas,
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

      const tiles = new Map(current.tiles);
      tiles.set(key, { type: tileType });
      stateRef.current = { ...stateRef.current, tiles };
      dispatch({ type: "PLACE", key, tileType });
      void runCalculation(tiles, { x, y, type: tileType, previous_type: previousType });
    },
    [runCalculation]
  );

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

  // Initial connection probe: score the empty city once on mount.
  useEffect(() => {
    void runCalculation(new Map(), null);
  }, [runCalculation]);

  return { state, setTool, placeAt, clearCity, recalculate, reportBounds };
}

