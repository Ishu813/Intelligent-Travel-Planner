import type {
  FullJourneyPlan,
  FullTripInput,
  JourneyDay,
  MapRouteSegment,
} from "@trip-planner/shared/types";

export const CHUNKED_PLAN_THRESHOLD = 4;
export const JOURNEY_CHUNK_SIZE = 2;

export function getJourneyChunkRanges(
  totalDays: number,
  chunkSize = JOURNEY_CHUNK_SIZE,
): Array<{ fromDay: number; toDay: number }> {
  const ranges: Array<{ fromDay: number; toDay: number }> = [];
  for (let start = 1; start <= totalDays; start += chunkSize) {
    ranges.push({
      fromDay: start,
      toDay: Math.min(start + chunkSize - 1, totalDays),
    });
  }
  return ranges;
}

export function shouldUseChunkedGeneration(days: number) {
  return days > CHUNKED_PLAN_THRESHOLD;
}

export type JourneyChunkResponse = {
  days: JourneyDay[];
  mapRoute: MapRouteSegment[];
};

export type JourneyChunkContext = {
  lastCity?: string;
  lastHotel?: string;
  daysSoFarCost?: number;
};

export function buildChunkContext(
  days: JourneyDay[],
): JourneyChunkContext | undefined {
  const lastDay = days.at(-1);
  if (!lastDay) return undefined;

  const lastCity =
    lastDay.hotel?.location ||
    lastDay.activities.at(-1)?.placeName ||
    lastDay.transport?.to;

  return {
    lastCity: lastCity || undefined,
    lastHotel: lastDay.hotel?.name || undefined,
    daysSoFarCost: days.reduce((sum, day) => sum + day.dayTotalCost, 0),
  };
}

export function mergeJourneyChunks(
  trip: FullTripInput,
  chunks: JourneyChunkResponse[],
): FullJourneyPlan {
  const days = chunks
    .flatMap((chunk) => chunk.days)
    .sort((a, b) => a.day - b.day);
  const mapRoute = chunks.flatMap((chunk) => chunk.mapRoute);
  const estimatedCost = days.reduce((sum, day) => sum + day.dayTotalCost, 0);
  const modes = new Set<string>();

  for (const day of days) {
    if (day.transport?.mode && day.transport.mode !== "none") {
      modes.add(day.transport.mode);
    }
  }

  return {
    summary: {
      totalDays: trip.days,
      totalDistance: `${trip.from} → ${trip.to}`,
      estimatedCost,
      transportMix: modes.size ? [...modes].join(", ") : "mixed",
    },
    days,
    mapRoute,
  };
}
