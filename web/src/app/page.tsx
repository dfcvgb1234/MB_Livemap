"use client";

import { useEffect, useRef, useState } from "react";
import { Livemap, MapSlot } from "@/components/livemap";
import { WeatherStrip } from "@/components/weather-strip";
import { CropCalendar } from "@/components/crop-calendar";
import { AnimalCards, ProductionCards } from "@/components/farm-cards";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { PlayerSheet } from "@/components/player-sheet";
import { FieldSheet, fieldFromClick, useFieldClickSample } from "@/components/field-sheet";
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
  const clickSample = useFieldClickSample(sendCommand, lastResult, connection === "connected");
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!focus) return;
    const vehicle = stateRef.current?.vehicles.find((item) => item.id === focus.id);
    if (vehicle) {
      setSelected(vehicle);
      setSelectedPlayerId(null);
      clickSample.clear();
    }
  }, [focus, clickSample.clear]);

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
    clickSample.fieldId == null
      ? null
      : (state?.fields.find((field) => field.id === clickSample.fieldId) ?? null);
  const shownField = liveField == null ? null : fieldFromClick(liveField, clickSample.sample);

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
          clickSample.clear();
        }}
        onSelectPlayer={
          state?.multiplayer === true
            ? (player) => {
                setSelected(null);
                setSelectedPlayerId(player.id);
                clickSample.clear();
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
            clickSample.clear();
          }}
          onSelectPlayer={(player) => {
            setSelected(null);
            setSelectedPlayerId(player.id);
            clickSample.clear();
          }}
          onSelectField={(field, point) => {
            setSelected(null);
            setSelectedPlayerId(null);
            clickSample.select(field, point);
          }}
          onScan={(x, z) =>
            connection === "connected" ? sendCommand("field.scan", "", undefined, { x, z }) : ""
          }
          scanResult={lastResult}
        />
      </MapSlot>
      <aside className="min-h-0 overflow-visible border-t border-white/10 bg-[#221e18] p-3.5 min-[1536px]:overflow-auto min-[1536px]:border-t-0 min-[1536px]:border-l">
        <ConnectionBanner connection={connection} bridgeStatus={bridgeStatus} error={error} />
        <FieldSheet field={shownField} sampling={clickSample.pending} />
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
