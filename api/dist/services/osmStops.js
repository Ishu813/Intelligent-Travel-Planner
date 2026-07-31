import { randomUUID } from "node:crypto";
import { bboxPaddingDegrees, filterStopsWithinRouteCorridor } from "./routeCorridor.js";
const UA = "IntelligentTravelPlanner/1.0 (https://github.com/)";
function bboxForLineString(route, padDeg) {
    const coords = route.coordinates;
    if (coords.length === 0) {
        return { south: 0, west: 0, north: 0, east: 0 };
    }
    let south = Infinity;
    let north = -Infinity;
    let west = Infinity;
    let east = -Infinity;
    for (const [lng, lat] of coords) {
        south = Math.min(south, lat);
        north = Math.max(north, lat);
        west = Math.min(west, lng);
        east = Math.max(east, lng);
    }
    return {
        south: south - padDeg,
        west: west - padDeg,
        north: north + padDeg,
        east: east + padDeg
    };
}
function mapOsmToStopType(tags) {
    const a = tags.amenity ?? "";
    const t = tags.tourism ?? "";
    if (a === "fuel" || a === "charging_station")
        return "petrol_pump";
    if (a === "restaurant" || a === "fast_food" || a === "food_court" || a === "cafe")
        return "dhaba";
    if (a === "hospital" || a === "clinic" || a === "doctors" || a === "pharmacy")
        return "hospital";
    if (a === "atm" || a === "bank")
        return "atm";
    if (a === "hotel" || t === "hotel" || t === "guest_house" || t === "alpine_hut" || t === "chalet")
        return "hotel";
    if (a === "parking" || t === "viewpoint" || t === "picnic_site" || a === "rest")
        return "rest_area";
    return null;
}
function pickName(tags, fallback) {
    return (tags.name ||
        tags["name:en"] ||
        tags.operator ||
        tags.brand ||
        tags.ref ||
        fallback);
}
/**
 * Load amenities from OpenStreetMap (Overpass) in a padded bbox around the route,
 * then keep only points within 10 km of the route polyline (see `routeCorridor`).
 */
export async function fetchOsmStopsAlongRoute(route) {
    const coords = route.coordinates;
    if (coords.length < 2)
        return [];
    const padDeg = bboxPaddingDegrees(route, 12);
    const { south, west, north, east } = bboxForLineString(route, padDeg);
    const q = `
[out:json][timeout:55];
(
  node["amenity"="fuel"](${south},${west},${north},${east});
  way["amenity"="fuel"](${south},${west},${north},${east});
  node["amenity"="restaurant"](${south},${west},${north},${east});
  way["amenity"="restaurant"](${south},${west},${north},${east});
  node["amenity"="fast_food"](${south},${west},${north},${east});
  way["amenity"="fast_food"](${south},${west},${north},${east});
  node["amenity"="cafe"](${south},${west},${north},${east});
  node["amenity"="hospital"](${south},${west},${north},${east});
  way["amenity"="hospital"](${south},${west},${north},${east});
  node["amenity"="atm"](${south},${west},${north},${east});
  node["amenity"="pharmacy"](${south},${west},${north},${east});
  node["amenity"="hotel"](${south},${west},${north},${east});
  way["amenity"="hotel"](${south},${west},${north},${east});
  node["tourism"="hotel"](${south},${west},${north},${east});
  way["tourism"="hotel"](${south},${west},${north},${east});
  node["tourism"="guest_house"](${south},${west},${north},${east});
  node["tourism"="viewpoint"](${south},${west},${north},${east});
);
out center 200;
`.trim();
    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": UA
        },
        body: new URLSearchParams({ data: q }).toString()
    });
    if (!res.ok) {
        throw new Error(`Overpass error (${res.status})`);
    }
    const json = (await res.json());
    const elements = json.elements ?? [];
    const byKey = new Map();
    for (const el of elements) {
        const tags = el.tags ?? {};
        const type = mapOsmToStopType(tags);
        if (!type)
            continue;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon))
            continue;
        const key = `${(lat * 1000) | 0}:${(lon * 1000) | 0}:${type}`;
        if (byKey.has(key))
            continue;
        const amenity = tags.amenity ?? tags.tourism ?? "place";
        const name = pickName(tags, `${type.replace("_", " ")} (${amenity})`);
        byKey.set(key, {
            id: randomUUID(),
            name,
            type,
            latitude: lat,
            longitude: lon,
            altitude_m: null,
            rating: null,
            notes: tags.opening_hours ? `Hours: ${tags.opening_hours}` : `OpenStreetMap · ${el.type}/${el.id}`
        });
    }
    const merged = [...byKey.values()];
    const withinCorridor = filterStopsWithinRouteCorridor(merged, route);
    return withinCorridor.sort((a, b) => a.name.localeCompare(b.name));
}
