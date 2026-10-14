import { DEFAULT_COLORS, MACHINE_COLOR_KEYS, type MachineColors } from "./machine-colors";

export type MapImageFit = "pda" | "full";

export type NotificationChannel =
  | "combineFull"
  | "trailerFull"
  | "adArrived"
  | "adStuck"
  | "adProblem"
  | "productionMissing"
  | "productionFull";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "combineFull",
  "trailerFull",
  "adArrived",
  "adStuck",
  "adProblem",
  "productionMissing",
  "productionFull",
];

export type NotificationSettings = {
  combineFull: boolean;
  trailerFull: boolean;
  adArrived: boolean;
  adStuck: boolean;
  adProblem: boolean;
  productionMissing: boolean;
  productionFull: boolean;
  /** When true, that alert stays on screen until it is closed. */
  manualDismiss: Record<NotificationChannel, boolean>;
  fillThreshold: number;
};

export type AppSettings = {
  mapImageFit: MapImageFit;
  colors: MachineColors;
  notifications: NotificationSettings;
};

export const DEFAULT_MANUAL_DISMISS: Record<NotificationChannel, boolean> = {
  combineFull: true,
  trailerFull: true,
  adArrived: true,
  adStuck: true,
  adProblem: true,
  productionMissing: true,
  productionFull: true,
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  combineFull: true,
  trailerFull: true,
  adArrived: true,
  adStuck: true,
  adProblem: true,
  productionMissing: true,
  productionFull: true,
  manualDismiss: { ...DEFAULT_MANUAL_DISMISS },
  fillThreshold: 90,
};

export const DEFAULT_SETTINGS: AppSettings = {
  mapImageFit: "pda",
  colors: { ...DEFAULT_COLORS },
  notifications: { ...DEFAULT_NOTIFICATIONS },
};

const STORAGE_KEY = "mb-livemap-settings";
const HEX = /^#[0-9a-fA-F]{6}$/;

function clampThreshold(value: unknown) {
  const n = typeof value === "number" ? value : DEFAULT_NOTIFICATIONS.fillThreshold;
  if (!Number.isFinite(n)) return DEFAULT_NOTIFICATIONS.fillThreshold;
  return Math.min(100, Math.max(50, Math.round(n)));
}

function sanitizeColors(value: unknown): MachineColors {
  const colors = { ...DEFAULT_COLORS };
  if (!value || typeof value !== "object") return colors;
  const record = value as Record<string, unknown>;
  for (const key of MACHINE_COLOR_KEYS) {
    const hex = record[key];
    if (typeof hex === "string" && HEX.test(hex)) colors[key] = hex;
  }
  return colors;
}

function sanitizeNotifications(value: unknown): NotificationSettings {
  const notifications: NotificationSettings = {
    ...DEFAULT_NOTIFICATIONS,
    manualDismiss: { ...DEFAULT_MANUAL_DISMISS },
  };
  if (!value || typeof value !== "object") return notifications;
  const record = value as Record<string, unknown>;
  for (const key of NOTIFICATION_CHANNELS) {
    if (typeof record[key] === "boolean") notifications[key] = record[key];
  }
  const manual = record.manualDismiss;
  if (manual && typeof manual === "object") {
    const saved = manual as Record<string, unknown>;
    for (const key of NOTIFICATION_CHANNELS) {
      if (typeof saved[key] === "boolean") notifications.manualDismiss[key] = saved[key];
    }
  }
  notifications.fillThreshold = clampThreshold(record.fillThreshold);
  return notifications;
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as { mapImageFit?: unknown; colors?: unknown; notifications?: unknown };
    return {
      mapImageFit: parsed.mapImageFit === "full" ? "full" : "pda",
      colors: sanitizeColors(parsed.colors),
      notifications: sanitizeNotifications(parsed.notifications),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
