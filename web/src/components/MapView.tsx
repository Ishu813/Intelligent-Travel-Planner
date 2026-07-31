"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Stop, FullJourneyPlan } from "@trip-planner/shared/types";
import type { LineString } from "geojson";
import { haversineKm, type MapUserLocation } from "@/lib/geo";

export type { MapUserLocation } from "@/lib/geo";

// Color per transport mode
const MODE_COLOR: Record<string, string> = {
  flight: "#3B82F6",  // blue
  train: "#EF4444",   // red
  bus: "#22C55E",     // green
  cab: "#F97316",     // orange
  walk: "#9CA3AF",    // gray
};

// Generate a curved arc of points between two lat/lng pairs (for flights)
function makeCurvedArc(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  steps = 60
): [number, number][] {
  const pts: [number, number][] = [];
  const dist = Math.sqrt(Math.pow(toLat - fromLat, 2) + Math.pow(toLng - fromLng, 2));
  const bulge = Math.min(dist * 0.25, 8); // arc height proportional to distance
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = fromLat + (toLat - fromLat) * t;
    const lng = fromLng + (toLng - fromLng) * t;
    // Parabolic bulge perpendicular to the route (northward for visual clarity)
    const height = Math.sin(Math.PI * t) * bulge;
    pts.push([lat + height, lng]);
  }
  return pts;
}

