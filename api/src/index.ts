import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { db } from "./services/db";
import {
  adjustFullJourney,
  FullJourneyPlanSchema,
  generateFullJourney,
  generatePackingList,
} from "./services/fullJourney";

const app = express();

function ah(
  fn: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => Promise<void>,
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    void fn(req, res, next).catch(next);
  };
}

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

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

app.get(
  "/health",
  ah(async (_req, res) => {
    const ok = await db.ping();
    res.json({ ok, time: new Date().toISOString() });
  }),
);

app.post(
  "/planner/full-journey",
  ah(async (req, res) => {
    const trip = fullTripZ.parse(req.body);
    const plan = await generateFullJourney(trip);
    res.json(plan);
  }),
);

app.post(
  "/planner/journey-adjust",
  ah(async (req, res) => {
    const body = z
      .object({
        plan: FullJourneyPlanSchema,
        trip: fullTripZ,
        instruction: z.string().min(1).max(2000),
      })
      .parse(req.body);
    const result = await adjustFullJourney(body);
    res.json(result);
  }),
);

app.post(
  "/planner/packing-list",
  ah(async (req, res) => {
    const body = z
      .object({
        from: z.string(),
        to: z.string(),
        days: z.number().int().min(1),
        startDate: z.string(),
        activities: z.array(z.string()),
        maxAltitude: z.number().optional(),
      })
      .parse(req.body);
    const list = await generatePackingList(body);
    res.json(list);
  }),
);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // eslint-disable-next-line no-console
    console.error(err);
    const anyErr = err as { status?: number; message?: string };
    const message =
      err instanceof z.ZodError
        ? "AI returned an invalid plan format. Please try again."
        : (err instanceof Error && err.message) ||
          (typeof anyErr?.message === "string" && anyErr.message) ||
          "Unknown error";
    const status = typeof anyErr?.status === "number" ? anyErr.status : 500;
    res.status(status).json({ error: message });
  },
);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
