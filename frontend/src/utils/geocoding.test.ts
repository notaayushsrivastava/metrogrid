import { describe, it, expect, vi } from "vitest";
import { createCenteredBounds, searchLocations, getCurrentCoordinates } from "./geocoding";

describe("geocoding utils", () => {
  it("createCenteredBounds calculates valid geographic bounding boxes", () => {
    const bounds = createCenteredBounds(40.758, -73.9855, 500);
    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
    expect(bounds.north).toBeCloseTo(40.76, 2);
    expect(bounds.south).toBeCloseTo(40.755, 2);
  });

  it("searchLocations fetches and parses OpenStreetMap geocoding responses", async () => {
    const mockData = [
      {
        place_id: 12345,
        lat: "48.8566",
        lon: "2.3522",
        display_name: "Paris, Île-de-France, France",
        name: "Paris",
        boundingbox: ["48.8155", "48.9021", "2.2241", "2.4699"],
        type: "city",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    }) as any;

    const results = await searchLocations("Paris");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Paris");
    expect(results[0].lat).toBeCloseTo(48.8566);
    expect(results[0].lon).toBeCloseTo(2.3522);
    expect(results[0].bounds).toBeDefined();
    expect(results[0].bounds?.north).toBeGreaterThan(results[0].bounds?.south ?? 0);
  });

  it("searchLocations returns empty array on short or blank query", async () => {
    const results = await searchLocations("   ");
    expect(results).toEqual([]);
  });

  it("getCurrentCoordinates resolves coordinates from navigator.geolocation", async () => {
    const mockGeolocation = {
      getCurrentPosition: (success: any) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        });
      },
    };

    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: mockGeolocation,
      configurable: true,
    });

    const coords = await getCurrentCoordinates();
    expect(coords.lat).toBeCloseTo(37.7749);
    expect(coords.lon).toBeCloseTo(-122.4194);
  });

  it("getCurrentCoordinates handles geolocation errors", async () => {
    const mockGeolocation = {
      getCurrentPosition: (_success: any, error: any) => {
        error({ code: 1, message: "Permission denied" });
      },
    };

    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: mockGeolocation,
      configurable: true,
    });

    await expect(getCurrentCoordinates()).rejects.toThrow("Location permission denied");
  });
});
