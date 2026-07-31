import { v4 as uuidv4 } from "uuid";
import { db } from "./db.js";
import { fetchOsmStopsAlongRoute } from "./osmStops.js";
import { ROUTE_STOP_RADIUS_M } from "./routeCorridor.js";
function lineStringToWkt(route) {
    const coords = route.coordinates
        .map((pos) => `${pos[0]} ${pos[1]}`)
        .join(", ");
    return `LINESTRING(${coords})`;
}
export function mergeStopLists(a, b) {
    const seen = new Set();
    const out = [];
    for (const s of [...a, ...b]) {
        const k = `${Math.round(s.latitude * 4000)}_${Math.round(s.longitude * 4000)}_${s.type}`;
        if (seen.has(k))
            continue;
        seen.add(k);
        out.push(s);
    }
    return out.sort((x, y) => x.name.localeCompare(y.name));
}
async function findStopsInDatabaseNearRoute(route) {
    const wkt = lineStringToWkt(route);
    const rows = await db.query(`
    select id, name, type, latitude, longitude, altitude_m, rating, notes
    from stops
    where ST_DWithin(
      location::geography,
      ST_SetSRID(ST_GeomFromText($1), 4326)::geography,
      $2
    )
    order by name asc
    limit 500
    `, [wkt, ROUTE_STOP_RADIUS_M]);
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        latitude: r.latitude,
        longitude: r.longitude,
        altitude_m: r.altitude_m,
        rating: r.rating,
        notes: r.notes
    }));
}
/** Curated DB stops within 10 km of the route (PostGIS) + OSM amenities filtered to the same corridor. */
export async function findStopsNearRoute(route) {
    const [dbStops, osmStops] = await Promise.all([
        findStopsInDatabaseNearRoute(route),
        fetchOsmStopsAlongRoute(route).catch((err) => {
            console.error("[findStopsNearRoute] OSM fetch failed:", err);
            return [];
        })
    ]);
    return mergeStopLists(dbStops, osmStops);
}
export async function findPermitZonesForRoute(route) {
    const wkt = lineStringToWkt(route);
    const rows = await db.query(`
    select id, zone_name, permit_name, fee_inr, apply_url
    from permit_zones
    where ST_Intersects(
      boundary,
      ST_SetSRID(ST_GeomFromText($1), 4326)
    )
    order by zone_name asc
    `, [wkt]);
    return rows;
}
export async function saveTrip(input) {
    const publicUuid = uuidv4();
    const wkt = lineStringToWkt(input.routeGeom);
    const userRows = await db.query(`
    insert into users(email, name, google_id)
    values ($1, $1, $1)
    on conflict (email) do update set email = excluded.email
    returning id
    `, [input.userEmail]);
    const userId = userRows[0]?.id;
    if (!userId)
        throw new Error("Unable to resolve user");
    const tripRows = await db.query(`
    insert into trips(
      user_id, public_uuid, title,
      from_location, to_location, start_date, days,
      mode, budget_inr, pace, route_profile,
      route_geom
    )
    values (
      $1, $2, $3,
      $4, $5, $6, $7,
      $8, $9, $10, $11,
      ST_SetSRID(ST_GeomFromText($12), 4326)
    )
    returning id
    `, [
        userId,
        publicUuid,
        input.title,
        input.from,
        input.to,
        input.startDate,
        input.days,
        input.mode,
        input.budgetInr,
        input.pace,
        input.routeProfile,
        wkt
    ]);
    const tripId = tripRows[0]?.id;
    if (!tripId)
        throw new Error("Unable to create trip");
    if (input.itinerary) {
        await db.query(`
      insert into itineraries(trip_id, content)
      values ($1, $2::jsonb)
      `, [tripId, JSON.stringify(input.itinerary)]);
    }
    return { tripId, publicUuid };
}
