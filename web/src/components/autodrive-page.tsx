"use client";

import { useEffect, useRef, useState } from "react";
import { Livemap } from "@/components/livemap";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { ConnectionBanner } from "@/components/connection-banner";
import { useLivemapContext } from "@/components/livemap-provider";
import type { Vehicle } from "@/lib/types";

export function AutoDrivePage({ initialVehicleId }: { initialVehicleId: string | null }) {
  const { state, autoDrive, connection, bridgeStatus, error, sendCommand, lastResult } =
    useLivemapContext();
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const appliedVehicle = useRef<string | null>(null);

  const liveSelected =
    selected == null
      ? null
      : (state?.vehicles.find((vehicle) => vehicle.id === selected.id) ?? selected);

  useEffect(() => {
    if (!initialVehicleId || appliedVehicle.current === initialVehicleId || !state) return;
    const vehicle = state.vehicles.find((item) => item.id === initialVehicleId);
    if (!vehicle) return;
    setSelected(vehicle);
    appliedVehicle.current = initialVehicleId;
  }, [initialVehicleId, state]);

  const networkReady = autoDrive?.available === true;
  const markerCount = autoDrive?.markers?.length ?? 0;
  const waypointCount = autoDrive?.waypoints?.length ?? 0;

  return (
    <div className="grid min-h-full grid-cols-1 min-[1200px]:h-full min-[1200px]:min-h-0 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(520px,38vw)] min-[1200px]:overflow-hidden">
      <section className="relative h-[68dvh] min-w-0 bg-[#100e0b] min-[1200px]:h-full">
        <Livemap
          state={state}
          autoDrive={autoDrive}
          selectedId={liveSelected?.id}
          onSelectVehicle={setSelected}
        />
      </section>
      <aside className="min-h-0 overflow-visible border-t border-white/10 bg-[#221e18] p-3.5 min-[1200px]:overflow-auto min-[1200px]:border-t-0 min-[1200px]:border-l">
        <ConnectionBanner connection={connection} bridgeStatus={bridgeStatus} error={error} />
        <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5">
          <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">AutoDrive</h2>
          <p className="mt-1 text-[13px] text-[#b7b1a4]">
            {networkReady
              ? `${waypointCount} waypoints · ${markerCount} destinations`
              : "AutoDrive network is not available. Load a save with AutoDrive running."}
          </p>
          {liveSelected == null ? (
            <p className="mt-2 text-[13px] text-[#f3efe4]">
              Select a vehicle on the map, then choose a destination.
            </p>
          ) : null}
        </section>
        <VehicleSheet
          embedded
          mode="autodrive"
          markers={autoDrive?.markers ?? []}
          vehicle={liveSelected}
          open={false}
          onOpenChange={() => {}}
          onCommand={sendCommand}
          lastResult={lastResult}
        />
      </aside>
    </div>
  );
}
