"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "@/lib/geo";

// The pin's look (placeholder): a drawn shape, so no marker image files are needed
const PIN_HTML =
  '<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:#1f5130;' +
  'border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>';

// FR28: the Checkout map. The pin starts at the given point; dragging it or tapping the map moves it.
export function DeliveryMap({ point, onChange }: { point: Point; onChange: (p: Point) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const startRef = useRef(point);
  const onChangeRef = useRef(onChange);

  // Always call the latest onChange without rebuilding the map
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Leaflet needs the browser, so it is loaded here, after the page is on screen, and created once
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const start = startRef.current;
      const map = L.map(containerRef.current).setView([start.lat, start.lng], 16);
      // Map tiles from OpenStreetMap, which requires this credit on the map
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      const icon = L.divIcon({ className: "", html: PIN_HTML, iconSize: [24, 24], iconAnchor: [12, 24] });
      const marker = L.marker([start.lat, start.lng], { draggable: true, icon, title: "Delivery point" }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      mapRef.current = map;
      markerRef.current = marker;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Keep the pin in step if the page moves the point itself
  useEffect(() => {
    markerRef.current?.setLatLng([point.lat, point.lng]);
  }, [point.lat, point.lng]);

  return <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-lg border border-line" />;
}
