import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { getRouteOptions } from "./services/osrm.js";
import { db } from "./services/db.js";
import { findStopsNearRoute, findPermitZonesForRoute, saveTrip, mergeStopLists } from "./services/trips.js";
import { computeRiskSegments } from "./services/altitudeRisk.js";
import { sampleAltitudeAlongRoute } from "./services/openElevation.js";
import { generateItinerary, planRouteRefinement, suggestStopPicks } from "./services/gemini.js";
import { requireUser } from "./services/auth.js";
import { geocodeMandatoryStopsFromAi } from "./services/mandatoryStops.js";
const app = express();
function ah(fn) {
    return (req, res, next) => {
        void fn(req, res, next).catch(next);
    };
}
const tripFormZ = z
    .object({
    from: z.string(),
    to: z.string(),
    startDate: z.string(),
    returnDate: z.string().optional(),
    tripKind: z.enum(["one_way", "round_trip"]),
    days: z.number().int().min(1),
    mode: z.enum(["bike", "car", "bus"]),
    budgetInr: z.number().int().min(0),
    pace: z.enum(["relaxed", "moderate", "packed"]),
    routeProfile: z.enum(["fastest", "scenic", "safest"])
})
    .refine((t) => t.tripKind === "one_way" ||
    (typeof t.returnDate === "string" && t.returnDate >= t.startDate), { message: "Round trip requires returnDate on or after startDate" });
