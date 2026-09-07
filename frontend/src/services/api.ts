/**
 * API client for the MetroGrid backend (PRD §12.1).
 *
 * The frontend never calculates scores — the backend is authoritative
 * (PRD §22.9-10). All errors surface as `ApiError` with a safe message.
 */

import type {
  CalculateResponse,
  GisBounds,
  GisGridOrigin,
  GisImportRequest,
  GisImportResponse,
  GridState,
  LatestAction,
  LayoutDetail,
  LayoutListResponse,
  SaveLayoutRequest,
} from "../types/city";

const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

const REQUEST_TIMEOUT_MS = 8000;
/**
 * GIS fetches go upstream to Overpass (primary + two mirrors, each up to 60 s
 * server-side). The client budget must cover the full backend chain — 3 min —
 * or the UI aborts while the backend is still working through the mirrors.
 */
const GIS_TIMEOUT_MS = 180_000;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Serialize the sparse map into the PRD JSON shape: {"x,y": {"type": n}}. */
export function serializeTiles(tiles: GridState): Record<string, { type: number }> {
  const out: Record<string, { type: number }> = {};
  tiles.forEach((tile, key) => {
    out[key] = { type: tile.type };
  });
  return out;
}

export async function calculateScores(
  tiles: GridState,
  latestAction: LatestAction | null,
  activeBounds?: { min_x: number; max_x: number; min_y: number; max_y: number },
  signal?: AbortSignal,
  isFreeform?: boolean,
  zones?: import("../types/spatial").SpatialZone[]
): Promise<CalculateResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Allow caller cancellation to compose with the timeout.
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  const zonesPayload = zones?.map((z) => ({
    id: z.id,
    type: z.type,
    position: z.position,
    rotation: z.rotation,
    footprint: z.footprint,
    area: z.footprint.width * z.footprint.depth,
  }));

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tiles: serializeTiles(tiles),
        latest_action: latestAction,
        active_bounds: activeBounds,
        is_freeform: Boolean(isFreeform),
        zones: zonesPayload,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "Scoring request timed out or was cancelled.");
    }
    throw new ApiError(0, "Backend unavailable. Is the API server running?");
  }
  clearTimeout(timeout);

  if (!response.ok) {
    let detail = `Scoring failed (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep default detail
    }
    throw new ApiError(response.status, detail);
  }

  try {
    return (await response.json()) as CalculateResponse;
  } catch {
    throw new ApiError(response.status, "Scoring API returned an invalid response.");
  }
}

const LAYOUTS_BASE = `${API_BASE}/api/layouts`;

/**
 * GIS bounding-box import (PRD §7, §12.2). Returns the imported sparse tile
 * map; the caller merges it into the authoritative city state.
 */
export async function importGisArea(
  bounds: GisBounds,
  gridOrigin: GisGridOrigin,
  signal?: AbortSignal
): Promise<GisImportResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GIS_TIMEOUT_MS);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/gis/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bounds,
        grid_origin: gridOrigin,
      } satisfies GisImportRequest),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "Import timed out or was cancelled.");
    }
    throw new ApiError(0, "Backend unavailable. Is the API server running?");
  }
  clearTimeout(timeout);

  if (!response.ok) {
    let detail = `GIS import failed (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep default detail
    }
    throw new ApiError(response.status, detail);
  }

  try {
    return (await response.json()) as GisImportResponse;
  } catch {
    throw new ApiError(response.status, "GIS API returned an invalid response.");
  }
}

export interface AssetUploadResponse {
  filename: string;
  model_url: string;
  size_bytes: number;
  content_type: string;
}

const ASSETS_BASE = `${API_BASE}/api/assets`;

/**
 * Upload a 3D model (.glb / .gltf) to Supabase Storage (PRD §12.3, Phase 5).
 * The backend verifies file type by magic bytes and caps size at 25 MB.
 */
export async function uploadAsset(
  file: File,
  signal?: AbortSignal
): Promise<AssetUploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(`${ASSETS_BASE}/upload`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "Upload timed out or was cancelled.");
    }
    throw new ApiError(0, "Backend unavailable while uploading the model.");
  }
  clearTimeout(timeout);

  if (!response.ok) {
    let detail = `Upload failed (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep default detail
    }
    throw new ApiError(response.status, detail);
  }

  try {
    return (await response.json()) as AssetUploadResponse;
  } catch {
    throw new ApiError(response.status, "Upload API returned an invalid response.");
  }
}

export async function listLayouts(): Promise<LayoutListResponse> {
  return (await _getJson(`${LAYOUTS_BASE}`)) as LayoutListResponse;
}

export async function saveLayout(payload: SaveLayoutRequest): Promise<LayoutDetail> {
  const response = await _postJson(LAYOUTS_BASE, payload);
  return response.data as LayoutDetail;
}

export async function loadLayout(layoutId: string): Promise<LayoutDetail> {
  return (await _getJson(`${LAYOUTS_BASE}/${layoutId}`)) as LayoutDetail;
}

async function _getJson(url: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ApiError(0, "Backend unavailable while fetching.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, await _safeDetail(response));
  }
  return response.json();
}

async function _postJson(url: string, body: unknown): Promise<{ data: any }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Backend unavailable while saving.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, await _safeDetail(response));
  }
  return { data: await response.json() };
}

async function _safeDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // fall through to status text
  }
  return `Request failed (HTTP ${response.status}).`;
}
