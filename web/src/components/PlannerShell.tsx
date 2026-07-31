"use client";

import { useEffect, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { JourneyPlanView } from "@/components/JourneyPlanView";
import { AuthBar } from "@/components/AuthBar";
import { getPlannerApiBaseUrl } from "@/lib/apiBaseUrl";
import { parsePlannerApiError } from "@/lib/plannerApiError";
import type {
  FullJourneyPlan,
  FullTripInput,
} from "@trip-planner/shared/types";
import type { MapUserLocation } from "@/lib/geo";

function defaultTrip(): FullTripInput {
  return {
    from: "",
    to: "",
    startDate: new Date().toISOString().slice(0, 10),
    days: 10,
    travelers: 2,
    budgetInr: 45000,
    preference: "mixed",
    pace: "moderate",
    accommodation: "mid-range",
    transport: "ai-decides",
  };
}

// Skeleton card for loading state
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-xl bg-zinc-800" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-zinc-800 rounded w-1/4" />
          <div className="h-3.5 bg-zinc-800 rounded w-3/4" />
        </div>
        <div className="w-16 h-8 bg-zinc-800 rounded" />
      </div>
      <div className="h-1.5 bg-zinc-800 rounded w-full" />
    </div>
  );
}

export function PlannerShell() {
  const apiBase = getPlannerApiBaseUrl();

  const [trip, setTrip] = useState<FullTripInput>(defaultTrip);
  const [plan, setPlan] = useState<FullJourneyPlan | null>(null);
  const [previousPlan, setPreviousPlan] = useState<FullJourneyPlan | null>(
    null,
  ); // for undo
  const [changedDays, setChangedDays] = useState<number[]>([]);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSeconds, setGenSeconds] = useState(0);
  const genTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI adjustment
  const [adjustMsg, setAdjustMsg] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustReply, setAdjustReply] = useState<string | null>(null);

  // Map
  const [mapOpen, setMapOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<MapUserLocation | null>(
    null,
  );
  const [locating, setLocating] = useState(false);

  function set<K extends keyof FullTripInput>(key: K, value: FullTripInput[K]) {
    setTrip((prev) => ({ ...prev, [key]: value }));
  }

  // Start / stop the "Generating... Xs" timer
  function startTimer() {
    setGenSeconds(0);
    genTimerRef.current = setInterval(() => setGenSeconds((s) => s + 1), 1000);
  }
  function stopTimer() {
    if (genTimerRef.current) {
      clearInterval(genTimerRef.current);
      genTimerRef.current = null;
    }
  }
  useEffect(() => () => stopTimer(), []);

  async function generate() {
    if (!trip.from.trim() || !trip.to.trim()) {
      setGenError("Please enter both a starting city and a destination.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    setPlan(null);
    setPreviousPlan(null);
    setChangedDays([]);
    setAdjustReply(null);
    setAdjustError(null);
    startTimer();
    try {
      const res = await fetch(`${apiBase}/planner/full-journey`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trip),
      });
      if (!res.ok) {
        const raw = await res.text();
        throw new Error(parsePlannerApiError(raw, res.status));
      }
      const data = (await res.json()) as FullJourneyPlan;
      setPlan(data);
    } catch (e) {
      setGenError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setGenerating(false);
      stopTimer();
    }
  }

  async function applyAdjustment() {
    if (!plan || !adjustMsg.trim()) return;
    setPreviousPlan(plan); // save for undo
    setAdjusting(true);
    setAdjustError(null);
    setAdjustReply(null);
    setChangedDays([]);
    try {
      const res = await fetch(`${apiBase}/planner/journey-adjust`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, trip, instruction: adjustMsg.trim() }),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw new Error(parsePlannerApiError(raw, res.status));
      }
      const data = JSON.parse(raw) as {
        reply: string;
        changedDays: number[];
        plan: FullJourneyPlan;
      };
      setPlan(data.plan);
      setChangedDays(data.changedDays ?? []);
      setAdjustReply(data.reply);
      setAdjustMsg("");
    } catch (e) {
      setAdjustError(
        e instanceof Error ? e.message : "Could not apply that change.",
      );
      setPreviousPlan(null); // undo not needed if change failed
    } finally {
      setAdjusting(false);
    }
  }

  function undoAdjustment() {
    if (!previousPlan) return;
    setPlan(previousPlan);
    setPreviousPlan(null);
    setChangedDays([]);
    setAdjustReply(null);
  }

  async function fillFromLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((ok, fail) =>
        navigator.geolocation.getCurrentPosition(ok, fail, {
          enableHighAccuracy: true,
          timeout: 15000,
        }),
      );
      setUserLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? null,
      });
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10`,
        { headers: { "Accept-Language": "en" } },
      );
      const d = (await res.json()) as {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state?: string;
        };
      };
      const a = d.address;
      const place = a?.city ?? a?.town ?? a?.village ?? a?.state ?? "";
      if (place) set("from", place);
    } catch {
      /* silently ignore */
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!mapOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mapOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* ── Header ── */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              AI Trip Planner
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Flights · Hotels · Sightseeing · Day-by-day itinerary
            </p>
          </div>
          <AuthBar />
        </div>
      </header>

      {/* ── Three-column layout ── */}
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_1fr_280px]">
        {/* ── LEFT: Inputs ── */}
        <aside className="flex flex-col gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">
              Trip Details
            </h2>
            <div className="space-y-3">
              <FormField label="From">
                <div className="flex gap-1.5">
                  <input
                    value={trip.from}
                    onChange={(e) => set("from", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void generate()}
                    placeholder="Origin city"
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void fillFromLocation()}
                    disabled={locating}
                    title="Use my location"
                    className="shrink-0 rounded-lg border border-sky-700/60 bg-sky-950/40 px-2.5 py-2 text-sky-300 hover:bg-sky-900/50 disabled:opacity-50"
                  >
                    {locating ? "…" : "📍"}
                  </button>
                </div>
              </FormField>
              <FormField label="To">
                <input
                  value={trip.to}
                  onChange={(e) => set("to", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void generate()}
                  placeholder="Destination"
                  className="input w-full"
                />
              </FormField>
              <FormField label="Start Date">
                <input
                  type="date"
                  value={trip.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className="input w-full"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Days">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={trip.days}
                    onChange={(e) => set("days", Number(e.target.value))}
                    className="input w-full"
                  />
                </FormField>
                <FormField label="Travelers">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={trip.travelers}
                    onChange={(e) => set("travelers", Number(e.target.value))}
                    className="input w-full"
                  />
                </FormField>
              </div>
              <FormField label="Budget (₹ total)">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={trip.budgetInr}
                  onChange={(e) => set("budgetInr", Number(e.target.value))}
                  className="input w-full"
                />
              </FormField>
              <FormField label="Travel Style">
                <select
                  value={trip.preference}
                  onChange={(e) =>
                    set(
                      "preference",
                      e.target.value as FullTripInput["preference"],
                    )
                  }
                  className="input w-full"
                >
                  <option value="adventure">Adventure</option>
                  <option value="leisure">Leisure</option>
                  <option value="cultural">Cultural</option>
                  <option value="mixed">Mixed</option>
                </select>
              </FormField>
              <FormField label="Pace">
                <select
                  value={trip.pace}
                  onChange={(e) =>
                    set("pace", e.target.value as FullTripInput["pace"])
                  }
                  className="input w-full"
                >
                  <option value="relaxed">Relaxed</option>
                  <option value="moderate">Moderate</option>
                  <option value="packed">Packed</option>
                </select>
              </FormField>
              <FormField label="Accommodation">
                <select
                  value={trip.accommodation}
                  onChange={(e) =>
                    set(
                      "accommodation",
                      e.target.value as FullTripInput["accommodation"],
                    )
                  }
                  className="input w-full"
                >
                  <option value="budget">Budget (₹500–1,000/night)</option>
                  <option value="mid-range">
                    Mid-range (₹1,500–3,000/night)
                  </option>
                  <option value="luxury">Luxury (₹4,000+/night)</option>
                  <option value="hostel">Hostel / Dorm</option>
                  <option value="camp">Camp / Homestay</option>
                </select>
              </FormField>
              <FormField label="Transport Priority">
                <select
                  value={trip.transport}
                  onChange={(e) =>
                    set(
                      "transport",
                      e.target.value as FullTripInput["transport"],
                    )
                  }
                  className="input w-full"
                >
                  <option value="cheapest">Cheapest</option>
                  <option value="fastest">Fastest</option>
                  <option value="comfortable">Most Comfortable</option>
                  <option value="ai-decides">AI Decides</option>
                </select>
              </FormField>

              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating}
                className="mt-1 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    Generating... {genSeconds}s
                  </>
                ) : (
                  "Generate Plan"
                )}
              </button>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
              Powered by Claude AI. Generates flights, hotels, and sightseeing
              for every day.
            </p>
          </div>
        </aside>

        {/* ── CENTER: Journey Plan ── */}
        <main className="min-w-0">
          {/* Generating — skeleton loaders */}
          {generating && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse">
                <div className="h-4 bg-zinc-800 rounded w-1/2 mb-2" />
                <div className="h-2.5 bg-zinc-800 rounded w-3/4 mb-4" />
                <div className="h-2.5 bg-zinc-800 rounded-full w-full" />
              </div>
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Error */}
          {genError && !generating && (
            <div className="rounded-2xl border border-red-800/60 bg-red-950/30 p-4">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <div className="text-sm font-semibold text-red-300">
                    Could not generate plan
                  </div>
                  <div className="text-xs text-red-200/80 mt-0.5">
                    The AI service encountered an issue. Please try again.
                  </div>
                </div>
              </div>
              <div className="text-xs text-red-200/70 mb-3 font-mono bg-red-950/40 px-2 py-1.5 rounded-lg">
                {genError}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="rounded-lg border border-red-700/60 bg-red-950/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/50"
                >
                  Retry
                </button>
                {plan && (
                  <button
                    type="button"
                    onClick={() => setGenError(null)}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Use last plan
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!plan && !generating && !genError && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
              <div className="text-5xl mb-4">🗺️</div>
              <div className="text-base font-semibold text-zinc-300">
                Your trip plan will appear here
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                Fill in your trip details and click Generate Plan to get
                started.
              </div>
            </div>
          )}

          {/* Plan */}
          {plan && !generating && (
            <JourneyPlanView
              plan={plan}
              tripInput={trip}
              changedDays={changedDays}
              onRegenerate={() => void generate()}
              isLoading={generating}
            />
          )}
        </main>

        {/* ── RIGHT: Map + AI adjustments ── */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          {/* Map */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-xs font-medium text-zinc-300">Map</span>
              <span className="text-[10px] text-zinc-600">Click to expand</span>
            </div>
            <div className="relative h-44 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
              <MapView
                route={null}
                stops={[]}
                journeyPlan={plan}
                userLocation={userLocation}
                fillHeight
                containerClassName="h-full w-full"
              />
              <button
                type="button"
                aria-label="Expand map"
                className="absolute inset-0 z-[1000] rounded-xl bg-transparent hover:bg-white/[0.04] cursor-zoom-in"
                onClick={() => setMapOpen(true)}
              />
            </div>
          </div>

          {/* AI Adjustments */}
          {plan && (
            <div className="rounded-2xl border border-violet-800/40 bg-violet-950/15 p-3">
              <div className="text-xs font-semibold text-violet-200 mb-1">
                Modify Your Plan
              </div>
              <p className="text-[10px] text-zinc-500 mb-2.5 leading-snug">
                Tell the AI what to change. E.g. &ldquo;Move Pangong Lake to Day 5&rdquo; or
                &ldquo;Change Day 3 hotel to under ₹1,500&rdquo;
              </p>
              <textarea
                value={adjustMsg}
                onChange={(e) => setAdjustMsg(e.target.value)}
                rows={4}
                maxLength={1000}
                disabled={adjusting}
                placeholder="e.g. On Day 2, skip the afternoon activity and add a monastery visit instead"
                className="mb-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500/60"
              />
              <button
                type="button"
                disabled={adjusting || !adjustMsg.trim()}
                onClick={() => void applyAdjustment()}
                className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adjusting ? "Applying..." : "Apply Change"}
              </button>

              {/* Success with undo */}
              {adjustReply && (
                <div className="mt-2 rounded-lg border border-emerald-800/40 bg-emerald-950/25 px-2.5 py-2">
                  <div className="text-[11px] leading-relaxed text-emerald-100 mb-1.5">
                    ✓ {adjustReply}
                  </div>
                  {previousPlan && (
                    <button
                      type="button"
                      onClick={undoAdjustment}
                      className="text-[10px] text-emerald-400 hover:text-emerald-200 underline"
                    >
                      ↩ Undo this change
                    </button>
                  )}
                </div>
              )}
              {adjustError && (
                <div className="mt-2 rounded-lg border border-red-800/60 bg-red-950/35 px-2.5 py-2 text-[11px] text-red-200">
                  ✗ {adjustError}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── Full-screen map modal ── */}
      {mapOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setMapOpen(false)}
        >
          <div
            className="flex h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <span className="text-sm font-medium text-zinc-100">
                Route Map
              </span>
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
            <div className="relative min-h-0 flex-1 p-2">
              <div className="absolute inset-2 overflow-hidden rounded-xl border border-zinc-800">
                <MapView
                  route={null}
                  stops={[]}
                  journeyPlan={plan}
                  userLocation={userLocation}
                  fillHeight
                  containerClassName="h-full w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}
