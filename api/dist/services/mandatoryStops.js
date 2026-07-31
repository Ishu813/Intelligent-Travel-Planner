import { randomUUID } from "node:crypto";
import { geocodePlace, sleep } from "./geocode.js";
function uniqueQueries(queries) {
    const seen = new Set();
    const out = [];
    for (const raw of queries) {
        const n = raw.trim().replace(/\s+/g, " ");
        if (n.length < 2)
            continue;
        const key = n.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(n);
    }
    return out;
}
/** Heuristic: bias Nominatim with `countrycodes=in` when the trip looks India / Himalaya–adjacent. */
export function tripLikelyIndiaCorridor(trip) {
    const s = `${trip.from} ${trip.to}`.toLowerCase();
    if (/\b(india|nepal|bhutan|bangladesh|srilanka|pakistan)\b/.test(s))
        return true;
    return /\b(ladakh|leh|kargil|manali|shimla|spiti|kinnaur|srinagar|jammu|rohtang|keylong|sarchu|dehradun|haridwar|rishikesh|chandigarh|amritsar|delhi|agra|jaipur|varanasi|sultanpur|lucknow|kanpur|patna|guwahati|shillong|himachal|uttarakhand|punjab|haryana|uttar pradesh|rajasthan|bihar|jammu and kashmir)\b/.test(s);
}
/**
 * Build several Nominatim-friendly strings: vague "X near Y" queries rarely work on the first try.
 */
function buildMandatoryGeocodeQueries(item, trip) {
    const primary = item.searchQuery.trim();
    const name = item.name.trim();
    const from = trip.from.trim();
    const to = trip.to.trim();
    const out = [primary];
    const commaNear = primary.replace(/\s+near\s+/i, ", ");
    if (commaNear !== primary)
        out.push(commaNear);
    const nearMatch = primary.match(/^(.+?)\s+near\s+(.+)$/i);
    if (nearMatch) {
        const left = nearMatch[1].trim();
        const place = nearMatch[2].trim();
        if (place) {
            out.push(place, `${place} ${left}`, `${left}, ${place}`);
        }
    }
    if (name && name !== primary) {
        out.push(`${name}, ${from}`, `${name}, ${to}`);
    }
    out.push(`${primary}, ${from}`, `${primary}, ${to}`, `${primary}, India`);
    if (from)
        out.push(`${from} ${primary}`);
    if (to)
        out.push(`${to} ${primary}`);
    return uniqueQueries(out).slice(0, 8);
}
async function tryGeocodeQuery(q, useIndiaBias) {
    let hit = await geocodePlace(q);
    if (hit)
        return hit;
    if (!useIndiaBias)
        return null;
    await sleep(1100);
    return geocodePlace(q, { countrycodes: "in" });
}
export async function geocodeMandatoryStopsFromAi(items, trip) {
    const stops = [];
    const skipped = [];
    const indiaBias = tripLikelyIndiaCorridor(trip);
    for (const item of items) {
        await sleep(1100);
        const queries = buildMandatoryGeocodeQueries(item, trip);
        let found = null;
        for (let i = 0; i < queries.length; i++) {
            if (i > 0)
                await sleep(1100);
            found = await tryGeocodeQuery(queries[i], indiaBias);
            if (found)
                break;
        }
        if (!found) {
            skipped.push({ name: item.name, searchQuery: item.searchQuery.trim() });
            continue;
        }
        stops.push({
            id: randomUUID(),
            name: item.name,
            type: item.type,
            latitude: found.lat,
            longitude: found.lng,
            altitude_m: null,
            rating: null,
            notes: `AI-requested · ${found.label}`.slice(0, 500)
        });
    }
    return { stops, skipped };
}
