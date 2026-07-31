"use client";

import { useState } from "react";
import type { FullJourneyPlan } from "@trip-planner/shared/types";

function rupees(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

export function BudgetBreakdown({
  plan,
  budget,
}: {
  plan: FullJourneyPlan;
  budget: number;
}) {
  const [open, setOpen] = useState(false);

  // Sum up each category from the plan
  const transport = plan.days.reduce((sum, d) => sum + (d.transport?.estimatedCost ?? 0), 0);
  const accommodation = plan.days.reduce((sum, d) => sum + (d.hotel?.costPerNight ?? 0), 0);
  const food = plan.days.reduce(
    (sum, d) => sum + d.meals.reduce((ms, m) => ms + (m.estimatedCost ?? 0), 0),
    0
  );
  const sightseeing = plan.days.reduce(
    (sum, d) =>
      sum + d.activities.reduce((as, a) => as + (a.entryFee ?? 0) + (a.travelCost ?? 0), 0),
    0
  );
  const baseTotal = transport + accommodation + food + sightseeing;
  const buffer = Math.round(baseTotal * 0.1);
  const total = plan.summary.estimatedCost || baseTotal + buffer;

  const overBudget = total > budget;
  const budgetPct = Math.min(100, pct(total, budget));

  // Bar color thresholds
  const barColor =
    overBudget || budgetPct >= 100 ? "bg-red-500"
    : budgetPct > 85 ? "bg-orange-400"
    : budgetPct > 70 ? "bg-yellow-400"
    : "bg-emerald-500";

  const warningText =
    overBudget ? "Over budget — consider adjustments"
    : budgetPct > 85 ? "Near budget limit"
    : budgetPct > 70 ? "Approaching budget limit"
    : null;

  const rows = [
    { label: "Transport (flights + cabs)", value: transport },
    { label: "Accommodation", value: accommodation },
    { label: "Food & Meals", value: food },
    { label: "Sightseeing & Entry Fees", value: sightseeing },
    { label: "Miscellaneous Buffer (10%)", value: buffer },
  ];

  return (
    <div>
      {/* Budget bar */}
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-zinc-400">
          Estimated:{" "}
          <span className={`font-semibold ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
            {rupees(total)}
          </span>
          <span className="text-zinc-600"> per person</span>
        </span>
        <span className="text-zinc-500">Budget: {rupees(budget)}</span>
      </div>

      <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden mb-1">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${budgetPct}%` }} />
      </div>

      {warningText && (
        <div className={`text-[11px] mb-1 ${overBudget ? "text-red-400" : budgetPct > 85 ? "text-orange-400" : "text-yellow-400"}`}>
          ⚠ {warningText}
        </div>
      )}

      {/* Toggle breakdown */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1"
      >
        {open ? "▲ Hide breakdown" : "▼ See breakdown"}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
          {rows.map((row) => {
            const p = pct(row.value, total);
            return (
              <div
                key={row.label}
                className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-300 truncate">{row.label}</div>
                  <div className="h-1 rounded-full bg-zinc-800 mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-zinc-500"
                      style={{ width: `${p}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-medium text-zinc-200">{rupees(row.value)}</div>
                  <div className="text-[10px] text-zinc-600">{p}%</div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/40">
            <span className="text-xs font-semibold text-zinc-300">Total Estimated</span>
            <span className={`text-sm font-semibold ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
              {rupees(total)} / {rupees(budget)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
