"use client";

import { useEffect, useState } from "react";
import type { JourneyDay } from "@trip-planner/shared/types";

type DayWeather = {
  icon: string;
  label: string;
  min: number;
  max: number;
  rainPct: number;
};

// WMO weather code → icon + label
function wmoToWeather(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Clear" };
  if (code <= 3) return { icon: "⛅", label: "Partly cloudy" };
  if (code <= 48) return { icon: "🌫️", label: "Foggy" };
  if (code <= 67) return { icon: "🌧️", label: "Rain" };
  if (code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code <= 82) return { icon: "🌦️", label: "Showers" };
  return { icon: "⛈️", label: "Thunderstorm" };
}

// Fetch weather for a list of (date, lat, lng) combos via Open-Meteo
async function fetchWeatherBatch(
  days: JourneyDay[]
): Promise<Map<number, DayWeather>> {
  const result = new Map<number, DayWeather>();

  // Group days by location (use first activity with coords)
  const requests: Array<{ dayNum: number; date: string; lat: number; lng: number }> = [];
  for (const d of days) {
    if (!d.date) continue;
    const act = d.activities.find((a) => a.lat && a.lng);
    if (!act?.lat || !act?.lng) continue;
    requests.push({ dayNum: d.day, date: d.date, lat: act.lat, lng: act.lng });
  }

  // Fetch each unique location (Open-Meteo allows single lat/lng per request)
  await Promise.all(
    requests.map(async ({ dayNum, date, lat, lng }) => {
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", lat.toFixed(4));
        url.searchParams.set("longitude", lng.toFixed(4));
        url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode");
        url.searchParams.set("timezone", "Asia/Kolkata");
        url.searchParams.set("start_date", date);
        url.searchParams.set("end_date", date);

        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = (await res.json()) as {
          daily?: {
            weathercode?: number[];
            temperature_2m_max?: number[];
            temperature_2m_min?: number[];
            precipitation_probability_max?: number[];
          };
        };

        const code = data.daily?.weathercode?.[0];
        const max = data.daily?.temperature_2m_max?.[0];
        const min = data.daily?.temperature_2m_min?.[0];
        const rain = data.daily?.precipitation_probability_max?.[0];

        if (code != null && max != null && min != null) {
          const { icon, label } = wmoToWeather(code);
          result.set(dayNum, {
            icon,
            label,
            min: Math.round(min),
            max: Math.round(max),
            rainPct: Math.round(rain ?? 0),
          });
        }
      } catch {
        // Silently skip if weather fetch fails for a day
      }
    })
  );

  return result;
}

// Exported hook — call this once after plan loads
export function useWeather(days: JourneyDay[]) {
  const [weather, setWeather] = useState<Map<number, DayWeather>>(new Map());

  useEffect(() => {
    if (days.length === 0) return;
    void fetchWeatherBatch(days).then(setWeather);
  }, [days]);

  return weather;
}

// Compact inline strip shown on each day card
export function WeatherStrip({ data }: { data?: DayWeather }) {
  if (!data) {
    return (
      <span className="text-[10px] text-zinc-600 italic">No weather data</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
      <span>{data.icon}</span>
      <span className="font-medium text-zinc-300">{data.min}°–{data.max}°C</span>
      {data.rainPct > 0 && <span className="text-blue-400/80">· {data.rainPct}% rain</span>}
    </span>
  );
}
