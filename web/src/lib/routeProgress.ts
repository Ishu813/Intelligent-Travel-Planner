import type { LineString } from "geojson";
import type { Stop } from "@trip-planner/shared/types";

export type StopWithProgress = Stop & {
  progressKm: number;
  /** Shortest distance from stop to route polyline (km). */
  crossTrackKm: number;
};

function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cumulativeDistancesKm(coords: [number, number][]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lng0, lat0] = coords[i - 1]!;
    const [lng1, lat1] = coords[i]!;
    cum.push(cum[i - 1]! + haversineKm(lng0, lat0, lng1, lat1));
  }
  return cum;
}

function closestPointOnRoute(
  coords: [number, number][],
  cum: number[],
  stopLng: number,
  stopLat: number
): { progressKm: number; crossTrackKm: number } {
  let bestCross = Infinity;
  let bestProgress = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const [lng0, lat0] = coords[i]!;
    const [lng1, lat1] = coords[i + 1]!;
    const segLen = cum[i + 1]! - cum[i]!;
    if (segLen < 1e-9) continue;

    const dx = lng1 - lng0;
    const dy = lat1 - lat0;
    const px = stopLng - lng0;
    const py = stopLat - lat0;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1e-12)));
    const projLng = lng0 + t * dx;
    const projLat = lat0 + t * dy;
    const cross = haversineKm(stopLng, stopLat, projLng, projLat);
    const progress = cum[i]! + t * segLen;

    if (cross < bestCross) {
      bestCross = cross;
      bestProgress = progress;
    }
  }

  return { progressKm: bestProgress, crossTrackKm: bestCross };
}

export function annotateStopsWithProgress(route: LineString, stops: Stop[]): StopWithProgress[] {
  const coords = route.coordinates as [number, number][];
  if (coords.length < 2) return [];

  const cum = cumulativeDistancesKm(coords);
  const out: StopWithProgress[] = [];

  for (const s of stops) {
    const { progressKm, crossTrackKm } = closestPointOnRoute(coords, cum, s.longitude, s.latitude);
    out.push({ ...s, progressKm, crossTrackKm });
  }

  out.sort((a, b) => a.progressKm - b.progressKm);
  return out;
}

/** Distance along the polyline from start to the closest point to (lat, lng), in km. */
export function progressKmOnRoute(geometry: LineString, lat: number, lng: number): number | null {
  const row = annotateStopsWithProgress(geometry, [
    { id: "__live", name: "Live", type: "dhaba", latitude: lat, longitude: lng }
  ]);
  return row[0]?.progressKm ?? null;
}
