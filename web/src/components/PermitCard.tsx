"use client";

import type { PermitZone } from "@trip-planner/shared/types";

export function PermitCard({ zones }: { zones: PermitZone[] }) {
  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 p-3">
      <div className="mb-1 text-sm font-semibold text-amber-100">Permit required</div>
      <div className="text-xs text-amber-200/90">
        Your route intersects restricted zones. You’ll need Inner Line Permits for:
      </div>
      <ul className="mt-2 space-y-2">
        {zones.map((z) => (
          <li key={z.id} className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-amber-50">{z.zone_name}</div>
                <div className="text-xs text-amber-200/80">{z.permit_name}</div>
              </div>
              <div className="text-xs text-amber-100">₹{z.fee_inr}</div>
            </div>
            <a
              className="mt-1 inline-block text-xs font-medium text-amber-100 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-50"
              href={z.apply_url}
              target="_blank"
              rel="noreferrer"
            >
              Apply link
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

