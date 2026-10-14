"use client";

import { useEffect, useRef } from "react";
import { useLivemapContext } from "@/components/livemap-provider";
import { useSettings } from "@/components/settings-provider";
import {
  cargoRatio,
  channelEnabled,
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
