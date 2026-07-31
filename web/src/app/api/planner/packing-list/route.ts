import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePackingList } from "@trip-planner/api/full-journey";

export async function POST(req: Request) {
  try {
    const body = z
      .object({
        from: z.string(),
        to: z.string(),
        days: z.number().int().min(1),
        startDate: z.string(),
        activities: z.array(z.string()),
        maxAltitude: z.number().optional(),
      })
      .parse(await req.json());
    const list = await generatePackingList(body);
    return NextResponse.json(list);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
