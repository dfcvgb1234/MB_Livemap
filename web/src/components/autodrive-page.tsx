"use client";

import { useEffect, useRef, useState } from "react";
import { Livemap, MapSlot } from "@/components/livemap";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { CourseplayCard } from "@/components/courseplay-card";
import { ConnectionBanner } from "@/components/connection-banner";
import { useLivemapContext } from "@/components/livemap-provider";
import { courseLanes, defaultCourseLane } from "@/lib/course-lanes";
import type { CourseplayStart, Vehicle } from "@/lib/types";

export function AutoDrivePage() {
  const { state, autoDrive, courseplay, connection, bridgeStatus, error, sendCommand, lastResult } =
    useLivemapContext();
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [courseId, setCourseId] = useState("");
  const [lane, setLane] = useState(0);
  const [startAt, setStartAt] = useState<CourseplayStart>("first");
  const [linkedVehicleId, setLinkedVehicleId] = useState<string | null>(null);
  const appliedVehicle = useRef<string | null>(null);

  const liveSelected =
    selected == null
      ? null
      : (state?.vehicles.find((vehicle) => vehicle.id === selected.id) ?? selected);

  useEffect(() => {
    const vehicle = new URLSearchParams(window.location.search).get("vehicle");
    setLinkedVehicleId(vehicle && vehicle.length > 0 ? vehicle : null);
  }, []);

  useEffect(() => {
    if (!linkedVehicleId || appliedVehicle.current === linkedVehicleId || !state) return;
    const vehicle = state.vehicles.find((item) => item.id === linkedVehicleId);
    if (!vehicle) return;
    setSelected(vehicle);
    appliedVehicle.current = linkedVehicleId;
  }, [linkedVehicleId, state]);

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
        selectedId={liveSelected?.id}
        onSelect={setSelected}
      >
        <Livemap
          state={state}
          autoDrive={autoDrive}
          selectedId={liveSelected?.id}
          onSelectVehicle={setSelected}
        />
      </MapSlot>
      <aside className="min-h-0 overflow-visible border-t border-white/10 bg-[#221e18] p-3.5 min-[1536px]:overflow-auto min-[1536px]:border-t-0 min-[1536px]:border-l">
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
        <CourseplayCard
          available={courseplayReady}
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
        />
        <VehicleSheet
          embedded
          mode="autodrive"
          markers={autoDrive?.markers ?? []}
          courseplayAvailable={networkReady && courseplayReady}
          courseId={courseId}
          cpLane={lanes.length > 0 ? activeLane : undefined}
          cpStart={startAt}
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
