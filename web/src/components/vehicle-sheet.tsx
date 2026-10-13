"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandResult, Vehicle, WhitelistAction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

type Props = {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommand: (action: WhitelistAction, vehicleId: string, targetId?: string) => string;
  lastResult: CommandResult | null;
};

export function VehicleSheet({
  vehicle,
  open,
  onOpenChange,
  onCommand,
  lastResult,
}: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const openedAtRef = useRef(0);

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

  const run = (action: WhitelistAction) => {
    if (!vehicle) return;
    setFeedback(
      action === "engine.stop"
        ? "Stopping engine…"
        : action === "engine.start"
          ? "Starting engine…"
          : "Sending command…",
    );
    const id = onCommand(action, vehicle.id);
    setPendingId(id);
  };

  return (
    <Sheet
      open={open}
      // Keep the Vehicles rail clickable while the sheet is open.
      modal="trap-focus"
      onOpenChange={(next, details) => {
        // Ignore the opening pointer's outsidePress so the sheet stays open.
        if (
          !next &&
          details?.reason === "outsidePress" &&
          Date.now() - openedAtRef.current < 400
        ) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-t-2xl border-stone-200 bg-stone-50 px-5 pb-8 pt-4 sm:max-w-lg sm:mx-auto"
      >
        {vehicle ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-xl text-stone-900">
                {vehicle.name}
              </SheetTitle>
              <SheetDescription className="text-stone-600">
                {vehicle.type ?? "Vehicle"} · {Math.round(vehicle.speed)} km/h
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge
                variant={vehicle.engineOn ? "default" : "secondary"}
                className={
                  vehicle.engineOn
                    ? "bg-lime-700 text-white"
                    : "bg-stone-300 text-stone-800"
                }
              >
                Engine {vehicle.engineOn ? "on" : "off"}
              </Badge>
              <Badge variant="outline">
                Pos {Math.round(vehicle.x)}, {Math.round(vehicle.z)}
              </Badge>
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-stone-700">
                Attached implements
              </h3>
              {vehicle.attached.length === 0 ? (
                <p className="text-sm text-stone-500">None attached</p>
              ) : (
                <ul className="space-y-1 text-sm text-stone-700">
                  {vehicle.attached.map((a) => (
                    <li key={a} className="rounded-md bg-white px-3 py-2 ring-1 ring-stone-200">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                size="lg"
                className="min-h-12 bg-lime-700 text-white hover:bg-lime-800"
                disabled={!!pendingId || vehicle.engineOn}
                onClick={() => run("engine.start")}
              >
                Start engine
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="min-h-12"
                disabled={!!pendingId || !vehicle.engineOn}
                onClick={() => run("engine.stop")}
              >
                Stop engine
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-12"
                disabled={!!pendingId}
                onClick={() => run("attach")}
              >
                Attach
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-12"
                disabled={!!pendingId || vehicle.attached.length === 0}
                onClick={() => run("detach")}
              >
                Detach
              </Button>
            </div>

            <p className="mt-3 text-xs text-stone-500">
              Attach needs a nearby implement and FS25 API support; unsupported
              actions return an error from the mod.
            </p>

            {(pendingId || feedback) && (
              <div
                role="status"
                className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${
                  feedback?.toLowerCase().includes("fail") ||
                  feedback?.toLowerCase().includes("unsupport") ||
                  feedback?.toLowerCase().includes("error")
                    ? "bg-amber-100 text-amber-950"
                    : pendingId
                      ? "bg-stone-200 text-stone-800"
                      : "bg-emerald-100 text-emerald-950"
                }`}
              >
                {feedback ?? "Sending command…"}
              </div>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
