import { z } from "zod";
const OpenElevationResponse = z.object({
    results: z.array(z.object({
        latitude: z.number(),
        longitude: z.number(),
        elevation: z.number().nullable().optional()
    }))
});
export async function sampleAltitudeAlongRoute(route) {
    // Sample up to ~40 points to keep public API usage reasonable
    const coords = route.coordinates;
    const n = Math.min(40, Math.max(12, coords.length));
    const idxs = evenlySpacedIndexes(coords.length, n);
    const points = idxs.map((i) => {
        const [lng, lat] = coords[i];
        return { latitude: lat, longitude: lng };
    });
    const elevations = await fetchElevations(points).catch(() => null);
    const out = [];
    let distKm = 0;
    for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        const [lng, lat] = coords[i];
        if (k > 0) {
            const [plng, plat] = coords[idxs[k - 1]] ?? [lng, lat];
            distKm += haversineKm(plat, plng, lat, lng);
        }
        const altitude = elevations?.[k] ?? null;
        out.push({ distance_km: distKm, altitude_m: altitude });
    }
    return out;
}
async function fetchElevations(points) {
    // Open-Elevation supports a JSON POST body.
    const res = await fetch("https://api.open-elevation.com/api/v1/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locations: points })
    });
    if (!res.ok)
        throw new Error(`Open-Elevation error (${res.status})`);
    const json = OpenElevationResponse.parse(await res.json());
    return json.results.map((r) => (typeof r.elevation === "number" ? r.elevation : null));
}
function evenlySpacedIndexes(len, n) {
    const idxs = [];
    for (let i = 0; i < n; i++) {
        idxs.push(Math.round((i * (len - 1)) / (n - 1)));
    }
    return Array.from(new Set(idxs));
}
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = degToRad(lat2 - lat1);
    const dLng = degToRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function degToRad(d) {
    return (d * Math.PI) / 180;
}
