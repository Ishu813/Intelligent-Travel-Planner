import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import type {
  FullJourneyPlan,
  FullTripInput,
  PackingCategory,
} from "@trip-planner/shared/types";
import {
  effectiveGeminiModelId,
  generateContentWithRetry,
} from "./geminiRetry";
import { geocodePlace, sleep } from "./geocode";
import { isServerlessRuntime } from "./runtime";

const TRANSPORT_MODES = [
  "flight",
  "train",
  "bus",
  "cab",
  "walk",
  "none",
] as const;

function normalizeTransportMode(value: unknown): (typeof TRANSPORT_MODES)[number] {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("flight") || raw.includes("air")) return "flight";
  if (raw.includes("train") || raw.includes("rail")) return "train";
  if (raw.includes("bus")) return "bus";
  if (
    raw.includes("cab") ||
    raw.includes("auto") ||
    raw.includes("taxi") ||
    raw.includes("uber") ||
    raw.includes("ola")
  ) {
    return "cab";
  }
  if (raw.includes("walk")) return "walk";
  if (!raw || raw.includes("none") || raw.includes("local")) return "none";
  return "cab";
}

function normalizeMapMode(value: unknown): "flight" | "train" | "bus" | "cab" | "walk" {
  const mode = normalizeTransportMode(value);
  return mode === "none" ? "walk" : mode;
}

const TransportSegmentSchema = z
  .object({
    mode: z.union([z.enum(TRANSPORT_MODES), z.string()]).optional(),
    operator: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    departureTime: z.string().optional(),
    arrivalTime: z.string().optional(),
    estimatedCost: z.coerce.number().optional(),
    bookingPlatform: z.string().optional(),
  })
  .transform((t) => ({
    mode: normalizeTransportMode(t.mode),
    operator: t.operator ?? "",
    from: t.from ?? "",
    to: t.to ?? "",
    departureTime: t.departureTime ?? "",
    arrivalTime: t.arrivalTime ?? "",
    estimatedCost: t.estimatedCost ?? 0,
    bookingPlatform: t.bookingPlatform ?? "",
  }));

const HotelInfoSchema = z.object({
  name: z.string().default(""),
  location: z.string().default(""),
  type: z.string().default("hotel"),
  costPerNight: z.coerce.number().default(0),
  checkIn: z.coerce.boolean().default(false),
  checkOut: z.coerce.boolean().default(false),
  bookingPlatform: z.string().default(""),
});

function normalizeTimeSlot(value: unknown): "morning" | "afternoon" | "evening" {
  const raw = String(value ?? "morning").toLowerCase();
  if (raw.includes("after")) return "afternoon";
  if (raw.includes("even") || raw.includes("night")) return "evening";
  return "morning";
}

function normalizeMealType(value: unknown): "breakfast" | "lunch" | "dinner" {
  const raw = String(value ?? "lunch").toLowerCase();
  if (raw.includes("break") || raw.includes("morning")) return "breakfast";
  if (raw.includes("dinner") || raw.includes("even")) return "dinner";
  return "lunch";
}

function nullableRecord(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "string") return null;
  return value;
}

