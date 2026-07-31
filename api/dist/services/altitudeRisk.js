export function computeRiskSegments(samples, stops) {
    if (samples.length < 2)
        return [];
    // Simple sliding window: any segment above 3000m where +500m within 50km
    const risk = [];
    for (let i = 0; i < samples.length; i++) {
        const a = samples[i];
        if (a.altitude_m == null || a.altitude_m < 3000)
            continue;
        // find first point 50km ahead
        let j = i + 1;
        while (j < samples.length && samples[j].distance_km - a.distance_km < 50)
            j++;
        if (j >= samples.length)
            break;
        const b = samples[j];
        if (b.altitude_m == null)
            continue;
        const gain = b.altitude_m - a.altitude_m;
        if (gain <= 500)
            continue;
        const suggested = nearestStopName(stops, a.distance_km, b.distance_km);
        risk.push({
            start_distance_km: a.distance_km,
            end_distance_km: b.distance_km,
            reason: `Rapid ascent: +${Math.round(gain)}m within 50km above 3000m`,
            suggested_rest_stop: suggested ?? undefined
        });
    }
    // De-duplicate overlapping segments (keep first)
    const merged = [];
    for (const seg of risk) {
        const last = merged[merged.length - 1];
        if (last && seg.start_distance_km <= last.end_distance_km)
            continue;
        merged.push(seg);
    }
    return merged.slice(0, 3);
}
function nearestStopName(stops, _startKm, _endKm) {
    // We don't have stop distances yet; choose a hospital/hotel if available as a generic rest suggestion.
    const preferred = stops.find((s) => s.type === "hospital") ?? stops.find((s) => s.type === "hotel");
    return preferred?.name ?? null;
}