export function MapView({
  route,
  stops,
  journeyPlan,
  userLocation,
  containerClassName = "h-[540px] w-full",
  fillHeight = false,
}: {
  route: LineString | null;
  stops: Stop[];
  journeyPlan?: FullJourneyPlan | null;
  userLocation?: MapUserLocation | null;
  containerClassName?: string;
  fillHeight?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const baseLayerRef = useRef<import("leaflet").Polyline | null>(null);
  const journeyLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const stopLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const userLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const initInFlightRef = useRef(false);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Init Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current || initInFlightRef.current) return;
    let cancelled = false;
    initInFlightRef.current = true;

    (async () => {
      const L = await import("leaflet");
      if (cancelled) { initInFlightRef.current = false; return; }
      leafletRef.current = L;

      const map = L.map(containerRef.current!, { zoomControl: false, attributionControl: true })
        .setView([22.5937, 82.9629], 5); // center of India

      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      journeyLayerRef.current = L.layerGroup().addTo(map);
      stopLayerRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      initInFlightRef.current = false;

      if (containerRef.current && typeof ResizeObserver !== "undefined") {
        resizeObsRef.current = new ResizeObserver(() => map.invalidateSize());
        resizeObsRef.current.observe(containerRef.current);
      }

      if (!cancelled) {
        setMapReady(true);
        requestAnimationFrame(() => map.invalidateSize());
      } else {
        map.remove();
        mapRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      initInFlightRef.current = false;
      resizeObsRef.current?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Road-trip route (legacy LineString)
  const routeLatLngs = useMemo(() => {
    if (!route) return null;
    return route.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [route]);

  // Render all map content whenever data changes
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const journeyLayer = journeyLayerRef.current;
    const stopLayer = stopLayerRef.current;
    const userLayer = userLayerRef.current;
    if (!mapReady || !map || !L || !journeyLayer || !stopLayer || !userLayer) return;

    // Clear previous layers
    if (baseLayerRef.current) { baseLayerRef.current.removeFrom(map); baseLayerRef.current = null; }
    journeyLayer.clearLayers();
    stopLayer.clearLayers();
    userLayer.clearLayers();

    const allBoundsPoints: import("leaflet").LatLng[] = [];

    // ── Road-trip route (legacy) ──
    if (routeLatLngs?.length) {
      baseLayerRef.current = L.polyline(routeLatLngs, { color: "#2563eb", weight: 4, opacity: 0.85 }).addTo(map);
      routeLatLngs.forEach(([lat, lng]) => allBoundsPoints.push(L.latLng(lat, lng)));
    }

    // ── Journey plan: multi-modal routes + pins ──
    if (journeyPlan) {
      // Draw transport segments
      for (const seg of journeyPlan.mapRoute) {
        if (!seg.from.lat || !seg.from.lng || !seg.to.lat || !seg.to.lng) continue;
        const color = MODE_COLOR[seg.mode] ?? "#6B7280";
        const isDashed = seg.mode === "flight" || seg.mode === "train";

        if (seg.mode === "flight") {
          // Curved arc for flights
          const arcPts = makeCurvedArc(seg.from.lat, seg.from.lng, seg.to.lat, seg.to.lng);
          L.polyline(arcPts, { color, weight: 2, opacity: 0.8, dashArray: "8 6" }).addTo(journeyLayer);

          // Plane icon at arc midpoint
          const mid = arcPts[Math.floor(arcPts.length / 2)]!;
          L.marker(mid, {
            icon: L.divIcon({
              className: "",
              html: `<div style="font-size:16px;line-height:1;">✈️</div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
          }).addTo(journeyLayer);
        } else {
          const lineOpts: import("leaflet").PolylineOptions = { color, weight: 3, opacity: 0.8 };
          if (isDashed) lineOpts.dashArray = "6 4";
          L.polyline([[seg.from.lat, seg.from.lng], [seg.to.lat, seg.to.lng]], lineOpts).addTo(journeyLayer);
        }

        allBoundsPoints.push(L.latLng(seg.from.lat, seg.from.lng));
        allBoundsPoints.push(L.latLng(seg.to.lat, seg.to.lng));
      }

      // Collect unique hotels and activities for pins
      const seenHotels = new Set<string>();
      for (const day of journeyPlan.days) {
        // Activity pins (yellow star)
        for (const act of day.activities) {
          if (!act.lat || !act.lng) continue;
          L.circleMarker([act.lat, act.lng], {
            radius: 7, color: "#78350f", weight: 1.5,
            fillColor: "#EAB308", fillOpacity: 0.95,
          })
            .bindPopup(
              `<div style="font-weight:600">⭐ ${escapeHtml(act.placeName)}</div>` +
              `<div style="font-size:11px;color:#52525b;margin-top:3px">Day ${day.day} · ${act.timeSlot}</div>`
            )
            .addTo(journeyLayer);
          allBoundsPoints.push(L.latLng(act.lat, act.lng));
        }

        // Hotel pins (purple bed)
        if (day.hotel?.name && !seenHotels.has(day.hotel.name)) {
          seenHotels.add(day.hotel.name);
          // Find any activity coord for this day to use as hotel approximation
          const ref = day.activities.find((a) => a.lat && a.lng);
          if (ref?.lat && ref?.lng) {
            L.circleMarker([ref.lat, ref.lng], {
              radius: 8, color: "#4c1d95", weight: 1.5,
              fillColor: "#8B5CF6", fillOpacity: 0.9,
            })
              .bindPopup(
                `<div style="font-weight:600">🏨 ${escapeHtml(day.hotel.name)}</div>` +
                `<div style="font-size:11px;color:#52525b;margin-top:3px">${escapeHtml(day.hotel.location)}</div>`
              )
              .addTo(journeyLayer);
          }
        }
      }
    }

    // ── Legacy road-trip stops ──
    for (const stop of stops) {
      const marker = L.circleMarker([stop.latitude, stop.longitude], {
        radius: 6, color: "#0f172a", weight: 1.5,
        fillColor: colorForType(stop.type), fillOpacity: 0.9,
      });
      marker.bindPopup(
        `<div style="font-weight:600">${escapeHtml(stop.name)}</div>` +
        `<div style="font-size:11px;color:#52525b;margin-top:3px">${stop.type.replaceAll("_", " ")}</div>`
      );
      marker.addTo(stopLayer);
      allBoundsPoints.push(L.latLng(stop.latitude, stop.longitude));
    }

    // ── User location ──
    if (userLocation) {
      const icon = L.divIcon({
        className: "leaflet-user-location-root",
        html: '<div class="leaflet-user-location-marker"><div class="leaflet-user-location-pulse"></div><div class="leaflet-user-location-dot"></div></div>',
        iconSize: [22, 22], iconAnchor: [11, 11],
      });
      L.marker([userLocation.lat, userLocation.lng], { icon, zIndexOffset: 2000 })
        .bindPopup(`<div style="font-weight:600">You are here</div>`)
        .addTo(userLayer);
      allBoundsPoints.push(L.latLng(userLocation.lat, userLocation.lng));
    }

    // Fit bounds to all visible points
    if (allBoundsPoints.length > 0) {
      const bounds = L.latLngBounds(allBoundsPoints);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    }
    map.invalidateSize();
  }, [mapReady, routeLatLngs, stops, journeyPlan, userLocation]);

  return (
    <div className={fillHeight ? "relative h-full min-h-0 w-full min-w-0" : "relative min-h-0 w-full min-w-0"}>
      <div ref={containerRef} className={containerClassName} />
    </div>
  );
}

function colorForType(type: Stop["type"]) {
  const colors: Record<string, string> = {
    petrol_pump: "#60a5fa",
    hospital: "#f87171",
    atm: "#34d399",
    hotel: "#a78bfa",
    dhaba: "#fbbf24",
    rest_area: "#fb7185",
  };
  return colors[type] ?? "#e5e7eb";
}

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
