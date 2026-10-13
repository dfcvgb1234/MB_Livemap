"use client";

import {
  Cloud,
  CloudFog,
  CloudRain,
  CloudSun,
  Sun,
  Thermometer,
} from "lucide-react";
import type { Weather } from "@/lib/types";

function WeatherIcon({ condition }: { condition: string | null }) {
  const c = (condition ?? "").toLowerCase();
  if (c.includes("rain") || c.includes("storm"))
    return <CloudRain className="size-5" />;
  if (c.includes("fog")) return <CloudFog className="size-5" />;
  if (c.includes("cloud") && c.includes("part"))
    return <CloudSun className="size-5" />;
  if (c.includes("cloud")) return <Cloud className="size-5" />;
  if (c.includes("sun") || c.includes("clear"))
    return <Sun className="size-5" />;
  return <CloudSun className="size-5" />;
}

function formatCondition(c: string | null) {
  if (!c) return "Unavailable";
  return c
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/^\w/, (s) => s.toUpperCase());
}

export function WeatherStrip({ weather }: { weather: Weather | null }) {
  if (!weather) {
    return (
      <div className="rounded-xl bg-stone-900/85 px-4 py-3 text-sm text-stone-300 backdrop-blur">
        Weather unavailable
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-stone-900/85 px-4 py-3 text-stone-100 backdrop-blur">
      <div className="flex items-center gap-2">
        <WeatherIcon condition={weather.condition} />
        <span className="font-semibold">
          {formatCondition(weather.condition)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <Thermometer className="size-4 opacity-70" />
        {weather.temperatureC != null
          ? `${Math.round(weather.temperatureC)}°C`
          : "—°C"}
      </div>
      {weather.forecast && weather.forecast.length > 0 ? (
        <div className="ml-auto flex gap-2 overflow-x-auto">
          {weather.forecast.slice(0, 5).map((day) => (
            <div
              key={day.day}
              className="min-w-[4.5rem] rounded-lg bg-stone-800/80 px-2 py-1.5 text-center text-xs"
            >
              <div className="font-medium text-stone-300">{day.day}</div>
              <div className="mt-0.5 truncate text-stone-400">
                {formatCondition(day.condition)}
              </div>
              <div className="mt-0.5 text-stone-200">
                {day.tempMinC != null && day.tempMaxC != null
                  ? `${Math.round(day.tempMinC)}–${Math.round(day.tempMaxC)}°`
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <span className="ml-auto text-xs text-stone-400">
          Forecast unsupported
        </span>
      )}
    </div>
  );
}
