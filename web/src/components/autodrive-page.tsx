"use client";

import { useEffect, useRef, useState } from "react";
import { Livemap, MapSlot } from "@/components/livemap";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { PlayerSheet } from "@/components/player-sheet";
import { FieldSheet, fieldFromClick, useFieldClickSample } from "@/components/field-sheet";
import { CourseplayCard } from "@/components/courseplay-card";
import { ConnectionBanner } from "@/components/connection-banner";
import { useLivemapContext } from "@/components/livemap-provider";
import { courseLanes, defaultCourseLane } from "@/lib/course-lanes";
import { vehicleAllowsCommands, type CourseplayStart, type Vehicle } from "@/lib/types";

export function AutoDrivePage() {
  const { state, autoDrive, courseplay, connection, bridgeStatus, error, sendCommand, lastResult } =
    useLivemapContext();
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const clickSample = useFieldClickSample(sendCommand, lastResult, connection === "connected");
  const [courseId, setCourseId] = useState("");
  const [lane, setLane] = useState(0);
  const [startAt, setStartAt] = useState<CourseplayStart>("first");
  const [linkedVehicleId, setLinkedVehicleId] = useState<string | null>(null);
  const appliedVehicle = useRef<string | null>(null);

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

  useEffect(() => {
    const vehicle = new URLSearchParams(window.location.search).get("vehicle");
    setLinkedVehicleId(vehicle && vehicle.length > 0 ? vehicle : null);
  }, []);

  useEffect(() => {
    if (!linkedVehicleId || appliedVehicle.current === linkedVehicleId || !state) return;
    const vehicle = state.vehicles.find((item) => item.id === linkedVehicleId);
    if (!vehicle) return;
    setSelected(vehicle);
    setSelectedPlayerId(null);
    clickSample.clear();
    appliedVehicle.current = linkedVehicleId;
  }, [linkedVehicleId, state, clickSample.clear]);

  const networkReady = autoDrive?.available === true;
  const markerCount = autoDrive?.markers?.length ?? 0;
  const waypointCount = autoDrive?.waypoints?.length ?? 0;
  const courses = courseplay?.courses ?? [];
  const courseplayReady = courseplay?.available === true;
  const courseKey = courses.map((course) => course.id).join("\n");
  const selectedCourse = courses.find((course) => course.id === courseId) ?? null;
  const lanes = courseLanes(selectedCourse?.vehicles);
  const laneKey = lanes.map((item) => item.value).join(",");
  const activeLane = lanes.some((item) => item.value === lane) ? lane : defaultCourseLane(lanes);

  useEffect(() => {
    if (courseId === "" || courseKey.split("\n").includes(courseId)) return;
    setCourseId("");
  }, [courseId, courseKey]);

  useEffect(() => {
    if (laneKey === "") return;
    const values = laneKey.split(",").map(Number);
    setLane((current) =>
      values.includes(current) ? current : defaultCourseLane(values.map((value) => ({ value, label: "" }))),
    );
  }, [laneKey]);

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
          autoDrive={networkReady ? autoDrive : null}
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
        {networkReady ? (
          <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5">
            <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">AutoDrive</h2>
            <p className="mt-1 text-[13px] text-[#b7b1a4]">
              {waypointCount} waypoints · {markerCount} destinations
            </p>
            {liveSelected == null ? (
              <p className="mt-2 text-[13px] text-[#f3efe4]">
                Select a vehicle on the map, then choose a destination.
              </p>
            ) : null}
          </section>
        ) : null}
        <CourseplayCard
          available={courseplayReady}
          autoDriveAvailable={networkReady}
          courses={courses}
          vehicle={liveSelected}
          courseId={courseId}
          lane={activeLane}
          startAt={startAt}
          onCourseId={setCourseId}
          onLane={setLane}
          onStartAt={setStartAt}
          onCommand={sendCommand}
          lastResult={lastResult}
          allowCommands={vehicleAllowsCommands(state, liveSelected)}
        />
        <VehicleSheet
          embedded
          mode="autodrive"
          autoDriveAvailable={networkReady}
          markers={networkReady ? (autoDrive?.markers ?? []) : []}
          courseplayAvailable={networkReady && courseplayReady}
          courseId={courseId}
          cpLane={lanes.length > 0 ? activeLane : undefined}
          cpStart={startAt}
          vehicle={liveSelected}
          open={false}
          onOpenChange={() => {}}
          onCommand={sendCommand}
          lastResult={lastResult}
          allowCommands={vehicleAllowsCommands(state, liveSelected)}
        />
      </aside>
    </div>
  );
}
