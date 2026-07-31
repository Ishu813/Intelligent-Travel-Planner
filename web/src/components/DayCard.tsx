"use client";

import { useEffect, useRef, useState } from "react";
import type { JourneyDay } from "@trip-planner/shared/types";

// ── Booking URLs ──────────────────────────────────────────────────────────────
const BOOKING_URLS: Record<string, string> = {
  MakeMyTrip: "https://www.makemytrip.com/flights/",
  Cleartrip: "https://www.cleartrip.com/flights",
  EaseMyTrip: "https://www.easemytrip.com/",
  IRCTC: "https://www.irctc.co.in/",
  RedBus: "https://www.redbus.in/",
  Ola: "https://www.olacabs.com/",
  Uber: "https://www.uber.com/in/en/",
  "Booking.com": "https://www.booking.com/",
  MakeMyTrip_Hotel: "https://www.makemytrip.com/hotels/",
  OYO: "https://www.oyorooms.com/",
};

function bookingUrl(platform: string, hotelName?: string, city?: string): string {
  if ((platform === "Booking.com") && hotelName && city) {
    return `https://www.booking.com/search.html?ss=${encodeURIComponent(hotelName + " " + city)}`;
  }
  return BOOKING_URLS[platform] ?? `https://www.google.com/search?q=${encodeURIComponent(platform + " booking")}`;
}

function BookingButton({ platform, hotelName, city }: { platform: string; hotelName?: string; city?: string }) {
  if (!platform) return null;
  return (
    <a
      href={bookingUrl(platform, hotelName, city)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[10px] font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
    >
      🔗 {platform} ↗
    </a>
  );
}

// ── Transport mode config ─────────────────────────────────────────────────────
const MODE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  flight: { icon: "✈️", color: "text-blue-300", bg: "bg-blue-950/40 border-blue-700/50" },
  train: { icon: "🚂", color: "text-red-300", bg: "bg-red-950/40 border-red-700/50" },
  bus: { icon: "🚌", color: "text-green-300", bg: "bg-green-950/40 border-green-700/50" },
  cab: { icon: "🚗", color: "text-orange-300", bg: "bg-orange-950/40 border-orange-700/50" },
  walk: { icon: "🚶", color: "text-gray-300", bg: "bg-gray-900/40 border-gray-700/50" },
};

// ── Activity time slot badges ─────────────────────────────────────────────────
const SLOT_STYLE: Record<string, string> = {
  morning: "bg-amber-900/50 text-amber-300 border border-amber-700/40",
  afternoon: "bg-blue-900/50 text-blue-300 border border-blue-700/40",
  evening: "bg-purple-900/50 text-purple-300 border border-purple-700/40",
};

function rupees(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(s: string) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  } catch { return s; }
}

