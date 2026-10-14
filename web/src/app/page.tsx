"use client";

import { useState } from "react";
import { Livemap } from "@/components/livemap";
import { WeatherStrip } from "@/components/weather-strip";
import { CropCalendar } from "@/components/crop-calendar";
import { AnimalCards, ProductionCards } from "@/components/farm-cards";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { ConnectionBanner } from "@/components/connection-banner";
import { useLivemapContext } from "@/components/livemap-provider";
import type { Vehicle } from "@/lib/types";

export default function HomePage() {
  const { state, connection, bridgeStatus, error, sendCommand, lastResult } = useLivemapContext();
  const [selected, setSelected] = useState<Vehicle | null>(null);

  const liveSelected =
    selected == null
      ? null
      : (state?.vehicles.find((vehicle) => vehicle.id === selected.id) ?? selected);

  return (
    <div className="grid min-h-full grid-cols-1 min-[1200px]:h-full min-[1200px]:min-h-0 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(520px,38vw)] min-[1200px]:overflow-hidden">
      <section className="relative h-[68dvh] min-w-0 bg-[#100e0b] min-[1200px]:h-full">
        <Livemap
          state={state}
          selectedId={liveSelected?.id}
          onSelectVehicle={setSelected}
        />
      </section>
      <aside className="min-h-0 overflow-visible border-t border-white/10 bg-[#221e18] p-3.5 min-[1200px]:overflow-auto min-[1200px]:border-t-0 min-[1200px]:border-l">
        <ConnectionBanner connection={connection} bridgeStatus={bridgeStatus} error={error} />
        <VehicleSheet
          embedded
          vehicle={liveSelected}
          open={false}
          onOpenChange={() => {}}
          onCommand={sendCommand}
          lastResult={lastResult}
        />
        <WeatherStrip weather={state?.weather ?? null} />
        <CropCalendar fields={state?.fields ?? []} />
        <ProductionCards productions={state?.productions ?? []} />
        <AnimalCards animals={state?.animals ?? []} />
      </aside>
    </div>
  );
}
