import { NextResponse } from "next/server";
import { z } from "zod";
import { generateFullJourney } from "@trip-planner/api/full-journey";

const fullTripZ = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  startDate: z.string(),
  days: z.number().int().min(1).max(60),
  travelers: z.number().int().min(1).max(20),
  budgetInr: z.number().int().min(0),
  preference: z.enum(["adventure", "leisure", "cultural", "mixed"]),
  pace: z.enum(["relaxed", "moderate", "packed"]),
  accommodation: z.enum(["budget", "mid-range", "luxury", "hostel", "camp"]),
  transport: z.enum(["cheapest", "fastest", "comfortable", "ai-decides"]),
});

export async function POST(req: Request) {
  try {
    const trip = fullTripZ.parse(await req.json());
    const plan = await generateFullJourney(trip);
    return NextResponse.json(plan);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    const message =
      err instanceof z.ZodError
        ? "AI returned an invalid plan format. Please try again."
        : err instanceof Error
          ? err.message
          : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
