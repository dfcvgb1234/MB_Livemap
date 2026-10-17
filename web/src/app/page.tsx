"use client";

import { useEffect, useRef, useState } from "react";
import { Livemap, MapSlot } from "@/components/livemap";
import { WeatherStrip } from "@/components/weather-strip";
import { CropCalendar } from "@/components/crop-calendar";
import { AnimalCards, ProductionCards } from "@/components/farm-cards";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { ConnectionBanner } from "@/components/connection-banner";
import { useLivemapContext } from "@/components/livemap-provider";
import { driverPageLabel } from "@/lib/driver-page";
import type { Vehicle } from "@/lib/types";

export default function HomePage() {
  const { state, autoDrive, courseplay, connection, bridgeStatus, error, sendCommand, lastResult, focus } =
    useLivemapContext();
  const driverLabel = driverPageLabel(autoDrive?.available === true, courseplay?.available === true);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!focus) return;
    const vehicle = stateRef.current?.vehicles.find((item) => item.id === focus.id);
    if (vehicle) setSelected(vehicle);
  }, [focus]);

  const liveSelected =
    selected == null
      ? null
      : (state?.vehicles.find((vehicle) => vehicle.id === selected.id) ?? selected);

  return (
    <div className="grid min-h-full grid-cols-1 min-[1536px]:h-full min-[1536px]:min-h-0 min-[1536px]:grid-cols-[minmax(0,1fr)_minmax(520px,38vw)] min-[1536px]:overflow-hidden">
      <MapSlot
        vehicles={state?.vehicles ?? []}
        selectedId={liveSelected?.id}
        onSelect={setSelected}
      >
        <Livemap
          state={state}
          selectedId={liveSelected?.id}
          onSelectVehicle={setSelected}
        />
      </MapSlot>
      <aside className="min-h-0 overflow-visible border-t border-white/10 bg-[#221e18] p-3.5 min-[1536px]:overflow-auto min-[1536px]:border-t-0 min-[1536px]:border-l">
        <ConnectionBanner connection={connection} bridgeStatus={bridgeStatus} error={error} />
        <VehicleSheet
          embedded
          driverLabel={driverLabel}
          vehicle={liveSelected}
          open={false}
          onOpenChange={() => {}}
          onCommand={sendCommand}
          lastResult={lastResult}
        />
        <WeatherStrip weather={state?.weather ?? null} />
        <CropCalendar fields={state?.fields ?? []} calendar={state?.calendar ?? null} />
        <ProductionCards productions={state?.productions ?? []} />
        <AnimalCards animals={state?.animals ?? []} />
      </aside>
    </div>
  );
}
