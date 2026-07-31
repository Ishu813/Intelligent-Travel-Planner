import { z } from "zod";
import {
  effectiveGeminiModelId,
  generateContentWithRetry,
} from "./geminiRetry.js";
const ItinerarySchema = z.object({
  title: z.string(),
  days: z.array(
    z.object({
      day: z.number().int().min(1),
      from: z.string(),
      to: z.string(),
      stops: z.array(z.string()),
      notes: z.string(),
    }),
  ),
  packing: z.array(z.string()),
  safety: z.array(z.string()),
});
export async function generateItinerary(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const modelId = effectiveGeminiModelId(process.env.GEMINI_MODEL);
  const prompt = buildPrompt(input);
  const result = await generateContentWithRetry(key, modelId, prompt);
  const text = result.response.text().trim();
  const jsonText = extractJson(text);
  const parsed = ItinerarySchema.parse(JSON.parse(jsonText));
  return parsed;
}
function buildPrompt(input) {
  const stopList = input.stops.slice(0, 80);
  const trip = input.trip ?? null;
  const tripKindLine =
    trip == null
      ? ""
      : `Trip type: ROUND TRIP (only the outbound leg is routed as geometry; include return ${trip.returnDate ?? "(date TBD)"} in narrative, packing, and safety — no second-leg geometry).`;
  const fromTo =
    trip == null
      ? "Route endpoints not specified."
      : `Route: from “${trip.from}” to “${trip.to}” (road trip).`;
  return [
    "You are generating a road trip itinerary as STRICT JSON.",
    "Return ONLY valid JSON (no markdown, no extra text).",
    "",
    "Context:",
    fromTo,
    "- Provide a day-wise plan; adapt tone to distance, terrain, and season when inferable from preferences.",
    tripKindLine,
    "",
    "User preferences (if provided):",
    JSON.stringify(trip),
    "",
    "Constraints:",
    "- Use this output schema exactly:",
    '{ "title": string, "days": [{ "day": number, "from": string, "to": string, "stops": string[], "notes": string }], "packing": string[], "safety": string[] }',
    "- Keep days reasonable for a first-time traveler.",
    "- Prefer short daily driving at altitude.",
    "",
    "Available stops you may reference (names only):",
    JSON.stringify(stopList),
    "",
    "Now produce the JSON:",
  ].join("\n");
}
function extractJson(text) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("Gemini did not return JSON");
  }
  return text.slice(first, last + 1);
}
const StopPickSchema = z.object({
  stopId: z.string(),
  reason: z.string(),
});
const SegmentStopPicksSchema = z.object({
  index: z.number().int().min(0),
  picks: z.object({
    food: StopPickSchema.optional(),
    stay: StopPickSchema.optional(),
    petrol: StopPickSchema.optional(),
    view: StopPickSchema.optional(),
  }),
});
export const StopSuggestionsResponseSchema = z.object({
  segments: z.array(SegmentStopPicksSchema),
});
export async function suggestStopPicks(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const modelId = effectiveGeminiModelId(process.env.GEMINI_MODEL);
  const prompt = buildStopSuggestionsPrompt(input);
  const result = await generateContentWithRetry(key, modelId, prompt);
  const text = result.response.text().trim();
  const jsonText = extractJson(text);
  const parsed = StopSuggestionsResponseSchema.parse(JSON.parse(jsonText));
  return parsed;
}
function buildStopSuggestionsPrompt(input) {
  const trip = input.trip ?? null;
  const tripLine =
    trip == null
      ? ""
      : "Trip: ROUND TRIP (suggest outbound stops only; user returns to start later).";
  return [
    "You help pick practical road-trip stops as STRICT JSON only.",
    "Return ONLY valid JSON (no markdown, no extra text).",
    "",
    tripLine,
    "Route distance_km:",
    String(input.route.distance_km),
    "",
    "User preferences (JSON):",
    JSON.stringify(trip),
    "",
    "Segments (index, centerKm along route, candidates per category). Pick at most one stop per category per segment when sensible.",
    "Choose stopId values ONLY from the provided candidate lists for that segment and category.",
    "If no candidate is suitable, omit that category for that segment.",
    "",
    "Output schema:",
    '{ "segments": [ { "index": number, "picks": { "food"?: { "stopId": string, "reason": string }, "stay"?: {...}, "petrol"?: {...}, "view"?: {...} } } ] }',
    "",
    "Segment data:",
    JSON.stringify(input.segments),
    "",
    "Now produce the JSON:",
  ].join("\n");
}
const stopTypeEnum = z.enum([
  "dhaba",
  "petrol_pump",
  "hospital",
  "atm",
  "hotel",
  "rest_area",
]);
export const AiReplanResponseSchema = z
  .object({
    aiReply: z.string().min(1).max(900),
    viaPlaces: z.array(z.string().min(1).max(180)).max(8),
    subsetIndices: z.array(z.number().int().min(0)).max(80).optional(),
    additionalStops: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          searchQuery: z.string().min(1).max(220),
          type: stopTypeEnum,
        }),
      )
      .max(8),
  })
  .transform((p) => ({
    ...p,
    subsetIndices: p.subsetIndices ?? [],
  }));
