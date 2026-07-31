import { z } from "zod";
import { geocodeOrderedPlaces } from "./geocode.js";
const OsrmResponse = z.object({
    routes: z.array(z.object({
        distance: z.number(),
        duration: z.number(),
        geometry: z.object({
            coordinates: z.array(z.tuple([z.number(), z.number()])),
            type: z.literal("LineString")
        })
    }))
});
function osrmProfile(mode) {
    return mode === "bike" ? "cycling" : "driving";
}
export async function getRouteOptions(input) {
    const via = (input.viaPlaces ?? []).map((v) => v.trim()).filter(Boolean);
    const chain = [input.from.trim(), ...via, input.to.trim()];
    const points = await geocodeOrderedPlaces(chain);
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const profile = osrmProfile(input.mode);
    const url = new URL(`https://router.project-osrm.org/route/v1/${profile}/${coords}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("alternatives", "true");
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`OSRM routing error (${res.status})`);
    const json = OsrmResponse.parse(await res.json());
    const routes = json.routes.slice(0, 3);
    if (routes.length === 0)
        throw new Error("No routes returned by OSRM");
    const withIdx = routes.map((r, idx) => ({ ...r, idx }));
    const fastest = withIdx.reduce((a, b) => (a.duration <= b.duration ? a : b));
    const scenic = withIdx.reduce((a, b) => (a.distance >= b.distance ? a : b));
    const safest = withIdx.find((r) => r.idx !== fastest.idx && r.idx !== scenic.idx) ?? fastest;
    const byProfile = [
        { profile: "fastest", r: fastest },
        { profile: "scenic", r: scenic },
        { profile: "safest", r: safest }
    ];
    return byProfile.map(({ profile, r }) => ({
        profile,
        distance_km: r.distance / 1000,
        duration_min: r.duration / 60,
        geometry: r.geometry
    }));
}
