import { PNG } from "pngjs";
// Terrain-RGB decoding: https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb/
// elevation(m) = -10000 + (R*256*256 + G*256 + B) * 0.1
const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export async function sampleAltitudeAlongRoute(route) {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token)
        return [];
    // Keep it simple: sample N points along the LineString by index (not true distance).
    const coords = route.coordinates;
    const n = Math.min(60, Math.max(10, coords.length));
    const idxs = evenlySpacedIndexes(coords.length, n);
    const out = [];
    let distKm = 0;
    for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        const [lng, lat] = coords[i];
        const altitude = await terrainRgbAtLatLng(lat, lng, token).catch(() => null);
        if (k > 0) {
            const [plng, plat] = coords[idxs[k - 1]] ?? [lng, lat];
            distKm += haversineKm(plat, plng, lat, lng);
        }
        out.push({ distance_km: distKm, altitude_m: altitude });
    }
    return out;
}
function evenlySpacedIndexes(len, n) {
    const idxs = [];
    for (let i = 0; i < n; i++) {
        idxs.push(Math.round((i * (len - 1)) / (n - 1)));
    }
    return Array.from(new Set(idxs));
}
async function terrainRgbAtLatLng(lat, lng, token) {
    const zZoom = 12;
    const { x, y } = lngLatToTile(lng, lat, zZoom);
    const { px, py } = lngLatToPixelInTile(lng, lat, zZoom);
    const url = new URL(`https://api.mapbox.com/v4/mapbox.terrain-rgb/${zZoom}/${x}/${y}.pngraw`);
    url.searchParams.set("access_token", token);
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Terrain tile error (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!startsWith(buf, PNG_SIG))
        throw new Error("Unexpected terrain tile format");
    const png = PNG.sync.read(buf);
    const xPx = clamp(Math.floor(px), 0, png.width - 1);
    const yPx = clamp(Math.floor(py), 0, png.height - 1);
    const idx = (png.width * yPx + xPx) << 2;
    const r = png.data[idx] ?? 0;
    const g = png.data[idx + 1] ?? 0;
    const b = png.data[idx + 2] ?? 0;
    const height = -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
    return height;
}
function startsWith(a, prefix) {
    for (let i = 0; i < prefix.length; i++)
        if (a[i] !== prefix[i])
            return false;
    return true;
}
function lngLatToTile(lng, lat, zoom) {
    const n = 2 ** zoom;
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y };
}
function lngLatToPixelInTile(lng, lat, zoom) {
    const n = 2 ** zoom;
    const x = ((lng + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        n;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    return { px: fx * 256, py: fy * 256 };
}
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
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
