"use client";

import type { Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  vehicles: Vehicle[];
  selectedId?: string | null;
  onSelect: (vehicle: Vehicle) => void;
};

export function VehicleRail({ vehicles, selectedId, onSelect }: Props) {
  if (vehicles.length === 0) {
    return (
      <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600 ring-1 ring-stone-200">
        No vehicles in the current snapshot.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-stone-800">Vehicles</h2>
        <p className="text-xs text-stone-500">Tap a vehicle for engine / attach controls</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {vehicles.map((v) => {
          const active = selectedId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v)}
              className={cn(
                "flex min-h-14 min-w-[10.5rem] shrink-0 touch-manipulation flex-col items-start justify-center rounded-xl px-4 py-2 text-left transition-colors",
                "ring-1 ring-stone-200",
                active
                  ? "bg-lime-600 text-stone-950 ring-lime-700"
                  : "bg-white text-stone-900 hover:bg-stone-50 active:bg-stone-100",
              )}
            >
              <span className="truncate text-sm font-semibold">{v.name}</span>
              <span
                className={cn(
                  "text-xs",
                  active ? "text-stone-900/80" : "text-stone-500",
                )}
              >
                {v.engineOn ? "Engine on" : "Engine off"} · {Math.round(v.speed)} km/h
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