// ── Main component ────────────────────────────────────────────────────────────
export function DayCard({
  day,
  runningTotal,
  budget,
  defaultOpen = false,
  highlight = false,
  dayRef,
}: {
  day: JourneyDay;
  runningTotal: number;
  budget: number;
  defaultOpen?: boolean;
  highlight?: boolean;      // yellow border for changed days
  dayRef?: React.RefObject<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { transport, hotel } = day;
  const hasTransport = transport?.mode && transport.mode !== "none";

  const modeConfig = hasTransport ? (MODE_CONFIG[transport!.mode] ?? MODE_CONFIG.cab) : null;

  const budgetPercent = Math.min(100, (runningTotal / budget) * 100);
  const overBudget = runningTotal > budget;

  return (
    <div
      ref={dayRef}
      id={`day-${day.day}`}
      className={[
        "rounded-2xl border bg-zinc-900/60 overflow-hidden transition-all duration-200",
        open ? "border-zinc-600" : "border-zinc-800",
        highlight ? "ring-2 ring-yellow-400/70" : "",
      ].join(" ")}
    >
      {/* ── Collapsed header ── */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3.5 hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Day badge */}
            <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300">
              D{day.day}
            </span>
            <div className="min-w-0">
              {/* Transport mode badge(s) */}
              {modeConfig && (
                <div className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium mr-2 ${modeConfig.bg} ${modeConfig.color}`}>
                  <span>{modeConfig.icon}</span>
                </div>
              )}
              {highlight && (
                <span className="inline-flex items-center gap-0.5 rounded border border-yellow-600/50 bg-yellow-900/30 px-1.5 py-0.5 text-[10px] font-medium text-yellow-300 mr-2">
                  ✏️ Updated
                </span>
              )}
              <div className="text-[10px] text-zinc-500 mb-0.5">
                {day.date ? formatDate(day.date) : `Day ${day.day}`}
              </div>
              <div className="text-sm font-semibold text-zinc-100 truncate leading-snug">
                {day.title}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-sm font-semibold text-zinc-200">{rupees(day.dayTotalCost)}</div>
              <div className="text-[10px] text-zinc-600">per person</div>
            </div>
            <span className={`text-zinc-500 text-sm transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
          </div>
        </div>
      </button>

      {/* ── Expanded content ── */}
      {open && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
          {/* Transport */}
          {hasTransport && transport && (
            <div className="px-4 py-3">
              <SectionLabel icon={modeConfig?.icon ?? "🚀"} text="Transport" />
              <div className="mt-2">
                <div className="text-base font-semibold text-zinc-100">{transport.operator}</div>
                {transport.from && transport.to && (
                  <div className="text-sm text-zinc-400 mt-0.5">{transport.from} → {transport.to}</div>
                )}
                {(transport.departureTime || transport.arrivalTime) && (
                  <div className="font-mono text-sm text-zinc-300 mt-1">
                    {transport.departureTime && transport.arrivalTime
                      ? `${transport.departureTime} → ${transport.arrivalTime}`
                      : transport.departureTime || transport.arrivalTime}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {transport.estimatedCost > 0 && (
                    <span className="text-sm font-medium text-emerald-400">{rupees(transport.estimatedCost)}/person</span>
                  )}
                  {transport.bookingPlatform && (
                    <BookingButton platform={transport.bookingPlatform} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hotel */}
          {hotel?.name && (
            <div className="px-4 py-3">
              <SectionLabel icon="🏨" text="Stay Tonight" />
              <div className="mt-2">
                <div className="text-base font-semibold text-zinc-100">{hotel.name}</div>
                {hotel.location && <div className="text-sm text-zinc-400 mt-0.5">{hotel.location}</div>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {hotel.costPerNight > 0 && (
                    <span className="text-sm text-zinc-300">{rupees(hotel.costPerNight)} / night</span>
                  )}
                  {hotel.checkIn && (
                    <span className="rounded-full bg-emerald-900/50 border border-emerald-700/40 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      Check-in today
                    </span>
                  )}
                  {hotel.checkOut && (
                    <span className="rounded-full bg-amber-900/50 border border-amber-700/40 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                      Check-out today
                    </span>
                  )}
                  {!hotel.checkIn && !hotel.checkOut && hotel.name && (
                    <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                      Staying here
                    </span>
                  )}
                  {hotel.bookingPlatform && (
                    <BookingButton
                      platform={hotel.bookingPlatform}
                      hotelName={hotel.name}
                      city={hotel.location}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Activities */}
          {day.activities.length > 0 && (
            <div className="px-4 py-3">
              <SectionLabel icon="🗺️" text="Activities" />
              <div className="mt-2 space-y-3">
                {day.activities.map((act, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className={`shrink-0 mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize ${SLOT_STYLE[act.timeSlot] ?? ""}`}>
                      {act.timeSlot}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{act.placeName}</div>
                      {act.description && (
                        <div className="text-xs text-zinc-500 leading-snug mt-0.5 line-clamp-2">
                          {act.description}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-600 mt-0.5">
                        {act.duration && <span>⏱ {act.duration}</span>}
                        {act.entryFee > 0 ? (
                          <span>🎟 {rupees(act.entryFee)}</span>
                        ) : act.duration ? (
                          <span>🎟 Free</span>
                        ) : null}
                        {act.travelFromPrev && <span>🚗 {act.travelFromPrev}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meals */}
          {day.meals.length > 0 && (
            <div className="px-4 py-3">
              <SectionLabel icon="🍽️" text="Food" />
              <div className="mt-2 space-y-2">
                {day.meals.map((meal, i) => (
                  <div key={i} className="flex items-baseline gap-1.5 text-xs">
                    <span className="capitalize font-medium text-zinc-400 shrink-0">{meal.type}:</span>
                    <span className="text-zinc-300">{meal.restaurant}</span>
                    {meal.cuisine && <span className="text-zinc-600">· {meal.cuisine}</span>}
                    {meal.estimatedCost > 0 && (
                      <span className="text-zinc-600 ml-auto shrink-0">· {rupees(meal.estimatedCost)}/person</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day footer — cost + running total */}
          <div className="px-4 py-3 bg-zinc-950/40">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-500">
                Running total: <span className={`font-semibold ${overBudget ? "text-red-400" : "text-zinc-300"}`}>{rupees(runningTotal)}</span>
                <span className="text-zinc-600"> of {rupees(budget)}</span>
              </span>
              <span className="font-semibold text-zinc-200">Day total: {rupees(day.dayTotalCost)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  overBudget ? "bg-red-500"
                  : budgetPercent > 85 ? "bg-orange-400"
                  : budgetPercent > 70 ? "bg-yellow-400"
                  : "bg-emerald-500"
                }`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
          </div>

          {/* Notes */}
          {day.notes && (
            <div className="px-4 py-2.5 text-[11px] italic leading-relaxed text-zinc-500">
              💡 {day.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm leading-none">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{text}</span>
    </div>
  );
}
