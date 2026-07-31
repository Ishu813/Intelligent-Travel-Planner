"use client";

import { useEffect, useRef, useState } from "react";
import { DayCard } from "@/components/DayCard";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { PermitsCard } from "@/components/PermitsCard";
import { TripTimeline } from "@/components/TripTimeline";
import { PackingList } from "@/components/PackingList";
import { WeatherStrip, useWeather } from "@/components/WeatherStrip";
import type { FullJourneyPlan, FullTripInput } from "@trip-planner/shared/types";

export function JourneyPlanView({
  plan,
  tripInput,
  changedDays,
  onRegenerate,
  isLoading,
}: {
  plan: FullJourneyPlan;
  tripInput: FullTripInput;
  changedDays: number[];
  onRegenerate: () => void;
  isLoading: boolean;
}) {
  const { summary, days } = plan;

  // Build cumulative running totals
  const runningTotals: number[] = [];
  let cumulative = 0;
  for (const day of days) {
    cumulative += day.dayTotalCost;
    runningTotals.push(cumulative);
  }

  // Track which day is currently visible in the center panel
  const [activeDayId, setActiveDayId] = useState(days[0]?.day ?? 1);
  const dayRefs = useRef<Map<number, React.RefObject<HTMLDivElement>>>(new Map());

  // Create a ref for each day card
  for (const day of days) {
    if (!dayRefs.current.has(day.day)) {
      dayRefs.current.set(day.day, { current: null });
    }
  }

  // IntersectionObserver: update active dot as user scrolls
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    for (const day of days) {
      const el = document.getElementById(`day-${day.day}`);
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) setActiveDayId(day.day);
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [days]);

  // Fetch weather for all days (free Open-Meteo, no key needed)
  const weather = useWeather(days);

  // Auto-scroll to first changed day after adjustment
  useEffect(() => {
    if (changedDays.length === 0) return;
    const firstChanged = changedDays[0]!;
    setTimeout(() => {
      const el = document.getElementById(`day-${firstChanged}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [changedDays]);

  return (
    <div className="space-y-3">
      {/* ── Plan summary header ── */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {tripInput.from} → {tripInput.to}
            </h2>
            <div className="text-xs text-zinc-400 mt-0.5">
              {summary.totalDays} days
              {summary.totalDistance ? ` · ${summary.totalDistance}` : ""}
              {summary.transportMix ? ` · ${summary.transportMix}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isLoading}
            className="rounded-xl bg-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 min-w-[140px] text-center"
          >
            {isLoading ? "Regenerating..." : "↺ Regenerate Plan"}
          </button>
        </div>

        {/* Budget bar + breakdown */}
        <BudgetBreakdown plan={plan} budget={tripInput.budgetInr} />
      </div>

      {/* ── Permits warning (if applicable) ── */}
      <PermitsCard plan={plan} />

      {/* ── Sticky day timeline ── */}
      <div className="sticky top-3 z-10">
        <TripTimeline days={days} activeDayId={activeDayId} />
      </div>

      {/* ── Day cards ── */}
      {days.map((day, i) => (
        <div key={day.day} className="relative">
          {/* Weather strip above each card */}
          {weather.size > 0 && (
            <div className="mb-1 px-1">
              <WeatherStrip data={weather.get(day.day)} />
            </div>
          )}
          <DayCard
            day={day}
            runningTotal={runningTotals[i] ?? 0}
            budget={tripInput.budgetInr}
            defaultOpen={i === 0}
            highlight={changedDays.includes(day.day)}
            dayRef={dayRefs.current.get(day.day)}
          />
        </div>
      ))}

      {days.length === 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
          No days in plan. Try regenerating.
        </div>
      )}

      {/* ── Packing list at the bottom ── */}
      {days.length > 0 && <PackingList plan={plan} trip={tripInput} />}
    </div>
  );
}
