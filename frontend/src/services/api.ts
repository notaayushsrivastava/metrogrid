/**
 * API client for the MetroGrid backend (PRD §12.1).
 *
 * The frontend never calculates scores — the backend is authoritative
 * (PRD §22.9-10). All errors surface as `ApiError` with a safe message.
 */

import type { CalculateResponse, GridState, LatestAction } from "../types/city";

const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

const REQUEST_TIMEOUT_MS = 8000;

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
  signal?: AbortSignal
): Promise<CalculateResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Allow caller cancellation to compose with the timeout.
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tiles: serializeTiles(tiles),
        latest_action: latestAction,
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