app.use(cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.get("/health", ah(async (_req, res) => {
    const ok = await db.ping();
    res.json({ ok, time: new Date().toISOString() });
}));
app.post("/route", ah(async (req, res) => {
    const body = z
        .object({
        from: z.string(),
        to: z.string(),
        mode: z.enum(["bike", "car", "bus"])
    })
        .parse(req.body);
    const routes = await getRouteOptions(body);
    res.json({ routes });
}));
app.post("/trips/preview", ah(async (req, res) => {
    const body = z
        .object({
        route: z.object({
            profile: z.enum(["fastest", "scenic", "safest"]),
            distance_km: z.number(),
            duration_min: z.number(),
            geometry: z.object({
                type: z.literal("LineString"),
                coordinates: z.array(z.tuple([z.number(), z.number()]))
            })
        })
    })
        .parse(req.body);
    const routeOption = body.route;
    const route = routeOption.geometry;
    const [stops, permitZones, altitude] = await Promise.all([
        findStopsNearRoute(route),
        findPermitZonesForRoute(route),
        sampleAltitudeAlongRoute(route)
    ]);
    const risk = computeRiskSegments(altitude, stops);
    // Keep response aligned with shared types
    const response = {
        route: routeOption,
        stops,
        permitZones,
        altitude,
        risk
    };
    res.json(response);
}));
app.post("/itinerary/generate", ah(async (req, res) => {
    const body = z
        .object({
        route: z.any(),
        stops: z.array(z.string()),
        trip: tripFormZ.nullable()
    })
        .parse(req.body);
    const itinerary = await generateItinerary({
        route: body.route,
        stops: body.stops,
        trip: body.trip
    });
    res.json(itinerary);
}));
const minimalStopZ = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    rating: z.number().nullable().optional(),
    progressKm: z.number().optional()
});
const journeyCandidatesZ = z.object({
    food: z.array(minimalStopZ).max(10),
    stay: z.array(minimalStopZ).max(10),
    petrol: z.array(minimalStopZ).max(10),
    view: z.array(minimalStopZ).max(10)
});
const journeySegmentZ = z.object({
    index: z.number().int().min(0),
    centerKm: z.number(),
    candidates: journeyCandidatesZ
});
app.post("/planner/stop-suggestions", ah(async (req, res) => {
    const body = z
        .object({
        route: z.object({
            distance_km: z.number(),
            geometry: z.object({
                type: z.literal("LineString"),
                coordinates: z.array(z.tuple([z.number(), z.number()]))
            })
        }),
        trip: tripFormZ.nullable(),
        segments: z.array(journeySegmentZ).min(1).max(12)
    })
        .parse(req.body);
    const result = await suggestStopPicks({
        route: body.route,
        trip: body.trip,
        segments: body.segments
    });
    res.json(result);
}));
function userAskedStopCountReshuffle(message) {
    const m = message.toLowerCase();
    if (/\b(only|just|keep|fewer|less|reduce|dont|don't)\b[^\n]{0,120}\b\d+\b/.test(m))
        return true;
    if (/\b\d+\b[^\n]{0,60}\b(stops?|food|fuel|petrol|gas|stay|hotel|dhaba|night)\b/.test(m))
        return true;
    if (/\b(stops?|food|fuel|petrol|stay|hotel)\b[^\n]{0,60}\b\d+\b/.test(m))
        return true;
    return false;
}
const previewRouteZ = z.object({
    profile: z.enum(["fastest", "scenic", "safest"]),
    distance_km: z.number(),
    duration_min: z.number(),
    geometry: z.object({
        type: z.literal("LineString"),
        coordinates: z.array(z.tuple([z.number(), z.number()]))
    })
});
const currentStopSnapshotZ = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    altitude_m: z.number().nullable().optional(),
    rating: z.number().nullable().optional(),
    notes: z.string().nullable().optional()
});
app.post("/planner/ai-replan", ah(async (req, res) => {
    const body = z
        .object({
        userMessage: z.string().min(1).max(2000),
        trip: tripFormZ,
        currentRoute: previewRouteZ.optional(),
        currentStops: z.array(currentStopSnapshotZ).max(200).default([])
    })
        .parse(req.body);
    const contextStops = body.currentStops.map((s, i) => ({
        i,
        id: s.id,
        name: s.name,
        type: s.type,
        latitude: s.latitude,
        longitude: s.longitude
    }));
    const plan = await planRouteRefinement({
        userMessage: body.userMessage,
        trip: body.trip,
        currentRoute: body.currentRoute ?? null,
        contextStops
    });
    const viaPlaces = plan.viaPlaces;
    const subsetIndicesRaw = viaPlaces.length > 0 ? [] : plan.subsetIndices;
    const uniqSubset = [...new Set(subsetIndicesRaw)];
    if (uniqSubset.length > 0) {
        if (body.currentStops.length === 0) {
            res.status(422).json({
                error: "AI returned stop indices but the map had no stops to choose from. Plan a route with stops first.",
                cannotImplement: true
            });
            return;
        }
        for (const idx of uniqSubset) {
            if (!Number.isInteger(idx) || idx < 0 || idx >= body.currentStops.length) {
                res.status(422).json({
                    error: `AI returned an invalid stop index (${String(idx)}). There are ${body.currentStops.length} stops (indices 0–${body.currentStops.length - 1}).`,
                    cannotImplement: true
                });
                return;
            }
        }
    }
    let routes;
    let chosen;
    try {
        routes = await getRouteOptions({
            from: body.trip.from,
            to: body.trip.to,
            mode: body.trip.mode,
            viaPlaces
        });
        chosen = routes.find((r) => r.profile === body.trip.routeProfile) ?? routes[0];
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "Routing failed.";
        res.status(422).json({ error: msg, cannotImplement: true });
        return;
    }
    const [baseStops, permitZones, altitude] = await Promise.all([
        findStopsNearRoute(chosen.geometry),
        findPermitZonesForRoute(chosen.geometry),
        sampleAltitudeAlongRoute(chosen.geometry)
    ]);
    let baseForDisplay = baseStops;
    if (uniqSubset.length > 0) {
        baseForDisplay = uniqSubset.map((i) => {
            const s = body.currentStops[i];
            return {
                id: s.id,
                name: s.name,
                type: s.type,
                latitude: s.latitude,
                longitude: s.longitude,
                altitude_m: s.altitude_m ?? null,
                rating: s.rating ?? null,
                notes: s.notes ?? null
            };
        });
    }
    const mandatoryResult = plan.additionalStops.length > 0
        ? await geocodeMandatoryStopsFromAi(plan.additionalStops, body.trip)
        : { stops: [], skipped: [] };
    if (mandatoryResult.skipped.length > 0) {
        res.status(422).json({
            error: `Could not place new pins on the map: ${mandatoryResult.skipped.map((s) => s.name).join(", ")}.`,
            cannotImplement: true
        });
        return;
    }
    const wantsReshuffle = userAskedStopCountReshuffle(body.userMessage);
    if (wantsReshuffle &&
        viaPlaces.length === 0 &&
        uniqSubset.length === 0 &&
        plan.additionalStops.length === 0) {
        res.status(422).json({
            error: "This request could not be applied: the AI did not return a stop subset, route change, or new pins. Try again.",
            cannotImplement: true
        });
        return;
    }
    const stops = mergeStopLists(mandatoryResult.stops, baseForDisplay);
    const risk = computeRiskSegments(altitude, stops);
    res.json({
        aiReply: plan.aiReply,
        skippedAiStops: [],
        routes,
        route: chosen,
        stops,
        permitZones,
        altitude,
        risk
    });
}));
app.post("/trips", ah(async (req, res) => {
    const user = await requireUser(req);
    const body = z
        .object({
        title: z.string().min(1),
        from: z.string(),
        to: z.string(),
        startDate: z.string(),
        days: z.number().int().min(1),
        mode: z.enum(["bike", "car", "bus"]),
        budgetInr: z.number().int().min(0),
        pace: z.enum(["relaxed", "moderate", "packed"]),
        routeProfile: z.enum(["fastest", "scenic", "safest"]),
        route: z.any(),
        itinerary: z.any().optional()
    })
        .parse(req.body);
    const saved = await saveTrip({
        userEmail: user.email,
        title: body.title,
        from: body.from,
        to: body.to,
        startDate: body.startDate,
        days: body.days,
        mode: body.mode,
        budgetInr: body.budgetInr,
        pace: body.pace,
        routeProfile: body.routeProfile,
        routeGeom: body.route,
        itinerary: body.itinerary ?? null
    });
    res.json(saved);
}));
app.get("/trips/:uuid", ah(async (req, res) => {
    const uuid = z.string().uuid().parse(req.params.uuid);
    const trip = await db.getPublicTrip(uuid);
    if (!trip) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    const route = trip.route;
    const [stops, permitZones, altitude] = await Promise.all([
        findStopsNearRoute(route),
        findPermitZonesForRoute(route),
        sampleAltitudeAlongRoute(route)
    ]);
    const risk = computeRiskSegments(altitude, stops);
    res.json({
        title: trip.title,
        route,
        itinerary: trip.itinerary ?? null,
        stops,
        permitZones,
        altitude,
        risk
    });
}));
app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    const anyErr = err;
    const message = (err instanceof Error && err.message) ||
        (typeof anyErr?.detail === "string" && anyErr.detail) ||
        (typeof anyErr?.code === "string" && anyErr.code) ||
        "Unknown error";
    const status = typeof anyErr?.status === "number" ? anyErr.status : 500;
    res.status(status).json({ error: message });
});
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${port}`);
});
