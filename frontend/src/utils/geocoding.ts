/**
 * Geocoding and Location Utilities
 * Handles location searches via OpenStreetMap Nominatim and browser Geolocation.
 */

import type { GisBounds } from "../types/city";

export interface GeocodingResult {
  placeId: string;
  displayName: string;
  name: string;
  lat: number;
  lon: number;
  bounds?: GisBounds;
  type?: string;
}

const METERS_PER_DEG_LAT = 110_574;
const METERS_PER_DEG_LON = 111_320;

/**
 * Creates a sensible bounding box in meters around a center latitude/longitude.
 */
export function createCenteredBounds(lat: number, lon: number, spanMeters: number = 450): GisBounds {
  const deltaLat = spanMeters / 2 / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const deltaLon = spanMeters / 2 / (METERS_PER_DEG_LON * Math.max(0.01, cosLat));

  return {
    north: Math.round((lat + deltaLat) * 10000) / 10000,
    south: Math.round((lat - deltaLat) * 10000) / 10000,
    east: Math.round((lon + deltaLon) * 10000) / 10000,
    west: Math.round((lon - deltaLon) * 10000) / 10000,
  };
}

/**
 * Searches locations using OpenStreetMap Nominatim API.
 */
export async function searchLocations(query: string, signal?: AbortSignal): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    trimmed
  )}&limit=6&addressdetails=1`;

  try {
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Location search failed (${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => {
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);

      let bounds: GisBounds | undefined;
      if (Array.isArray(item.boundingbox) && item.boundingbox.length === 4) {
        const [south, north, west, east] = item.boundingbox.map(parseFloat);
        if (
          Number.isFinite(north) &&
          Number.isFinite(south) &&
          Number.isFinite(east) &&
          Number.isFinite(west) &&
          north > south &&
          east > west
        ) {
          // If the bounding box is too huge (e.g. whole country), clamp to a city-scale neighborhood
          const spanDegLat = north - south;
          const spanDegLon = east - west;
          if (spanDegLat > 0.08 || spanDegLon > 0.08) {
            bounds = createCenteredBounds(lat, lon, 600);
          } else {
            bounds = { north, south, east, west };
          }
        }
      }

      if (!bounds) {
        bounds = createCenteredBounds(lat, lon, 500);
      }

      return {
        placeId: String(item.place_id || `${lat},${lon}`),
        displayName: item.display_name || trimmed,
        name: item.name || item.display_name?.split(",")[0] || trimmed,
        lat,
        lon,
        bounds,
        type: item.type,
      };
    });
  } catch (err: any) {
    if (err.name === "AbortError") return [];
    console.warn("Geocoding lookup error:", err);
    return [];
  }
}

/**
 * Requests the user's current GPS position via browser Geolocation API.
 */
export function getCurrentCoordinates(options?: PositionOptions): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => {
        let msg = "Could not retrieve your location.";
        if (err.code === 1) {
          msg = "Location permission denied. Please allow location access in your browser settings.";
        } else if (err.code === 2) {
          msg = "Location position unavailable. Please check your network/GPS connection.";
        } else if (err.code === 3) {
          msg = "Location request timed out. Please try again.";
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
        ...options,
      }
    );
  });
}

