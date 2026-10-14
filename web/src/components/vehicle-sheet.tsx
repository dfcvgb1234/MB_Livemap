"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CROP_CALENDAR } from "@/lib/crop-calendar";
import type { AutoDriveMarker, AutoDriveMode, CommandResult, ProductionFill, Vehicle, WhitelistAction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

function formatAmount(value: number | null) {
  if (value == null) return "—";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString();
}

function tankRank(name: string) {
  const value = name.toLowerCase();
  if (/diesel|fuel|petrol|methane|electric/.test(value)) return 0;
  if (/def|adblue/.test(value)) return 1;
  return 2;
}

function TankList({ fills }: { fills: ProductionFill[] }) {
  const tanks = [...fills].sort((a, b) => tankRank(a.name) - tankRank(b.name) || a.name.localeCompare(b.name));
  if (tanks.length === 0) {
    return <p className="text-[13px] text-[#b7b1a4]">No tanks on this vehicle</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {tanks.map((fill, index) => {
        const percent =
          fill.fillLevel != null && fill.capacity != null && fill.capacity > 0
            ? Math.max(0, Math.min(100, (fill.fillLevel / fill.capacity) * 100))
            : 0;
        const amount =
          fill.capacity != null && fill.capacity > 0
            ? `${formatAmount(fill.fillLevel)} / ${formatAmount(fill.capacity)} L`
            : fill.fillLevel != null
              ? `${formatAmount(fill.fillLevel)} L`
              : "—";
        const fuel = tankRank(fill.name) < 2;
        return (
          <div key={`${fill.name}-${index}`}>
            <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
              <span>{fill.name}</span>
              <span className="text-[#b7b1a4]">{amount}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <i
                className={`block h-full ${fuel ? "bg-[#e2b657]" : "bg-[#8fb56a]"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const JOB_MODES: { id: AutoDriveMode; label: string }[] = [
  { id: "drive", label: "Drive" },
  { id: "pickup", label: "Pickup and Deliver" },
  { id: "deliver", label: "Deliver" },
  { id: "load", label: "Load" },
  { id: "unload", label: "Unload Combine" },
];

const SELECT_CLASS = "mt-1 min-h-12 w-full rounded-lg border border-white/15 bg-[#17140f] px-3 text-sm text-[#f3efe4]";

function autoDriveStatus(vehicle: Vehicle) {
  const first = vehicle.adDestination ?? "destination";
  const second = vehicle.adSecondDestination ?? "destination";
  if (vehicle.adMode === "pickup") return `Picking up at ${first}, delivering to ${second}`;
  if (vehicle.adMode === "deliver") return `Delivering to ${first}`;
  if (vehicle.adMode === "load") return `Loading at ${second}, then driving to ${first}`;
  if (vehicle.adMode === "unload") return `Unloading combine from ${first} to ${second}`;
  return `Driving to ${first}`;
}

function primaryLabel(mode: AutoDriveMode) {
  if (mode === "pickup") return "Pickup target";
  if (mode === "deliver") return "Deliver target";
  if (mode === "load" || mode === "unload") return "Start target";
  return "Destination";
}

function secondLabel(mode: AutoDriveMode) {
  if (mode === "pickup") return "Deliver target";
  if (mode === "load") return "Load target";
  return "Unload target";
}

function MarkerSelect({
  id,
  label,
  value,
  placeholder,
  markers,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  markers: AutoDriveMarker[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label className="mt-3 block text-[13px] text-[#b7b1a4]" htmlFor={id}>
        {label}
      </label>
      <select id={id} className={SELECT_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {markers.map((marker) => (
          <option key={marker.id} value={String(marker.id)}>
            {marker.name}
          </option>
        ))}
      </select>
    </>
  );
}

function AutoDriveControls({
  vehicle,
  destinations,
  jobMode,
  destinationId,
  secondId,
  fillId,
  pending,
  embedded,
  onJobMode,
  onDestination,
  onSecond,
  onFill,
  onStart,
  onStop,
}: {
  vehicle: Vehicle;
  destinations: AutoDriveMarker[];
  jobMode: AutoDriveMode;
  destinationId: string;
  secondId: string;
  fillId: string;
  pending: boolean;
  embedded: boolean;
  onJobMode: (mode: AutoDriveMode) => void;
  onDestination: (value: string) => void;
  onSecond: (value: string) => void;
  onFill: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const needsSecond = jobMode === "pickup" || jobMode === "load" || jobMode === "unload";
  const needsFill = jobMode === "pickup" || jobMode === "load";
  const ready = destinationId !== "" && (!needsSecond || secondId !== "") && (!needsFill || fillId !== "");

  return (
    <div className="mt-4">
      <h3 className={embedded ? "mb-2 text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase" : "mb-2 text-sm font-semibold text-stone-700"}>
        AutoDrive
      </h3>
      {vehicle.adActive ? (
        <p className={embedded ? "mb-2 text-[13px] text-[#f3efe4]" : "mb-2 text-sm text-stone-700"}>{autoDriveStatus(vehicle)}</p>
      ) : null}
      {vehicle.adCapable ? (
        <>
          <label className="block text-[13px] text-[#b7b1a4]" htmlFor="ad-mode">
            Mode
          </label>
          <select
            id="ad-mode"
            className={SELECT_CLASS}
            value={jobMode}
            onChange={(event) => onJobMode(event.target.value as AutoDriveMode)}
          >
            {JOB_MODES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <MarkerSelect
            id="ad-destination"
            label={primaryLabel(jobMode)}
            value={destinationId}
            placeholder="Choose a destination"
            markers={destinations}
            onChange={onDestination}
          />
          {needsSecond ? (
            <MarkerSelect
              id="ad-second"
              label={secondLabel(jobMode)}
              value={secondId}
              placeholder="Choose a destination"
              markers={destinations}
              onChange={onSecond}
            />
          ) : null}
          {needsFill ? (
            <>
              <label className="mt-3 block text-[13px] text-[#b7b1a4]" htmlFor="ad-fruit">
                Fruit type
              </label>
              <select id="ad-fruit" className={SELECT_CLASS} value={fillId} onChange={(event) => onFill(event.target.value)}>
                <option value="">Choose a fruit type</option>
                {CROP_CALENDAR.map((crop) => (
                  <option key={crop.fruit} value={crop.fruit}>
                    {crop.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {destinations.length === 0 ? (
            <p className="mt-2 text-[13px] text-[#b7b1a4]">No named destinations in the network.</p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="min-h-12 bg-[#e2b657] text-[#2a2112] hover:bg-[#ebc56f]"
              disabled={pending || vehicle.adActive || !ready}
              onClick={onStart}
            >
              Start AutoDrive
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className={embedded ? "min-h-12 bg-white/10 text-[#f3efe4] hover:bg-white/15" : "min-h-12"}
              disabled={pending || !vehicle.adActive}
              onClick={onStop}
            >
              Stop AutoDrive
            </Button>
          </div>
        </>
      ) : (
        <p className={embedded ? "text-[13px] text-[#b7b1a4]" : "text-sm text-stone-600"}>This vehicle does not support AutoDrive.</p>
      )}
    </div>
  );
}

type CommandExtra = {
  mode?: AutoDriveMode;
  secondTargetId?: string;
  fillType?: string;
};

type Props = {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommand: (action: WhitelistAction, vehicleId: string, targetId?: string, extra?: CommandExtra) => string;
  lastResult: CommandResult | null;
  embedded?: boolean;
  /** livemap links across. autodrive starts and stops a drive. */
  mode?: "livemap" | "autodrive";
  markers?: AutoDriveMarker[];
};

export function VehicleSheet({
  vehicle,
  open,
  onOpenChange,
  onCommand,
  lastResult,
  embedded = false,
  mode = "livemap",
  markers = [],
}: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [fillId, setFillId] = useState("");
  const [jobMode, setJobMode] = useState<AutoDriveMode>("drive");
  const openedAtRef = useRef(0);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!lastResult || !pendingId) return;
    if (lastResult.id !== pendingId) return;
    setPendingId(null);
    setFeedback(
      lastResult.ok
        ? lastResult.error
          ? lastResult.error
          : "Command OK — state will refresh from the bridge"
        : lastResult.error ?? "Command failed",
    );
  }, [lastResult, pendingId]);

  useEffect(() => {
    if (!open) {
      setFeedback(null);
      setPendingId(null);
    } else {
      openedAtRef.current = Date.now();
    }
  }, [open]);

  useEffect(() => {
    if (!embedded || vehicle == null) return;
    cardRef.current?.scrollIntoView({ block: "start" });
  }, [embedded, vehicle?.id]);

  useEffect(() => {
    setDestinationId("");
    setSecondId("");
    setFillId("");
    setJobMode("drive");
  }, [vehicle?.id]);

  const run = (action: WhitelistAction, targetId?: string, extra?: CommandExtra) => {
    if (!vehicle) return;
    setFeedback(
      action === "engine.stop"
        ? "Stopping engine…"
        : action === "engine.start"
          ? "Starting engine…"
          : action === "autodrive.start"
            ? "Starting AutoDrive…"
            : action === "autodrive.stop"
              ? "Stopping AutoDrive…"
              : "Sending command…",
    );
    const id = onCommand(action, vehicle.id, targetId, extra);
    setPendingId(id);
  };

  const destinations = [...markers].sort((a, b) => a.name.localeCompare(b.name));
  const drivable = vehicle != null && vehicle.category !== "implement" && vehicle.category !== "trailer";

  const vehicleDetails = vehicle ? (
    <>
      <h2 className={embedded ? "text-[15px] font-semibold tracking-[0.04em] uppercase" : "text-xl text-stone-900"}>
        {vehicle.name}
      </h2>
      <p className={embedded ? "mt-1 text-[13px] text-[#b7b1a4]" : "text-stone-600"}>
        {vehicle.category === "implement"
          ? "Implement"
          : vehicle.category === "trailer"
            ? "Trailer"
            : (vehicle.type ?? "Vehicle")}{" "}
        · {Math.round(vehicle.speed)} km/h
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge
          variant={vehicle.engineOn ? "default" : "secondary"}
          className={
            vehicle.engineOn
              ? "bg-[#8fb56a] text-[#17140f]"
              : embedded
                ? "bg-white/10 text-[#f3efe4]"
                : "bg-stone-300 text-stone-800"
          }
        >
          Engine {vehicle.engineOn ? "on" : "off"}
        </Badge>
        <Badge variant="outline" className={embedded ? "border-white/15 text-[#f3efe4]" : undefined}>
          Pos {Math.round(vehicle.x)}, {Math.round(vehicle.z)}
        </Badge>
      </div>
      {vehicle.fills != null ? (
        <div className="mt-4">
          <h3 className={embedded ? "mb-2 text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase" : "mb-2 text-sm font-semibold text-stone-700"}>
            Tanks
          </h3>
          <TankList fills={vehicle.fills} />
        </div>
      ) : null}
      {vehicle.damage != null ? (
        <p className={embedded ? "mt-3 text-[13px] text-[#b7b1a4]" : "mt-3 text-sm text-stone-600"}>
          Damage {Math.round(Math.max(0, Math.min(1, vehicle.damage)) * 100)}%
        </p>
      ) : null}
      <div className="mt-4">
        <h3 className={embedded ? "mb-2 text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase" : "mb-2 text-sm font-semibold text-stone-700"}>
          Attached implements
        </h3>
        {vehicle.attached.length === 0 ? (
          <p className={embedded ? "text-[13px] text-[#b7b1a4]" : "text-sm text-stone-500"}>None attached</p>
        ) : (
          <ul className={embedded ? "space-y-1 text-[13px]" : "space-y-1 text-sm text-stone-700"}>
            {vehicle.attached.map((name) => (
              <li
                key={name}
                className={
                  embedded
                    ? "rounded-md bg-white/[0.04] px-3 py-2"
                    : "rounded-md bg-white px-3 py-2 ring-1 ring-stone-200"
                }
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>
      {vehicle.category === "implement" || vehicle.category === "trailer" ? null : (
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          size="lg"
          className="min-h-12 bg-[#8fb56a] text-[#17140f] hover:bg-[#9ec47a]"
          disabled={!!pendingId || vehicle.engineOn}
          onClick={() => run("engine.start")}
        >
          Start engine
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className={embedded ? "min-h-12 bg-white/10 text-[#f3efe4] hover:bg-white/15" : "min-h-12"}
          disabled={!!pendingId || !vehicle.engineOn}
          onClick={() => run("engine.stop")}
        >
          Stop engine
        </Button>
        <Button
          size="lg"
          variant="outline"
          className={embedded ? "min-h-12 border-white/15 bg-transparent text-[#f3efe4] hover:bg-white/[0.08]" : "min-h-12"}
          disabled={!!pendingId}
          onClick={() => run("attach")}
        >
          Attach
        </Button>
        <Button
          size="lg"
          variant="outline"
          className={embedded ? "min-h-12 border-white/15 bg-transparent text-[#f3efe4] hover:bg-white/[0.08]" : "min-h-12"}
          disabled={!!pendingId || vehicle.attached.length === 0}
          onClick={() => run("detach")}
        >
          Detach
        </Button>
      </div>
      )}
      {drivable && mode === "livemap" ? (
        <Link
          href={`/autodrive?vehicle=${encodeURIComponent(vehicle.id)}`}
          className="mt-3 flex min-h-12 items-center justify-center rounded-lg bg-[#e2b657] px-4 text-sm font-semibold text-[#2a2112] hover:bg-[#ebc56f]"
        >
          Open in AutoDrive
        </Link>
      ) : null}
      {drivable && mode === "autodrive" ? (
        <AutoDriveControls
          vehicle={vehicle}
          destinations={destinations}
          jobMode={jobMode}
          destinationId={destinationId}
          secondId={secondId}
          fillId={fillId}
          pending={!!pendingId}
          embedded={embedded}
          onJobMode={(next) => {
            setJobMode(next);
            setSecondId("");
            setFillId("");
          }}
          onDestination={setDestinationId}
          onSecond={setSecondId}
          onFill={setFillId}
          onStart={() =>
            run("autodrive.start", destinationId, {
              mode: jobMode,
              secondTargetId: secondId || undefined,
              fillType: fillId || undefined,
            })
          }
          onStop={() => run("autodrive.stop")}
        />
      ) : null}
      {(pendingId || feedback) && (
        <div
          role="status"
          className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${
            feedback?.toLowerCase().includes("fail") ||
            feedback?.toLowerCase().includes("unsupport") ||
            feedback?.toLowerCase().includes("error")
              ? "bg-[#e07a6a]/20 text-[#ffd2cb]"
              : pendingId
                ? "bg-white/[0.08] text-[#f3efe4]"
                : "bg-[#8fb56a]/20 text-[#d7ecc4]"
          }`}
        >
          {feedback ?? "Sending command…"}
        </div>
      )}
    </>
  ) : null;

  if (embedded) {
    if (!vehicle) return null;
    return (
      <section
        ref={cardRef}
        className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
      >
        {vehicleDetails}
      </section>
    );
  }

  return (
    <Sheet
      open={open}
      modal="trap-focus"
      onOpenChange={(next, eventDetails) => {
        if (
          !next &&
          eventDetails?.reason === "outside-press" &&
          Date.now() - openedAtRef.current < 400
        ) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-t-2xl border-stone-200 bg-stone-50 px-5 pb-8 pt-4 sm:mx-auto sm:max-w-lg"
      >
        {vehicleDetails}
      </SheetContent>
    </Sheet>
  );
}
