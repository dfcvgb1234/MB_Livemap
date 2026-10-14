"use client";

import type { Weather, WeatherPoint } from "@/lib/types";

const WEATHER_LABELS: Record<string, string> = {
  sun: "Sunny",
  sunny: "Sunny",
  clear: "Clear",
  cloudy: "Cloudy",
  partlycloudy: "Partly cloudy",
  partiallycloudy: "Partly cloudy",
  overcast: "Overcast",
  rain: "Rain",
  rainy: "Rain",
  snow: "Snow",
  hail: "Hail",
  fog: "Fog",
  foggy: "Fog",
  thunder: "Thunder",
  storm: "Storm",
  stormy: "Storm",
  twister: "Twister",
};

function formatCondition(c: string | null) {
  if (!c) return "Unavailable";
  const key = c.toLowerCase().replace(/[^a-z]/g, "");
  if (WEATHER_LABELS[key]) return WEATHER_LABELS[key];
  return c
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^\w/, (s) => s.toUpperCase());
}

function weatherTone(type: string | null) {
  const key = (type ?? "").toUpperCase();
  if (key === "SUN") return "#e2b657";
  if (key === "RAIN" || key === "THUNDER" || key === "HAIL" || key === "STORM") return "#6ea8d9";
  if (key === "SNOW") return "#d5e4ef";
  if (key === "TWISTER") return "#c9d6ff";
  return "#b7b1a4";
}

function temperatureLabel(entry: WeatherPoint) {
  if (entry.temperatureC != null) return `${Math.round(entry.temperatureC)}°`;
  if (entry.lowTemperatureC != null && entry.highTemperatureC != null) {
    return `${Math.round(entry.lowTemperatureC)}–${Math.round(entry.highTemperatureC)}°`;
  }
  return "—";
}

function ForecastCard({ entry }: { entry: WeatherPoint }) {
  return (
    <div className="rounded-[10px] bg-white/[0.04] px-2 py-2">
      <span className="block text-xs text-[#b7b1a4]">{entry.label}</span>
      <strong className="block" style={{ color: weatherTone(entry.type) }}>
        {temperatureLabel(entry)}
      </strong>
      <span className="block text-xs text-[#b7b1a4]">{formatCondition(entry.type)}</span>
    </div>
  );
}

export function WeatherStrip({ weather }: { weather: Weather | null }) {
  const hourly = weather?.hourly ?? [];
  const daily = weather?.daily ?? [];
  const now = hourly[0];
  const wind =
    now?.windVelocity == null ? null : (
      <span className="block text-xs text-[#b7b1a4]">
        <span
          className="mr-1 inline-block h-0 w-0 border-x-4 border-x-transparent border-b-[10px] border-b-[#e2b657]"
          style={{ transform: `rotate(${now.windRotation ?? 0}rad)`, transformOrigin: "center 8px" }}
        />
        {now.windVelocity} bft
      </span>
    );

  return (
    <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
      <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">Weather</h2>
      {!now && weather?.temperatureC == null ? (
        <p className="mt-2.5 text-[#b7b1a4]">No forecast yet</p>
      ) : (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div>
            <span className="block text-[13px] text-[#b7b1a4]">{now?.label ?? "Now"}</span>
            <strong className="block text-[28px] leading-none">
              {now?.temperatureC != null
                ? `${Math.round(now.temperatureC)}°`
                : weather?.temperatureC != null
                  ? `${Math.round(weather.temperatureC)}°`
                  : "—"}
            </strong>
          </div>
          <div className="text-right">
            <span style={{ color: weatherTone(now?.type ?? weather?.condition ?? null) }}>
              {formatCondition(now?.type ?? weather?.condition ?? null)}
            </span>
            {wind}
          </div>
        </div>
      )}
      {hourly.length > 1 ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {hourly.slice(1).map((entry, index) => (
            <ForecastCard key={`${entry.label}-${index}`} entry={entry} />
          ))}
        </div>
      ) : null}
      <h3 className="mt-3.5 text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">
        Coming days
      </h3>
      {daily.length > 0 ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {daily.map((entry, index) => (
            <ForecastCard key={`${entry.label}-${index}`} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#b7b1a4]">Daily forecast unavailable</p>
      )}
    </section>
  );
}
