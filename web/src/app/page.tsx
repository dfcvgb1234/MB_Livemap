"use client";

import { useEffect, useRef, useState } from "react";
import { Livemap, MapSlot } from "@/components/livemap";
import { WeatherStrip } from "@/components/weather-strip";
import { CropCalendar } from "@/components/crop-calendar";
import { AnimalCards, ProductionCards } from "@/components/farm-cards";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { PlayerSheet } from "@/components/player-sheet";
import { FieldSheet } from "@/components/field-sheet";
import { ConnectionBanner } from "@/components/connection-banner";
import { useLivemapContext } from "@/components/livemap-provider";
import { driverPageLabel } from "@/lib/driver-page";
import { vehicleAllowsCommands, type Vehicle } from "@/lib/types";

export default function HomePage() {
  const { state, autoDrive, courseplay, connection, bridgeStatus, error, sendCommand, lastResult, focus } =
    useLivemapContext();
  const driverLabel = driverPageLabel(autoDrive?.available === true, courseplay?.available === true);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!focus) return;
    const vehicle = stateRef.current?.vehicles.find((item) => item.id === focus.id);
    if (vehicle) {
      setSelected(vehicle);
      setSelectedPlayerId(null);
      setSelectedFieldId(null);
    }
  }, [focus]);

  const liveSelected =
    selected == null
      ? null
      : (state?.vehicles.find((vehicle) => vehicle.id === selected.id) ?? selected);
  const livePlayer =
    selectedPlayerId == null
      ? null
      : (state?.players?.find((player) => player.id === selectedPlayerId) ?? null);
  const liveFarm =
    livePlayer?.farmId == null
      ? null
      : (state?.farms?.find((farm) => farm.id === livePlayer.farmId) ?? null);
  const liveField =
    selectedFieldId == null ? null : (state?.fields.find((field) => field.id === selectedFieldId) ?? null);

  return (
    <div className="grid min-h-full grid-cols-1 min-[1536px]:h-full min-[1536px]:min-h-0 min-[1536px]:grid-cols-[minmax(0,1fr)_minmax(520px,38vw)] min-[1536px]:overflow-hidden">
      <MapSlot
        vehicles={state?.vehicles ?? []}
        players={state?.multiplayer === true ? (state.players ?? []) : []}
        farms={state?.farms ?? []}
        selectedId={liveSelected?.id}
        selectedPlayerId={livePlayer?.id}
        onSelect={(vehicle) => {
          setSelected(vehicle);
          setSelectedPlayerId(null);
          setSelectedFieldId(null);
        }}
        onSelectPlayer={
          state?.multiplayer === true
            ? (player) => {
                setSelected(null);
                setSelectedPlayerId(player.id);
                setSelectedFieldId(null);
              }
            : undefined
        }
        showFarm={state?.multiplayer === true && (state.farms?.length ?? 0) > 1}
      >
        <Livemap
          state={state}
          selectedId={liveSelected?.id}
          selectedPlayerId={livePlayer?.id}
          selectedFieldId={liveField?.id}
          onSelectVehicle={(vehicle) => {
            setSelected(vehicle);
            setSelectedPlayerId(null);
            setSelectedFieldId(null);
          }}
          onSelectPlayer={(player) => {
            setSelected(null);
            setSelectedPlayerId(player.id);
            setSelectedFieldId(null);
          }}
          onSelectField={(field) => {
            setSelected(null);
            setSelectedPlayerId(null);
            setSelectedFieldId(field.id);
          }}
        />
      </MapSlot>
      <aside className="min-h-0 overflow-visible border-t border-white/10 bg-[#221e18] p-3.5 min-[1536px]:overflow-auto min-[1536px]:border-t-0 min-[1536px]:border-l">
        <ConnectionBanner connection={connection} bridgeStatus={bridgeStatus} error={error} />
        <FieldSheet field={liveField} />
        <PlayerSheet player={livePlayer} farm={liveFarm} />
        <VehicleSheet
          embedded
          driverLabel={driverLabel}
          vehicle={liveSelected}
          open={false}
          onOpenChange={() => {}}
          onCommand={sendCommand}
          lastResult={lastResult}
          allowCommands={vehicleAllowsCommands(state, liveSelected)}
        />
        <WeatherStrip weather={state?.weather ?? null} />
        <CropCalendar fields={state?.fields ?? []} calendar={state?.calendar ?? null} />
        <ProductionCards productions={state?.productions ?? []} />
        <AnimalCards animals={state?.animals ?? []} />
      </aside>
    </div>
  );
}
