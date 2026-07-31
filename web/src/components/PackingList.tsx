"use client";

import { useEffect, useState } from "react";
import type { FullJourneyPlan, FullTripInput, PackingCategory } from "@trip-planner/shared/types";
import { getPlannerApiBaseUrl } from "@/lib/apiBaseUrl";

const CATEGORY_ICONS: Record<string, string> = {
  Documents: "📄",
  Clothing: "🧥",
  "Health & Safety": "💊",
  Toiletries: "🪥",
  Electronics: "📱",
  Gear: "🎒",
  "Snacks & Water": "🍫",
};

function categoryIcon(name: string) {
  return CATEGORY_ICONS[name] ?? "📦";
}

// Persist checkbox state in localStorage
function loadChecked(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(`packing-${key}`);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveChecked(key: string, items: Set<string>) {
  try {
    localStorage.setItem(`packing-${key}`, JSON.stringify([...items]));
  } catch { /* ignore */ }
}

export function PackingList({
  plan,
  trip,
}: {
  plan: FullJourneyPlan;
  trip: FullTripInput;
}) {
  const apiBase = getPlannerApiBaseUrl();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<PackingCategory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use trip's from+to+startDate as a stable key for localStorage
  const storageKey = `${trip.from}-${trip.to}-${trip.startDate}`;
  const [checked, setChecked] = useState<Set<string>>(() => loadChecked(storageKey));

  async function generateList() {
    setLoading(true);
    setError(null);
    try {
      // Collect unique activity names to give the AI context
      const activities = [
        ...new Set(plan.days.flatMap((d) => d.activities.map((a) => a.placeName))),
      ];
      const maxAlt = Math.max(
        0,
        ...plan.days.flatMap((d) =>
          d.activities.map((a) => (a.lat && a.lat > 3000 ? a.lat : 0))
        )
      );

      const res = await fetch(`${apiBase}/planner/packing-list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: trip.from,
          to: trip.to,
          days: trip.days,
          startDate: trip.startDate,
          activities,
          maxAltitude: maxAlt || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PackingCategory[];
      setCategories(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate packing list");
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(label: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      saveChecked(storageKey, next);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎒</span>
          <span className="text-sm font-semibold text-zinc-200">Packing List</span>
          {categories && (
            <span className="text-[10px] text-zinc-500">
              {categories.reduce((s, c) => s + c.items.length, 0)} items
            </span>
          )}
        </div>
        <span className={`text-zinc-500 text-sm transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="mt-3">
          {!categories && !loading && (
            <div className="text-center py-4">
              <div className="text-sm text-zinc-400 mb-3">
                AI will generate a trip-specific packing checklist
              </div>
              <button
                type="button"
                onClick={() => void generateList()}
                className="rounded-xl bg-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-600"
              >
                Generate Packing List
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-200" />
              Generating list...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/30 p-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {categories && !loading && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                {categories.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-base leading-none">{categoryIcon(cat.category)}</span>
                      <span className="text-xs font-semibold text-zinc-300">{cat.category}</span>
                    </div>
                    <div className="space-y-1">
                      {cat.items.map((item) => {
                        const id = `${cat.category}:${item}`;
                        const done = checked.has(id);
                        return (
                          <label
                            key={item}
                            className="flex items-center gap-2 cursor-pointer group"
                          >
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={() => toggleItem(id)}
                              className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0"
                            />
                            <span className={`text-xs ${done ? "line-through text-zinc-600" : "text-zinc-300"} group-hover:text-zinc-100 transition-colors`}>
                              {item}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void generateList()}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                ↺ Regenerate list
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