const ActivitySchema = z.object({
  timeSlot: z
    .union([z.enum(["morning", "afternoon", "evening"]), z.string()])
    .optional()
    .transform((v) => normalizeTimeSlot(v)),
  placeName: z.string().default(""),
  description: z.string().default(""),
  duration: z.string().default(""),
  entryFee: z.coerce.number().default(0),
  travelFromPrev: z.string().default(""),
  travelCost: z.coerce.number().default(0),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

const MealSchema = z.object({
  type: z
    .union([z.enum(["breakfast", "lunch", "dinner"]), z.string()])
    .optional()
    .transform((v) => normalizeMealType(v)),
  restaurant: z.string().default(""),
  cuisine: z.string().default(""),
  estimatedCost: z.coerce.number().default(0),
});

const JourneyDaySchema = z.object({
  day: z.coerce.number().int().min(1),
  date: z.string().optional().default(""),
  title: z.string().default(""),
  transport: z
    .preprocess(nullableRecord, TransportSegmentSchema.nullable())
    .default(null),
  hotel: z
    .preprocess(nullableRecord, HotelInfoSchema.nullable())
    .default(null),
  activities: z.array(ActivitySchema).default([]),
  meals: z.array(MealSchema).default([]),
  dayTotalCost: z.coerce.number().default(0),
  notes: z.string().default(""),
});

const MapRouteSegmentSchema = z
  .object({
    from: z.object({
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      name: z.string().optional(),
    }),
    to: z.object({
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      name: z.string().optional(),
    }),
    mode: z.union([
      z.enum(["flight", "train", "bus", "cab", "walk"]),
      z.string(),
    ]).optional(),
    day: z.coerce.number().int().min(1),
  })
  .transform((s) => ({
    from: {
      lat: s.from.lat ?? 0,
      lng: s.from.lng ?? 0,
      name: s.from.name ?? "",
    },
    to: {
      lat: s.to.lat ?? 0,
      lng: s.to.lng ?? 0,
      name: s.to.name ?? "",
    },
    mode: normalizeMapMode(s.mode),
    day: s.day,
  }));

export const FullJourneyPlanSchema = z.object({
  summary: z.object({
    totalDays: z.coerce.number().int().min(1),
    totalDistance: z.string().default(""),
    estimatedCost: z.coerce.number().default(0),
    transportMix: z.string().default(""),
  }),
  days: z.array(JourneyDaySchema).min(1),
  mapRoute: z.array(MapRouteSegmentSchema).default([]),
});

const JourneyAdjustResponseSchema = z.object({
  reply: z.string().default("Updated your plan."),
  changedDays: z.array(z.coerce.number().int().min(1)).default([]),
  plan: FullJourneyPlanSchema,
});

const JourneyAdjustPatchSchema = z.object({
  reply: z.string().default("Updated your plan."),
  changedDays: z.array(z.coerce.number().int().min(1)).default([]),
  updatedDays: z.array(JourneyDaySchema).min(1),
  mapRouteUpdates: z.array(MapRouteSegmentSchema).optional(),
});

const PackingListResponseSchema = z.array(
  z.object({
    category: z.string(),
    items: z.array(z.string()),
  }),
);

function extractJson(text: string) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    const arrFirst = text.indexOf("[");
    const arrLast = text.lastIndexOf("]");
    if (arrFirst === -1 || arrLast === -1 || arrLast <= arrFirst) {
      throw new Error("AI did not return JSON");
    }
    return text.slice(arrFirst, arrLast + 1);
  }
  return text.slice(first, last + 1);
}

function parseJson(text: string): unknown {
  const jsonText = extractJson(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    return JSON.parse(jsonrepair(jsonText));
  }
}

function requireGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return key;
}