export async function planRouteRefinement(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const modelId = effectiveGeminiModelId(process.env.GEMINI_MODEL);
  const routeLine =
    input.currentRoute == null
      ? "No current route metrics."
      : `Current route: profile=${input.currentRoute.profile}, ${input.currentRoute.distance_km.toFixed(0)} km, ${Math.round(input.currentRoute.duration_min)} min driving estimate.`;
  const stopsLine =
    input.contextStops.length === 0
      ? "contextStops is EMPTY. You cannot return subsetIndices; use [] only."
      : [
          "Stops already on the map (0-based index i — YOU MUST pick from this list when the user asks for fewer stops or a mix of food/stay/fuel without naming venues):",
          JSON.stringify(input.contextStops.slice(0, 120)),
        ].join("\n");
  const prompt = [
    "You refine a road trip from the traveler’s message. Reply as STRICT JSON only (no markdown, no extra text).",
    "",
    "You MUST decide yourself in this single response — never ask the user to type place names or “provide specifics”.",
    "",
    "Rules:",
    "- aiReply: 1–3 short sentences stating what you applied.",
    "- viaPlaces: ordered intermediate place names only if the user wants a different corridor (towns, passes, “via …”). Empty if unchanged. Use Nominatim-friendly names.",
    '- subsetIndices: array of integers **i** from contextStops (the field "i" on each row). Use this when the user wants fewer stops and/or a balance of food / stay / fuel without naming businesses.',
    "  • Map user “food” to types dhaba; “stay” to hotel; “fuel/petrol” to petrol_pump; hospital/atm/rest_area as requested.",
    "  • Pick the best-spread choices along the route (use name + type; prefer variety).",
    "  • If contextStops is empty, subsetIndices MUST be [].",
    "  • If you change viaPlaces (non-empty), subsetIndices MUST be [] (indices would be stale after a reroute).",
    "- additionalStops: ONLY for brand-new pins not already in contextStops. Each searchQuery must be a concrete geocodable string (business + city). If nothing new is needed, use [].",
    "- If you cannot honor the request with the given contextStops and rules, return viaPlaces:[], subsetIndices:[], additionalStops:[] and a brief honest aiReply (the server will mark the request as not implementable).",
    "",
    "Trip form (JSON):",
    JSON.stringify(input.trip),
    "",
    routeLine,
    "",
    stopsLine,
    "",
    "User message:",
    input.userMessage.trim(),
    "",
    "Output schema exactly:",
    '{ "aiReply": string, "viaPlaces": string[], "subsetIndices": number[], "additionalStops": [ { "name": string, "searchQuery": string, "type": "dhaba"|"petrol_pump"|"hospital"|"atm"|"hotel"|"rest_area" } ] }',
    "",
    "Now produce the JSON:",
  ].join("\n");
  const result = await generateContentWithRetry(key, modelId, prompt);
  const text = result.response.text().trim();
  const jsonText = extractJson(text);
  return AiReplanResponseSchema.parse(JSON.parse(jsonText));
}
