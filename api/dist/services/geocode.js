import { z } from "zod";
const NominatimResult = z.array(z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string().optional()
}));
const UA = "IntelligentTravelPlanner/1.0 (https://github.com/)";
export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/** Geocode each name in order (Nominatim-friendly spacing between requests). */
export async function geocodeOrderedPlaces(names) {
    const out = [];
    if (names.length === 0)
        throw new Error("No places to geocode.");
    for (let i = 0; i < names.length; i++) {
        if (i > 0)
            await sleep(1100);
        const raw = names[i]?.trim() ?? "";
        const g = await geocodePlace(raw);
        if (!g) {
            throw new Error(`Could not find a place matching “${raw}”. Try a city or full address.`);
        }
        out.push(g);
    }
    return out;
}
/** Forward geocode a free-text place using OpenStreetMap Nominatim (respect their usage policy). */
export async function geocodePlace(query, opts) {
    const q = query.trim();
    if (!q)
        return null;
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    if (opts?.countrycodes) {
        url.searchParams.set("countrycodes", opts.countrycodes);
    }
    const res = await fetch(url.toString(), {
        headers: { "User-Agent": UA, Accept: "application/json" }
    });
    if (!res.ok)
        throw new Error(`Geocoding failed (${res.status})`);
    const parsed = NominatimResult.parse(await res.json());
    const hit = parsed[0];
    if (!hit)
        return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    return { lat, lng, label: hit.display_name ?? q };
}
export async function geocodeFromTo(from, to) {
    const pts = await geocodeOrderedPlaces([from, to]);
    return {
        from: { lat: pts[0].lat, lng: pts[0].lng },
        to: { lat: pts[1].lat, lng: pts[1].lng }
    };
}
