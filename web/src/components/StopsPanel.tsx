"use client";

import { useMemo, useState } from "react";
import type { Stop, StopType } from "@trip-planner/shared/types";
import { haversineKm, type MapUserLocation } from "@/lib/geo";

const LABEL: Record<StopType, string> = {
  dhaba: "Dhabas",
  petrol_pump: "Petrol pumps",
  hospital: "Hospitals",
  atm: "ATMs",
  hotel: "Hotels",
  rest_area: "Rest areas"
};

export function StopsPanel({
  stops,
  userLocation
}: {
  stops: Stop[];
  /** When set, each row shows straight-line km from your GPS position. */
  userLocation?: MapUserLocation | null;
}) {
  const [filter, setFilter] = useState<StopType | "all">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return stops;
    return stops.filter((s) => s.type === filter);
  }, [stops, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of stops) c[s.type] = (c[s.type] ?? 0) + 1;
    return c;
  }, [stops]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">Stops along the route</div>
        <div className="text-xs text-zinc-400">{stops.length} total</div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Pill>
        {(Object.keys(LABEL) as StopType[]).map((t) => (
          <Pill key={t} active={filter === t} onClick={() => setFilter(t)}>
            {LABEL[t]}{" "}
            <span className="ml-1 text-[10px] text-zinc-400">({counts[t] ?? 0})</span>
          </Pill>
        ))}
      </div>

      <div className="max-h-[260px] overflow-auto pr-1">
        <ul className="space-y-2">
          {filtered.map((s) => {
            const fromYou =
              userLocation != null
                ? haversineKm(userLocation.lng, userLocation.lat, s.longitude, s.latitude)
                : null;
            return (
            <li key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-zinc-400">
                    {LABEL[s.type]} · {s.latitude.toFixed(3)}, {s.longitude.toFixed(3)}
                  </div>
                  {fromYou != null ? (
                    <div className="mt-1 text-xs font-medium text-sky-200/90">
                      {fromYou.toFixed(1)} km from you (GPS)
                    </div>
                  ) : null}
                </div>
                {s.rating ? (
                  <div className="rounded-md bg-zinc-800 px-2 py-1 text-xs">{s.rating.toFixed(1)}</div>
                ) : null}
              </div>
              {s.notes ? <div className="mt-1 text-xs text-zinc-300">{s.notes}</div> : null}
            </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm text-zinc-300">
              No stops in this category.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-white bg-white text-black"
          : "border-zinc-800 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
      ].join(" ")}
    >
      {children}
    </button>
  );
}

