"use client";

import { useMemo, useState } from "react";
import type { Field, GameState, Vehicle } from "@/lib/types";
import { fruitColor } from "@/lib/crop-calendar";
import { cn } from "@/lib/utils";

type Props = {
  state: GameState | null;
  onSelectVehicle: (vehicle: Vehicle) => void;
  selectedId?: string | null;
};

function worldToPct(
  x: number,
  z: number,
  mapSize: number,
): { left: string; top: string } {
  const left = (x / mapSize) * 100;
  const top = (z / mapSize) * 100;
  return {
    left: `${Math.min(100, Math.max(0, left))}%`,
    top: `${Math.min(100, Math.max(0, top))}%`,
  };
}

function FieldMarker({
  field,
  mapSize,
}: {
  field: Field;
  mapSize: number;
}) {
  if (field.x == null || field.z == null) return null;
  const pos = worldToPct(field.x, field.z, mapSize);
  return (
    <div
      className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-sm opacity-70"
      style={{
        left: pos.left,
        top: pos.top,
        background: fruitColor(field.fruitType),
      }}
      title={`Field ${field.id}`}
    />
  );
}

function FieldPolygon({
  field,
  mapSize,
}: {
  field: Field;
  mapSize: number;
}) {
  if (!field.polygon || field.polygon.length < 3) return null;
  const points = field.polygon
    .map((p) => `${(p.x / mapSize) * 100},${(p.z / mapSize) * 100}`)
    .join(" ");
  return (
    <polygon
      points={points}
      fill={fruitColor(field.fruitType)}
      fillOpacity={0.45}
      stroke={fruitColor(field.fruitType)}
      strokeOpacity={0.85}
      strokeWidth={0.3}
    />
  );
}

export function Livemap({ state, onSelectVehicle, selectedId }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const mapSize = state?.mapSize && state.mapSize > 0 ? state.mapSize : 2048;
  const vehicles = state?.vehicles ?? [];
  const fields = state?.fields ?? [];

  const hasPolygons = useMemo(
    () => fields.some((f) => f.polygon && f.polygon.length >= 3),
    [fields],
  );

  if (!state) {
    return (
      <div className="relative flex min-h-[min(70vh,640px)] w-full items-center justify-center overflow-hidden rounded-none bg-[radial-gradient(ellipse_at_center,_#3d5c3a_0%,_#1e2e1c_55%,_#121a12_100%)]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative z-10 max-w-sm px-6 text-center">
          <p className="text-lg font-semibold text-stone-100">Waiting for map data</p>
          <p className="mt-2 text-sm text-stone-300">
            Connect the bridge with mock mode or load FS25 with the livemap mod.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[min(70vh,640px)] w-full overflow-hidden bg-[#1a2618]">
      {/* Atmospheric map plane */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, #4a6b3e 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, #2f4a38 0%, transparent 45%), linear-gradient(160deg, #243222 0%, #1a2618 40%, #152018 100%)",
        }}
      />
      <div className="absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:64px_64px]" />

      {/* Drop-in map overlay image support */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40 mix-blend-soft-light"
        style={{ backgroundImage: "url(/map-overlay.png)" }}
        aria-hidden
      />

      {hasPolygons ? (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {fields.map((f) => (
            <FieldPolygon key={f.id} field={f} mapSize={mapSize} />
          ))}
        </svg>
      ) : (
        fields.map((f) => (
          <FieldMarker key={f.id} field={f} mapSize={mapSize} />
        ))
      )}

      {vehicles.map((v) => {
        const pos = worldToPct(v.x, v.z, mapSize);
        const deg = (v.heading * 180) / Math.PI;
        const active = selectedId === v.id || hovered === v.id;
        return (
          <button
            key={v.id}
            type="button"
            className={cn(
              "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 touch-manipulation flex-col items-center",
              "min-h-11 min-w-11",
            )}
            style={{ left: pos.left, top: pos.top }}
            onClick={() => onSelectVehicle(v)}
            onMouseEnter={() => setHovered(v.id)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`${v.name}, ${v.engineOn ? "engine on" : "engine off"}`}
          >
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-full shadow-lg transition-transform",
                v.engineOn ? "bg-lime-500 text-stone-950" : "bg-stone-700 text-stone-100",
                active && "scale-110 ring-2 ring-white",
              )}
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 3 L18 19 L12 15 L6 19 Z"
                />
              </svg>
            </span>
            <span
              className={cn(
                "mt-1 max-w-[7rem] truncate rounded bg-stone-950/75 px-1.5 py-0.5 text-[11px] font-medium text-stone-100",
                !active && "opacity-80",
              )}
            >
              {v.name}
            </span>
          </button>
        );
      })}

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg bg-stone-950/70 px-3 py-2 text-xs text-stone-200 backdrop-blur">
        <div className="font-semibold">
          {state.mapName ?? "Unknown map"}
        </div>
        <div className="text-stone-400">
          {vehicles.length} vehicles · {fields.length} fields ·{" "}
          {state.source === "mock" ? "mock" : "mod"}
        </div>
      </div>

      {/* Drop-in hint */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 max-w-[14rem] rounded-lg bg-stone-950/60 px-2 py-1.5 text-[10px] text-stone-400 backdrop-blur">
        Optional: place map PNG at <code className="text-stone-300">web/public/map-overlay.png</code>
      </div>
    </div>
  );
}
