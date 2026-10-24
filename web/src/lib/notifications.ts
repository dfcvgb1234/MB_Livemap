import type { NotificationChannel, NotificationSettings, NotificationSoundId } from "./settings";
import type { Production, Vehicle } from "./types";

export type ToastChannel = NotificationChannel;

export type ToastLevel = "info" | "warn" | "error";

export type ToastItem = {
  id: string;
  channel: ToastChannel;
  title: string;
  body: string;
  level: ToastLevel;
  vehicleId?: string;
};

const FUEL = /diesel|\bdef\b|adblue|\bair\b|electric|methane|fuel/i;

export function channelEnabled(channel: ToastChannel, notifications: NotificationSettings) {
  return notifications[channel];
}

export function staysUntilDismissed(channel: ToastChannel, notifications: NotificationSettings) {
  return notifications.manualDismiss[channel] !== false;
}

/** The clip to play for this alert, or null when sounds are off or this alert is silent. */
export function resolveNotificationSound(
  channel: ToastChannel,
  notifications: NotificationSettings,
): NotificationSoundId | null {
  if (!notifications.soundEnabled) return null;
  const choice = notifications.sounds[channel] ?? "default";
  if (choice === "none") return null;
  if (choice === "default") return notifications.defaultSound;
  return choice;
}

export function fillChannel(vehicle: Pick<Vehicle, "type" | "category">): "combineFull" | "trailerFull" | null {
  const key = (vehicle.type ?? "").toLowerCase();
  if (/combine|harvester|forage|cotton/.test(key)) return "combineFull";
  if (vehicle.category === "trailer") return "trailerFull";
  return null;
}

export function cargoRatio(vehicle: Pick<Vehicle, "fills">): { ratio: number; name: string } | null {
  let best: { ratio: number; name: string } | null = null;
  for (const fill of vehicle.fills ?? []) {
    if (fill.name.includes(" · ")) continue;
    if (FUEL.test(fill.name)) continue;
    if (fill.fillLevel == null || fill.capacity == null || fill.capacity <= 0) continue;
    const ratio = fill.fillLevel / fill.capacity;
    if (!best || ratio > best.ratio) best = { ratio, name: fill.name };
  }
  return best;
}

export type ProductionAlert = {
  key: string;
  channel: "productionMissing" | "productionFull";
  title: string;
  body: string;
  level: ToastLevel;
};

/** One alert per production line the game reports as blocked. */
export function productionAlerts(productions: Production[]): ProductionAlert[] {
  const alerts: ProductionAlert[] = [];
  for (const point of productions) {
    if ((point.status ?? "").toLowerCase() === "unowned") continue;
    for (const line of point.lines ?? []) {
      const status = (line.status ?? "").toUpperCase();
      if (status === "MISSING_INPUTS") {
        alerts.push({
          key: `productionMissing:${point.id}:${line.name}`,
          channel: "productionMissing",
          title: point.name,
          body: `${line.name} needs inputs`,
          level: "warn",
        });
      } else if (status === "NO_OUTPUT_SPACE") {
        alerts.push({
          key: `productionFull:${point.id}:${line.name}`,
          channel: "productionFull",
          title: point.name,
          body: `${line.name} storage is full`,
          level: "error",
        });
      }
    }
  }
  return alerts;
}
