"use client";

import { useEffect, useState } from "react";
import type { AutoDriveMode, CommandResult, CourseplayCourse, CourseplayStart, Vehicle, WhitelistAction } from "@/lib/types";
import { courseLanes, type CourseLane } from "@/lib/course-lanes";
import { Button } from "@/components/ui/button";

const SELECT_CLASS = "mt-1 min-h-12 w-full rounded-lg border border-white/15 bg-[#17140f] px-3 text-sm text-[#f3efe4]";

type Props = {
  available: boolean;
  /** Both mods are loaded, so a vehicle can drive to the course and then start it. */
  autoDriveAvailable?: boolean;
  courses: CourseplayCourse[];
  vehicle: Vehicle | null;
  courseId: string;
  lane: number;
  startAt: CourseplayStart;
  onCourseId: (id: string) => void;
  onLane: (lane: number) => void;
  onStartAt: (startAt: CourseplayStart) => void;
  onCommand: (
    action: WhitelistAction,
    vehicleId: string,
    targetId?: string,
    extra?: { mode?: AutoDriveMode; cpStart?: CourseplayStart; cpLane?: number },
  ) => string;
  lastResult: CommandResult | null;
};

export function CourseplayCard({
  available,
  autoDriveAvailable = false,
  courses,
  vehicle,
  courseId,
  lane,
  startAt,
  onCourseId,
  onLane,
  onStartAt,
  onCommand,
  lastResult,
}: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selected = courses.find((course) => course.id === courseId) ?? null;
  const lanes: CourseLane[] = courseLanes(selected?.vehicles);
  const canUseVehicle = vehicle != null && vehicle.category !== "implement" && vehicle.category !== "trailer";
  const ready = available && canUseVehicle && vehicle.cpCapable === true && selected != null;

  useEffect(() => {
    if (!lastResult || !pendingId || lastResult.id !== pendingId) return;
    setPendingId(null);
    setFeedback(lastResult.ok ? "Command OK — state will refresh from the bridge" : lastResult.error ?? "Command failed");
  }, [lastResult, pendingId]);

  const run = (action: "courseplay.start" | "courseplay.stop") => {
    if (!vehicle) return;
    if (action === "courseplay.start" && selected == null) return;
    setFeedback(action === "courseplay.start" ? "Starting Courseplay…" : "Stopping Courseplay…");
    setPendingId(
      onCommand(action, vehicle.id, selected?.id, {
        cpStart: action === "courseplay.start" ? startAt : undefined,
        cpLane: action === "courseplay.start" && lanes.length > 0 ? lane : undefined,
      }),
    );
  };

  const driveToCourse = () => {
    if (!vehicle || selected == null) return;
    setFeedback("Driving to the course…");
    setPendingId(
      onCommand("autodrive.start", vehicle.id, selected.id, {
        mode: "fieldwork",
        cpStart: startAt,
        cpLane: lanes.length > 0 ? lane : undefined,
      }),
    );
  };

  return (
    <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5">
      <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">Courseplay</h2>
      <p className="mt-1 text-[13px] text-[#b7b1a4]">
        {available
          ? `${courses.length} saved ${courses.length === 1 ? "course" : "courses"}`
          : "Courseplay is not available. Load a save with Courseplay running."}
      </p>
      {vehicle?.cpActive ? (
        <p className="mt-2 text-[13px] text-[#f3efe4]">Running {vehicle.cpCourse ?? "a course"}</p>
      ) : null}
      {available ? (
        <>
          <label className="mt-3 block text-[13px] text-[#b7b1a4]" htmlFor="cp-course">
            Course
          </label>
          <select
            id="cp-course"
            className={SELECT_CLASS}
            value={courseId}
            onChange={(event) => onCourseId(event.target.value)}
          >
            <option value="">Choose a course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.folder} / {course.name}
              </option>
            ))}
          </select>
          {courses.length === 0 ? (
            <p className="mt-2 text-[13px] text-[#b7b1a4]">No saved courses for this map.</p>
          ) : null}
          {selected != null ? (
            <>
              <label className="mt-3 block text-[13px] text-[#b7b1a4]" htmlFor="cp-start">
                Start at
              </label>
              <select
                id="cp-start"
                className={SELECT_CLASS}
                value={startAt}
                onChange={(event) => onStartAt(event.target.value as CourseplayStart)}
              >
                <option value="first">First waypoint</option>
                <option value="nearest">Nearest waypoint</option>
                <option value="last">Last waypoint</option>
              </select>
            </>
          ) : null}
          {lanes.length > 0 ? (
            <>
              <label className="mt-3 block text-[13px] text-[#b7b1a4]" htmlFor="cp-lane">
                Row
              </label>
              <select
                id="cp-lane"
                className={SELECT_CLASS}
                value={String(lane)}
                onChange={(event) => onLane(Number(event.target.value))}
              >
                {lanes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {vehicle == null ? (
            <p className="mt-2 text-[13px] text-[#f3efe4]">Select a vehicle on the map, then choose a course.</p>
          ) : vehicle.cpCapable !== true && canUseVehicle ? (
            <p className="mt-2 text-[13px] text-[#b7b1a4]">This vehicle does not support Courseplay.</p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="min-h-12 bg-[#e2b657] text-[#2a2112] hover:bg-[#ebc56f]"
              disabled={!!pendingId || !ready || vehicle?.cpActive === true || vehicle?.adActive === true}
              onClick={() => run("courseplay.start")}
            >
              Start Courseplay
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="min-h-12 bg-white/10 text-[#f3efe4] hover:bg-white/15"
              disabled={!!pendingId || vehicle?.cpActive !== true}
              onClick={() => run("courseplay.stop")}
            >
              Stop Courseplay
            </Button>
            {autoDriveAvailable ? (
              <Button
                size="lg"
                className="col-span-2 min-h-12 bg-[#e2b657] text-[#2a2112] hover:bg-[#ebc56f]"
                disabled={
                  !!pendingId ||
                  !ready ||
                  vehicle?.adCapable !== true ||
                  vehicle?.cpActive === true ||
                  vehicle?.adActive === true
                }
                onClick={driveToCourse}
              >
                Drive to course & Start
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {feedback ? (
        <div
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
            feedback.toLowerCase().includes("fail") ||
            feedback.toLowerCase().includes("unsupport") ||
            feedback.toLowerCase().includes("error") ||
            feedback.toLowerCase().includes("unknown") ||
            feedback.toLowerCase().includes("not ")
              ? "bg-[#e07a6a]/20 text-[#ffd2cb]"
              : pendingId
                ? "bg-white/[0.08] text-[#f3efe4]"
                : "bg-[#8fb56a]/20 text-[#d7ecc4]"
          }`}
        >
          {feedback}
        </div>
      ) : null}
    </section>
  );
}
