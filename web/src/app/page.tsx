"use client";

import { useState } from "react";
import { Livemap } from "@/components/livemap";
import { WeatherStrip } from "@/components/weather-strip";
import { CropCalendar } from "@/components/crop-calendar";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { useLivemapContext } from "@/components/livemap-provider";
import type { Vehicle } from "@/lib/types";

export default function HomePage() {
  const { state, connection, sendCommand, lastResult } = useLivemapContext();
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loading = connection === "connecting" && !state;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <section className="relative overflow-hidden sm:rounded-2xl sm:shadow-lg">
        {loading ? (
          <div className="flex min-h-[min(70vh,640px)] items-center justify-center bg-[#1a2618] text-stone-200">
            <div className="text-center">
              <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-lime-500 border-t-transparent" />
              <p className="font-medium">Loading livemap…</p>
            </div>
          </div>
        ) : (
          <Livemap
            state={state}
            selectedId={selected?.id}
            onSelectVehicle={(v) => {
              setSelected(v);
              // Defer open so the same pointer event cannot dismiss the sheet.
              requestAnimationFrame(() => setSheetOpen(true));
            }}
          />
        )}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 sm:left-4 sm:right-auto sm:w-[min(100%,28rem)]">
          <div className="pointer-events-auto">
            <WeatherStrip weather={state?.weather ?? null} />
          </div>
        </div>
      </section>

      <div className="px-4 sm:px-0">
        <CropCalendar fields={state?.fields ?? []} />
      </div>

      <VehicleSheet
        vehicle={selected}
        open={sheetOpen}
        onOpenChange={(next) => setSheetOpen(next)}
        onCommand={sendCommand}
        lastResult={lastResult}
      />
    </div>
  );
}
