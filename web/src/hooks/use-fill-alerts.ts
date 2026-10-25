"use client";

import { useEffect, useRef } from "react";
import { useLivemapContext } from "@/components/livemap-provider";
import { useSettings } from "@/components/settings-provider";
import {
  animalWatches,
  cargoRatio,
  channelEnabled,
  emptyTankWatches,
  fillChannel,
  productionAlerts,
  type ToastItem,
} from "@/lib/notifications";

export function useFillAlerts(push: (toast: ToastItem) => void) {
  const { state } = useLivemapContext();
  const { settings, ready } = useSettings();
  const armed = useRef(new Map<string, boolean>());
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!state || !ready) return;
    const notes = settings.notifications;
    const threshold = notes.fillThreshold / 100;
    const reset = Math.max(0, threshold - 0.1);
    for (const vehicle of state.vehicles) {
      const channel = fillChannel(vehicle);
      if (!channel) continue;
      const cargo = cargoRatio(vehicle);
      if (!cargo) continue;
      const key = `${channel}:${vehicle.id}`;
      const isArmed = armed.current.get(key) === true;
      if (cargo.ratio >= threshold) {
        if (!isArmed && channelEnabled(channel, notes)) {
          pushRef.current({
            id: `fill-${vehicle.id}-${Date.now()}`,
            channel,
            title: `${vehicle.name} almost full`,
            body: `${cargo.name} ${Math.round(cargo.ratio * 100)}%`,
            level: "warn",
            vehicleId: vehicle.id,
          });
        }
        armed.current.set(key, true);
      } else if (cargo.ratio < reset) {
        armed.current.set(key, false);
      }
    }
  }, [state, settings.notifications, ready]);
}

export function useProductionAlerts(push: (toast: ToastItem) => void) {
  const { state } = useLivemapContext();
  const { settings, ready } = useSettings();
  const armed = useRef(new Map<string, boolean>());
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!state || !ready) return;
    const notes = settings.notifications;
    const active = new Set<string>();
    for (const alert of productionAlerts(state.productions)) {
      active.add(alert.key);
      const isArmed = armed.current.get(alert.key) === true;
      if (!isArmed && channelEnabled(alert.channel, notes)) {
        pushRef.current({
          id: `prod-${alert.key}-${Date.now()}`,
          channel: alert.channel,
          title: alert.title,
          body: alert.body,
          level: alert.level,
        });
      }
      armed.current.set(alert.key, true);
    }
    for (const key of armed.current.keys()) {
      if (!active.has(key)) armed.current.set(key, false);
    }
  }, [state, settings.notifications, ready]);
}

export function useEmptyAlerts(push: (toast: ToastItem) => void) {
  const { state } = useLivemapContext();
  const { settings, ready } = useSettings();
  const armed = useRef(new Map<string, boolean>());
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!state || !ready) return;
    const notes = settings.notifications;
    const threshold = notes.emptyThreshold / 100;
    const reset = Math.min(1, threshold + 0.1);
    for (const vehicle of state.vehicles) {
      for (const tank of emptyTankWatches(vehicle)) {
        const isArmed = armed.current.get(tank.key) === true;
        if (tank.ratio <= threshold) {
          if (!isArmed && channelEnabled(tank.channel, notes)) {
            pushRef.current({
              id: `empty-${tank.key}-${Date.now()}`,
              channel: tank.channel,
              title: tank.title,
              body: tank.body,
              level: "warn",
              vehicleId: tank.vehicleId,
            });
          }
          armed.current.set(tank.key, true);
        } else if (tank.ratio > reset) {
          armed.current.set(tank.key, false);
        }
      }
    }
  }, [state, settings.notifications, ready]);
}

export function useAnimalAlerts(push: (toast: ToastItem) => void) {
  const { state } = useLivemapContext();
  const { settings, ready } = useSettings();
  const armed = useRef(new Map<string, boolean>());
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!state || !ready) return;
    const notes = settings.notifications;
    const emptyAt = notes.emptyThreshold / 100;
    const fullAt = notes.fillThreshold / 100;
    const lowReset = Math.min(1, emptyAt + 0.1);
    const highReset = Math.max(0, fullAt - 0.1);
    const seen = new Set<string>();
    for (const watch of animalWatches(state.animals)) {
      seen.add(watch.key);
      const active = watch.direction === "low" ? watch.ratio <= emptyAt : watch.ratio >= fullAt;
      const released =
        watch.direction === "blocked" ? false : watch.direction === "low" ? watch.ratio > lowReset : watch.ratio < highReset;
      const isArmed = armed.current.get(watch.key) === true;
      if (active) {
        if (!isArmed && channelEnabled(watch.channel, notes)) {
          pushRef.current({
            id: `animal-${watch.key}-${Date.now()}`,
            channel: watch.channel,
            title: watch.title,
            body: watch.body,
            level: watch.level,
          });
        }
        armed.current.set(watch.key, true);
      } else if (released) {
        armed.current.set(watch.key, false);
      }
    }
    for (const key of armed.current.keys()) {
      if (!seen.has(key)) armed.current.set(key, false);
    }
  }, [state, settings.notifications, ready]);
}
