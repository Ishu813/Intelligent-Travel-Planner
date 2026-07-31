"use client";

import { useEffect, useRef, useState } from "react";
import type { JourneyDay } from "@trip-planner/shared/types";

const MODE_ICON: Record<string, string> = {
  flight: "✈️",
  train: "🚂",
  bus: "🚌",
  cab: "🚗",
  walk: "🚶",
  none: "⭐",
};

function getDayIcon(day: JourneyDay): string {
  const mode = day.transport?.mode;
  if (mode && mode !== "none") return MODE_ICON[mode] ?? "🚗";
  if (day.activities.length > 0) return "⭐";
  return "🏨";
}

function getDayColor(day: JourneyDay): string {
  const mode = day.transport?.mode;
  if (mode === "flight" || mode === "train") return "bg-blue-600";
  if (mode === "bus" || mode === "cab") return "bg-orange-600";
  if (day.activities.length > 0) return "bg-emerald-700";
  return "bg-zinc-600";
}

export function TripTimeline({
  days,
  activeDayId,
}: {
  days: JourneyDay[];
  activeDayId: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToDay(dayNum: number) {
    const el = document.getElementById(`day-${dayNum}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Keep the active dot in view
  useEffect(() => {
    if (!scrollRef.current) return;
    const active = scrollRef.current.querySelector(`[data-day="${activeDayId}"]`);
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeDayId]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div
        ref={scrollRef}
        className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {days.map((day, i) => {
          const isActive = day.day === activeDayId;
          const icon = getDayIcon(day);
          const color = getDayColor(day);

          return (
            <div key={day.day} className="flex items-center shrink-0">
              {/* Dot button */}
              <button
                type="button"
                data-day={day.day}
                onClick={() => scrollToDay(day.day)}
                title={`Day ${day.day}: ${day.title}`}
                className={[
                  "flex flex-col items-center gap-0.5 px-1 group",
                  "transition-transform duration-150",
                  isActive ? "scale-110" : "hover:scale-105",
                ].join(" ")}
              >
                <div
                  className={[
                    "w-8 h-8 rounded-full flex items-center justify-center text-base transition-all",
                    color,
                    isActive ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900" : "opacity-70 group-hover:opacity-100",
                  ].join(" ")}
                >
                  {icon}
                </div>
                <span className={`text-[9px] font-semibold ${isActive ? "text-zinc-200" : "text-zinc-600"}`}>
                  D{day.day}
                </span>
              </button>

              {/* Connector line (not after last) */}
              {i < days.length - 1 && (
                <div
                  className={`h-0.5 w-4 shrink-0 ${
                    day.day < activeDayId ? "bg-zinc-400" : "bg-zinc-700"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
