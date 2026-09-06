/**
 * AreaMapPicker — two-click bounding-box selection on a Leaflet map (PRD §7.2).
 *
 * Click once to drop the first corner, click again to complete the box.
 * Clicking a third time starts a new selection. The parent owns the
 * `selection` value; `nonce` bumps let the panel apply preset selections
 * programmatically (fit bounds + redraw).
 */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GisBounds } from "../../types/city";

interface AreaMapPickerProps {
  selection: GisBounds | null;
  onSelect: (bounds: GisBounds | null) => void;
  /** Increment to force the picker to redraw/fit the current selection. */
  nonce: number;
}

const RECT_STYLE: L.PolylineOptions = {
  color: "#2dd4bf",
  weight: 1.5,
  opacity: 0.9,
  dashArray: "4 3",
  fillColor: "#2dd4bf",
  fillOpacity: 0.08,
};

export function AreaMapPicker({ selection, onSelect, nonce }: AreaMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const cornerARef = useRef<L.LatLng | null>(null);
  const markerARef = useRef<L.CircleMarker | null>(null);
  const markerBRef = useRef<L.CircleMarker | null>(null);
  const lastEmittedRef = useRef<GisBounds | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  // Initialize Leaflet once (StrictMode-safe: init → cleanup → init).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [40.7549, -73.984],
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const onClick = (event: L.LeafletMouseEvent) => {
      if (!cornerARef.current) {
        cornerARef.current = event.latlng;
        markerARef.current = L.circleMarker(event.latlng, {
          radius: 4,
          color: "#2dd4bf",
          fillColor: "#2dd4bf",
          fillOpacity: 1,
        }).addTo(map);
        return;
      }
      const a = cornerARef.current;
      const b = event.latlng;
      const bounds = L.latLngBounds(a, b);
      const next: GisBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };
      cornerARef.current = null;
      rectRef.current?.remove();
      markerARef.current?.remove();
      markerBRef.current?.remove();
      rectRef.current = L.rectangle(bounds, RECT_STYLE).addTo(map);
      markerARef.current = L.circleMarker(a, {
        radius: 3,
        color: "#2dd4bf",
        fillOpacity: 1,
      }).addTo(map);
      markerBRef.current = L.circleMarker(b, {
        radius: 3,
        color: "#2dd4bf",
        fillOpacity: 1,
      }).addTo(map);
      lastEmittedRef.current = next;
      onSelect(next);
    };

    map.on("click", onClick);
    mapRef.current = map;

    return () => {
      map.off("click", onClick);
      map.remove();
      mapRef.current = null;
      rectRef.current = null;
      cornerARef.current = null;
      markerARef.current = null;
      markerBRef.current = null;
      lastEmittedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync externally-driven selection changes (presets, clears) into the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sameSelection =
      selection === lastEmittedRef.current ||
      (selection !== null &&
        lastEmittedRef.current !== null &&
        Math.abs(selection.north - lastEmittedRef.current.north) < 1e-12 &&
        Math.abs(selection.south - lastEmittedRef.current.south) < 1e-12 &&
        Math.abs(selection.east - lastEmittedRef.current.east) < 1e-12 &&
        Math.abs(selection.west - lastEmittedRef.current.west) < 1e-12);
    if (sameSelection) return;

    rectRef.current?.remove();
    markerARef.current?.remove();
    markerBRef.current?.remove();
    rectRef.current = null;
    markerARef.current = null;
    markerBRef.current = null;
    cornerARef.current = null;
    lastEmittedRef.current = selection;

    if (selection) {
      const bounds = L.latLngBounds(
        L.latLng(selection.south, selection.west),
        L.latLng(selection.north, selection.east)
      );
      rectRef.current = L.rectangle(bounds, RECT_STYLE).addTo(map);
      map.fitBounds(bounds.pad(0.25));
    }
  }, [selection, nonce]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map picker — click twice to select a rectangular area"
      className="h-56 w-full overflow-hidden rounded-lg border border-border"
    />
  );
}