function addDays(isoDate: string, offset: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function buildFullJourneyPrompt(trip: FullTripInput) {
  const endDate = addDays(trip.startDate, trip.days - 1);
  return [
    "You are an expert India travel planner. Generate a detailed day-by-day trip plan as STRICT JSON only.",
    "Return ONLY valid JSON (no markdown, no extra text).",
    "",
    "Trip details:",
    JSON.stringify(trip),
    "",
    `Dates: ${trip.startDate} through ${endDate} (${trip.days} days).`,
    `Budget: ₹${trip.budgetInr} total for ${trip.travelers} traveler(s).`,
    "",
    "Rules:",
    "- Use realistic INR costs; keep total near budget (±15%).",
    "- Match travel style, pace, accommodation, and transport preference.",
    "- For same-city trips (from ≈ to), plan local sightseeing — no long-distance transport.",
    "- Include exactly 2 concise activities per day with morning/afternoon/evening slots.",
    "- Include breakfast, lunch, dinner suggestions with local restaurants.",
    "- Assign dates sequentially starting from startDate.",
    "- Use null for transport/hotel when not applicable that day.",
    "- mapRoute: key movement segments with approximate lat/lng (India coords). Use 0,0 only if unknown.",
    "- Booking platforms: MakeMyTrip, IRCTC, RedBus, Ola/Uber, or Walk-in as appropriate.",
    "",
    "Output schema exactly:",
    JSON.stringify({
      summary: {
        totalDays: "number",
        totalDistance: "string",
        estimatedCost: "number",
        transportMix: "string",
      },
      days: [
        {
          day: "number",
          date: "YYYY-MM-DD",
          title: "string",
          transport: "TransportSegment | null",
          hotel: "HotelInfo | null",
          activities: [
            {
              timeSlot: "morning|afternoon|evening",
              placeName: "string",
              description: "string",
              duration: "string",
              entryFee: "number",
              travelFromPrev: "string",
              travelCost: "number",
              lat: "number optional",
              lng: "number optional",
            },
          ],
          meals: [
            {
              type: "breakfast|lunch|dinner",
              restaurant: "string",
              cuisine: "string",
              estimatedCost: "number",
            },
          ],
          dayTotalCost: "number",
          notes: "string",
        },
      ],
      mapRoute: [
        {
          from: { lat: "number", lng: "number", name: "string" },
          to: { lat: "number", lng: "number", name: "string" },
          mode: "flight|train|bus|cab|walk",
          day: "number",
        },
      ],
    }),
    "",
    "Now produce the JSON:",
  ].join("\n");
}

export type JourneyChunkContext = {
  lastCity?: string;
  lastHotel?: string;
  daysSoFarCost?: number;
};

const ChunkPlanSchema = z.object({
  days: z.array(JourneyDaySchema).min(1),
  mapRoute: z.array(MapRouteSegmentSchema).default([]),
});

function buildChunkPrompt(
  trip: FullTripInput,
  fromDay: number,
  toDay: number,
  context?: JourneyChunkContext,
) {
  const chunkDays = toDay - fromDay + 1;
  const chunkStartDate = addDays(trip.startDate, fromDay - 1);
  const chunkEndDate = addDays(trip.startDate, toDay - 1);
  const chunkBudget = Math.round((trip.budgetInr * chunkDays) / trip.days);

  return [
    "You are an expert India travel planner. Generate a partial day-by-day trip plan as STRICT JSON only.",
    "Return ONLY valid JSON (no markdown, no extra text).",
    "",
    "Trip details:",
    JSON.stringify(trip),
    "",
    `Generate ONLY days ${fromDay} through ${toDay} (${chunkDays} day(s)).`,
    `Dates for this chunk: ${chunkStartDate} through ${chunkEndDate}.`,
    `Budget for this chunk: about ₹${chunkBudget} (part of ₹${trip.budgetInr} total).`,
    context?.lastCity
      ? `Continue from where the previous chunk ended (around ${context.lastCity}).`
      : "",
    context?.daysSoFarCost != null
      ? `Spent so far: about ₹${context.daysSoFarCost}. Stay within the remaining budget.`
      : "",
    "",
    "Rules:",
    "- Each day object must use the correct day number (1-indexed).",
    "- Use realistic INR costs for this chunk only.",
    "- Include exactly 2 concise activities per day with morning/afternoon/evening slots.",
    "- Include breakfast, lunch, dinner suggestions.",
    "- Use null for transport/hotel when not applicable that day.",
    "- mapRoute: movement segments for these days only; use 0,0 for unknown coords.",
    "",
    "Output schema exactly:",
    JSON.stringify({
      days: [
        {
          day: "number",
          date: "YYYY-MM-DD",
          title: "string",
          transport: "TransportSegment | null",
          hotel: "HotelInfo | null",
          activities: ["..."],
          meals: ["..."],
          dayTotalCost: "number",
          notes: "string",
        },
      ],
      mapRoute: [
        {
          from: { lat: "number", lng: "number", name: "string" },
          to: { lat: "number", lng: "number", name: "string" },
          mode: "flight|train|bus|cab|walk",
          day: "number",
        },
      ],
    }),
    "",
    "Now produce the JSON:",
  ]
    .filter(Boolean)
    .join("\n");
}

function fillChunkDates(
  days: z.infer<typeof JourneyDaySchema>[],
  startDate: string,
) {
  for (const day of days) {
    if (!day.date) {
      day.date = addDays(startDate, day.day - 1);
    }
  }
}

export async function generateFullJourneyChunk(input: {
  trip: FullTripInput;
  fromDay: number;
  toDay: number;
  context?: JourneyChunkContext;
}) {
  const { trip, fromDay, toDay, context } = input;
  if (fromDay < 1 || toDay > trip.days || fromDay > toDay) {
    throw new Error("Invalid day range for plan chunk");
  }

  const key = requireGeminiKey();
  const modelId = effectiveGeminiModelId(process.env.GEMINI_MODEL);
  const result = await generateContentWithRetry(
    key,
    modelId,
    buildChunkPrompt(trip, fromDay, toDay, context),
  );
  const chunk = ChunkPlanSchema.parse(parseJson(result.response.text().trim()));
  fillChunkDates(chunk.days, trip.startDate);
  return chunk;
}

async function enrichMapRoute(plan: FullJourneyPlan) {
  const cache = new Map<string, { lat: number; lng: number }>();
  const maxLookups = plan.days.length > 7 ? 4 : 10;
  let lookups = 0;

  async function coordsFor(name: string) {
    const key = name.trim().toLowerCase();
    if (!key || lookups >= maxLookups) return null;
    if (cache.has(key)) return cache.get(key)!;

    try {
      const hit = await geocodePlace(name, { countrycodes: "in" });
      lookups++;
      if (hit) {
        cache.set(key, { lat: hit.lat, lng: hit.lng });
        await sleep(1100);
        return { lat: hit.lat, lng: hit.lng };
      }
    } catch {
      /* best-effort; plan is still usable without coords */
    }
    return null;
  }

  try {
    for (const seg of plan.mapRoute) {
      for (const point of [seg.from, seg.to]) {
        if (point.lat === 0 && point.lng === 0 && point.name) {
          const c = await coordsFor(point.name);
          if (c) {
            point.lat = c.lat;
            point.lng = c.lng;
          }
        }
      }
    }

    // Only geocode activities for shorter trips to avoid Nominatim rate limits.
    if (plan.days.length <= 7) {
      for (const day of plan.days) {
        for (const act of day.activities) {
          if ((!act.lat || !act.lng) && act.placeName) {
            const c = await coordsFor(act.placeName);
            if (c) {
              act.lat = c.lat;
              act.lng = c.lng;
            }
          }
        }
      }
    }
  } catch {
    /* return plan with whatever coords we already have */
  }
}

function compactPlanForAdjust(plan: FullJourneyPlan) {
  return {
    summary: plan.summary,
    days: plan.days.map((d) => ({
      day: d.day,
      date: d.date,
      title: d.title,
      places: d.activities.map((a) => a.placeName),
      notes: d.notes,
    })),
  };
}

function fillMissingDates(plan: FullJourneyPlan, startDate: string) {
  for (const day of plan.days) {
    if (!day.date) {
      day.date = addDays(startDate, day.day - 1);
    }
  }
}

function mergeAdjustPatch(
  original: FullJourneyPlan,
  trip: FullTripInput,
  patch: z.infer<typeof JourneyAdjustPatchSchema>,
) {
  const plan: FullJourneyPlan = structuredClone(original);

  for (const updated of patch.updatedDays) {
    const idx = plan.days.findIndex((d) => d.day === updated.day);
    if (idx >= 0) {
      plan.days[idx] = updated;
    }
  }

  fillMissingDates(plan, trip.startDate);

  if (patch.mapRouteUpdates?.length) {
    for (const seg of patch.mapRouteUpdates) {
      const idx = plan.mapRoute.findIndex((s) => s.day === seg.day);
      if (idx >= 0) plan.mapRoute[idx] = seg;
      else plan.mapRoute.push(seg);
    }
  }

  plan.summary.estimatedCost = plan.days.reduce((sum, d) => sum + d.dayTotalCost, 0);

  const changedDays =
    patch.changedDays.length > 0
      ? patch.changedDays
      : patch.updatedDays.map((d) => d.day);

  return { reply: patch.reply, changedDays, plan };
}

function buildAdjustPatchPrompt(input: {
  plan: FullJourneyPlan;
  trip: FullTripInput;
  instruction: string;
}) {
  return [
    "You adjust an existing India trip plan. Reply as STRICT JSON only (no markdown).",
    "",
    "IMPORTANT: Do NOT return the full plan. Return ONLY the days you changed.",
    "",
    "Rules:",
    "- updatedDays: complete day objects (same schema as input) for each modified day only.",
    "- changedDays: day numbers you modified.",
    "- reply: 1–2 sentences explaining changes.",
    "- Keep day numbers and dates aligned with the original schedule.",
    "- transport mode must be one of: flight, train, bus, cab, walk, none.",
    "- timeSlot must be: morning, afternoon, or evening.",
    "- Unchanged days must NOT appear in updatedDays.",
    "",
    "Trip context:",
    JSON.stringify(input.trip),
    "",
    "Current plan overview:",
    JSON.stringify(compactPlanForAdjust(input.plan)),
    "",
    "Example day schema (for updatedDays items):",
    JSON.stringify(input.plan.days[0] ?? {}),
    "",
    "User instruction:",
    input.instruction.trim(),
    "",
    "Output schema:",
    '{ "reply": string, "changedDays": number[], "updatedDays": JourneyDay[] }',
    "",
    "Now produce the JSON:",
  ].join("\n");
}

function buildAdjustFullPrompt(input: {
  plan: FullJourneyPlan;
  trip: FullTripInput;
  instruction: string;
}) {
  return [
    "You adjust an existing India trip plan based on the user's instruction. Reply as STRICT JSON only.",
    "Return ONLY valid JSON (no markdown, no extra text).",
    "",
    "Rules:",
    "- Apply the instruction to the plan; keep unchanged days identical.",
    "- changedDays: array of day numbers you modified.",
    "- reply: 1–2 sentences explaining what you changed.",
    "- transport mode: flight|train|bus|cab|walk|none. timeSlot: morning|afternoon|evening.",
    "",
    "Trip context:",
    JSON.stringify(input.trip),
    "",
    "Current plan:",
    JSON.stringify(input.plan),
    "",
    "User instruction:",
    input.instruction.trim(),
    "",
    "Output schema:",
    '{ "reply": string, "changedDays": number[], "plan": FullJourneyPlan }',
    "",
    "Now produce the JSON:",
  ].join("\n");
}

function parseAdjustResponse(
  raw: unknown,
  original: FullJourneyPlan,
  trip: FullTripInput,
) {
  const full = JourneyAdjustResponseSchema.safeParse(raw);
  if (full.success) {
    fillMissingDates(full.data.plan, trip.startDate);
    return full.data;
  }

  const patch = JourneyAdjustPatchSchema.safeParse(raw);
  if (patch.success) {
    return mergeAdjustPatch(original, trip, patch.data);
  }

  // AI sometimes nests under "plan" with partial days — try extracting updatedDays alias
  const loose = z
    .object({
      reply: z.string().optional(),
      changedDays: z.array(z.coerce.number()).optional(),
      updatedDays: z.array(JourneyDaySchema).optional(),
      days: z.array(JourneyDaySchema).optional(),
      plan: FullJourneyPlanSchema.optional(),
    })
    .safeParse(raw);

  if (loose.success) {
    if (loose.data.plan) {
      fillMissingDates(loose.data.plan, trip.startDate);
      return {
        reply: loose.data.reply ?? "Updated your plan.",
        changedDays: loose.data.changedDays ?? [],
        plan: loose.data.plan,
      };
    }
    const updatedDays = loose.data.updatedDays ?? loose.data.days;
    if (updatedDays?.length) {
      return mergeAdjustPatch(original, trip, {
        reply: loose.data.reply ?? "Updated your plan.",
        changedDays: loose.data.changedDays ?? [],
        updatedDays,
      });
    }
  }

  throw new Error("AI returned an invalid plan format. Please try again.");
}

export async function generateFullJourney(
  trip: FullTripInput,
): Promise<FullJourneyPlan> {
  const key = requireGeminiKey();
  const modelId = effectiveGeminiModelId(process.env.GEMINI_MODEL);
  const result = await generateContentWithRetry(
    key,
    modelId,
    buildFullJourneyPrompt(trip),
  );
  const plan = FullJourneyPlanSchema.parse(parseJson(result.response.text().trim()));
  // Geocoding adds 10+ seconds; skip on serverless to stay within function timeouts.
  if (!isServerlessRuntime()) {
    await enrichMapRoute(plan);
  }
  return plan;
}

export async function adjustFullJourney(input: {
  plan: FullJourneyPlan;
  trip: FullTripInput;
  instruction: string;
}) {
  const key = requireGeminiKey();
  const modelId = effectiveGeminiModelId(process.env.GEMINI_MODEL);
  const usePatchMode = input.plan.days.length > 5;
  const prompt = usePatchMode
    ? buildAdjustPatchPrompt(input)
    : buildAdjustFullPrompt(input);

  const result = await generateContentWithRetry(key, modelId, prompt);
  const parsed = parseAdjustResponse(
    parseJson(result.response.text().trim()),
    input.plan,
    input.trip,
  );
  if (!isServerlessRuntime()) {
    await enrichMapRoute(parsed.plan);
  }
  return parsed;
}

export async function generatePackingList(input: {
  from: string;
  to: string;
  days: number;
  startDate: string;
  activities: string[];
  maxAltitude?: number;
}): Promise<PackingCategory[]> {
  const key = requireGeminiKey();
  const modelId = effectiveGeminiModelId(process.env.GEMINI_MODEL);
  const prompt = [
    "Generate a practical packing list for an India trip as STRICT JSON only.",
    "Return ONLY valid JSON (no markdown, no extra text).",
    "",
    "Trip:",
    JSON.stringify(input),
    "",
    "Rules:",
    "- Group items into 4–7 categories (Documents, Clothing, Health & Safety, etc.).",
    "- Tailor to activities, season, trip length, and altitude if provided.",
    "- Be specific and concise.",
    "",
    "Output schema:",
    '[ { "category": string, "items": string[] } ]',
    "",
    "Now produce the JSON:",
  ].join("\n");

  const result = await generateContentWithRetry(key, modelId, prompt);
  return PackingListResponseSchema.parse(
    parseJson(result.response.text().trim()),
  );
}
