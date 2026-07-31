"use client";

import type { AltitudeSample, RiskSegment } from "@trip-planner/shared/types";

export function AltitudeChart({
  altitude,
  risk
}: {
  altitude: AltitudeSample[];
  risk: RiskSegment[];
}) {
  const max = Math.max(...altitude.map((a) => a.altitude_m ?? 0), 1);
  const points = altitude
    .map((a, i) => {
      const x = (i / Math.max(altitude.length - 1, 1)) * 100;
      const y = 100 - ((a.altitude_m ?? 0) / max) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-sm font-medium">Altitude profile</div>
        <div className="text-xs text-zinc-400">{altitude.length} samples</div>
      </div>
      <div className="text-xs text-zinc-400">
        Risk rule: &gt;500m gain within 50km above 3000m.
      </div>

      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
        <svg viewBox="0 0 100 100" className="h-32 w-full">
          <polyline
            fill="none"
            stroke="white"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
        </svg>
        <div className="mt-2 text-xs text-zinc-400">Max altitude: {max.toFixed(0)}m</div>
      </div>

      {risk.length ? (
        <div className="mt-3 rounded-xl border border-red-800/50 bg-red-950/30 p-3">
          <div className="text-sm font-semibold text-red-100">Altitude warning</div>
          <ul className="mt-2 space-y-2 text-xs text-red-100/90">
            {risk.map((r, idx) => (
              <li key={idx} className="rounded-lg border border-red-900/30 bg-red-950/30 p-2">
                <div>
                  {r.start_distance_km.toFixed(0)}–{r.end_distance_km.toFixed(0)} km: {r.reason}
                </div>
                {r.suggested_rest_stop ? (
                  <div className="mt-1 text-red-200/80">
                    Suggested rest stop: <span className="font-medium">{r.suggested_rest_stop}</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-3 text-xs text-zinc-400">No risky segments detected.</div>
      )}
    </div>
  );
}

