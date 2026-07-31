import { z } from "zod";

const NominatimResult = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string().optional(),
  }),
);

const UA = "IntelligentTravelPlanner/1.0 (https://github.com/)";

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function geocodePlace(
  query: string,
  opts?: { countrycodes?: string },
) {
  const q = query.trim();
  if (!q) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  if (opts?.countrycodes) {
    url.searchParams.set("countrycodes", opts.countrycodes);
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) {
    // Nominatim rate-limits aggressive clients; missing coords is non-fatal.
    if (res.status === 429 || res.status === 503) return null;
    throw new Error(`Geocoding failed (${res.status})`);
  }

  const parsed = NominatimResult.parse(await res.json());
  const hit = parsed[0];
  if (!hit) return null;

  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng, label: hit.display_name ?? q };
}
