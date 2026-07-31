/** Stops must be at most this far from the route polyline (meters). */
export const ROUTE_STOP_RADIUS_M = 10_000;
const EARTH_R_M = 6_371_000;
function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
function latLonToLocalMeters(lat, lon, refLat, refLon) {
    const φ = (lat * Math.PI) / 180;
    const λ = (lon * Math.PI) / 180;
    const φ0 = (refLat * Math.PI) / 180;
    const λ0 = (refLon * Math.PI) / 180;
    const y = EARTH_R_M * (φ - φ0);
    const x = EARTH_R_M * (λ - λ0) * Math.cos(φ0);
    return [x, y];
}
/** Shortest distance from a point to a segment (great-circle endpoints, local planar projection). */
function distPointToSegmentMeters(plat, plon, lat1, lon1, lat2, lon2) {
    const refLat = (lat1 + lat2 + plat) / 3;
    const refLon = (lon1 + lon2 + plon) / 3;
    const [x1, y1] = latLonToLocalMeters(lat1, lon1, refLat, refLon);
    const [x2, y2] = latLonToLocalMeters(lat2, lon2, refLat, refLon);
    const [x0, y0] = latLonToLocalMeters(plat, plon, refLat, refLon);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6)
        return Math.hypot(x0 - x1, y0 - y1);
    let t = ((x0 - x1) * dx + (y0 - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const xc = x1 + t * dx;
    const yc = y1 + t * dy;
    return Math.hypot(x0 - xc, y0 - yc);
}
function routeCoordsForDistance(route) {
    const coords = route.coordinates;
    const maxPts = 4000;
    if (coords.length <= maxPts) {
        return coords.map((c) => [c[0], c[1]]);
    }
    const step = Math.ceil(coords.length / maxPts);
    const out = [];
    for (let i = 0; i < coords.length - 1; i += step) {
        const c = coords[i];
        out.push([c[0], c[1]]);
    }
    const last = coords[coords.length - 1];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== last[0] || prev[1] !== last[1]) {
        out.push([last[0], last[1]]);
    }
    return out;
}
export function minDistanceMetersToRoute(lat, lng, route) {
    const path = routeCoordsForDistance(route);
    if (path.length === 0)
        return Infinity;
    if (path.length === 1) {
        const [lon0, lat0] = path[0];
        return haversineMeters(lat, lng, lat0, lon0);
    }
    let min = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
        const [lng1, lat1] = path[i];
        const [lng2, lat2] = path[i + 1];
        const d = distPointToSegmentMeters(lat, lng, lat1, lng1, lat2, lng2);
        if (d < min)
            min = d;
    }
    return min;
}
export function filterStopsWithinRouteCorridor(stops, route, radiusM = ROUTE_STOP_RADIUS_M) {
    return stops.filter((s) => minDistanceMetersToRoute(s.latitude, s.longitude, route) <= radiusM);
}
/** Bounding-box padding (degrees) so Overpass includes candidates within ~`padKm` of the route. */
export function bboxPaddingDegrees(route, padKm) {
    const coords = route.coordinates;
    if (coords.length === 0)
        return 0.12;
    let sumLat = 0;
    for (const [, lat] of coords)
        sumLat += lat;
    const midLat = sumLat / coords.length;
    const cos = Math.max(Math.cos((midLat * Math.PI) / 180), 0.25);
    const dLat = padKm / 111;
    const dLon = padKm / (111 * cos);
    return Math.max(dLat, dLon, 0.02);
}
