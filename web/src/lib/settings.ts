import { DEFAULT_COLORS, MACHINE_COLOR_KEYS, type MachineColors } from "./machine-colors";
import { DEFAULT_PERFORMANCE, type PerformanceSettings } from "./performance";

export type MapImageFit = "pda" | "full";

export type NotificationChannel =
  | "combineFull"
  | "trailerFull"
  | "seederEmpty"
  | "sprayerEmpty"
  | "fertilizerEmpty"
  | "slurryEmpty"
  | "manureEmpty"
  | "adArrived"
  | "adStuck"
  | "adProblem"
  | "cpFinished"
  | "productionMissing"
  | "productionFull"
  | "animalMissing"
  | "animalFull";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "combineFull",
  "trailerFull",
  "seederEmpty",
  "sprayerEmpty",
  "fertilizerEmpty",
  "slurryEmpty",
  "manureEmpty",
  "adArrived",
  "adStuck",
  "adProblem",
  "cpFinished",
  "productionMissing",
  "productionFull",
  "animalMissing",
  "animalFull",
];

export const NOTIFICATION_SOUNDS = ["chime", "bell", "ping", "alert", "soft"] as const;

export type NotificationSoundId = (typeof NOTIFICATION_SOUNDS)[number];

/** "default" follows the shared sound. "none" stays silent for that alert. */
export type NotificationSoundChoice = "default" | "none" | NotificationSoundId;

export type NotificationSettings = {
  combineFull: boolean;
  trailerFull: boolean;
  seederEmpty: boolean;
  sprayerEmpty: boolean;
  fertilizerEmpty: boolean;
  slurryEmpty: boolean;
  manureEmpty: boolean;
  adArrived: boolean;
  adStuck: boolean;
  adProblem: boolean;
  cpFinished: boolean;
  productionMissing: boolean;
  productionFull: boolean;
  animalMissing: boolean;
  animalFull: boolean;
  /** When true, that alert stays on screen until it is closed. */
  manualDismiss: Record<NotificationChannel, boolean>;
  fillThreshold: number;
  /** Seeders, sprayers, spreaders, and animal food and water. */
  emptyThreshold: number;
  /** Master switch. Off keeps every alert silent. */
  soundEnabled: boolean;
  defaultSound: NotificationSoundId;
  sounds: Record<NotificationChannel, NotificationSoundChoice>;
};

export type AppSettings = {
  version: 1;
  mapImageFit: MapImageFit;
  colors: MachineColors;
  notifications: NotificationSettings;
  performance: PerformanceSettings;
};

export const DEFAULT_MANUAL_DISMISS: Record<NotificationChannel, boolean> = {
  combineFull: true,
  trailerFull: true,
  seederEmpty: true,
  sprayerEmpty: true,
  fertilizerEmpty: true,
  slurryEmpty: true,
  manureEmpty: true,
  adArrived: true,
  adStuck: true,
  adProblem: true,
  cpFinished: true,
  productionMissing: true,
  productionFull: true,
  animalMissing: true,
  animalFull: true,
};

export const DEFAULT_CHANNEL_SOUNDS: Record<NotificationChannel, NotificationSoundChoice> = {
  combineFull: "default",
  trailerFull: "default",
  seederEmpty: "default",
  sprayerEmpty: "default",
  fertilizerEmpty: "default",
  slurryEmpty: "default",
  manureEmpty: "default",
  adArrived: "default",
  adStuck: "default",
  adProblem: "default",
  cpFinished: "default",
  productionMissing: "default",
  productionFull: "default",
  animalMissing: "default",
  animalFull: "default",
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  combineFull: true,
  trailerFull: true,
  seederEmpty: true,
  sprayerEmpty: true,
  fertilizerEmpty: true,
  slurryEmpty: true,
  manureEmpty: true,
  adArrived: true,
  adStuck: true,
  adProblem: true,
  cpFinished: true,
  productionMissing: true,
  productionFull: true,
  animalMissing: true,
  animalFull: true,
  manualDismiss: { ...DEFAULT_MANUAL_DISMISS },
  fillThreshold: 90,
  emptyThreshold: 10,
  soundEnabled: false,
  defaultSound: "chime",
  sounds: { ...DEFAULT_CHANNEL_SOUNDS },
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  mapImageFit: "pda",
  colors: { ...DEFAULT_COLORS },
  notifications: {
    ...DEFAULT_NOTIFICATIONS,
    manualDismiss: { ...DEFAULT_MANUAL_DISMISS },
    sounds: { ...DEFAULT_CHANNEL_SOUNDS },
  },
  performance: { activeId: DEFAULT_PERFORMANCE.activeId, custom: [] },
};

const STORAGE_KEY = "mb-livemap-settings";
const HEX = /^#[0-9a-fA-F]{6}$/;

function clampThreshold(value: unknown) {
  const n = typeof value === "number" ? value : DEFAULT_NOTIFICATIONS.fillThreshold;
  if (!Number.isFinite(n)) return DEFAULT_NOTIFICATIONS.fillThreshold;
  return Math.min(100, Math.max(50, Math.round(n)));
}

function clampEmptyThreshold(value: unknown) {
  const n = typeof value === "number" ? value : DEFAULT_NOTIFICATIONS.emptyThreshold;
  if (!Number.isFinite(n)) return DEFAULT_NOTIFICATIONS.emptyThreshold;
  return Math.min(50, Math.max(5, Math.round(n)));
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

function isSoundId(value: unknown): value is NotificationSoundId {
  return typeof value === "string" && (NOTIFICATION_SOUNDS as readonly string[]).includes(value);
}

function sanitizeSoundChoice(value: unknown): NotificationSoundChoice {
  if (value === "default" || value === "none" || isSoundId(value)) return value;
  return "default";
}

function sanitizeNotifications(value: unknown): NotificationSettings {
  const notifications: NotificationSettings = {
    ...DEFAULT_NOTIFICATIONS,
    manualDismiss: { ...DEFAULT_MANUAL_DISMISS },
    sounds: { ...DEFAULT_CHANNEL_SOUNDS },
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
  notifications.emptyThreshold = clampEmptyThreshold(record.emptyThreshold);
  if (typeof record.soundEnabled === "boolean") notifications.soundEnabled = record.soundEnabled;
  if (isSoundId(record.defaultSound)) notifications.defaultSound = record.defaultSound;
  const sounds = record.sounds;
  if (sounds && typeof sounds === "object") {
    const saved = sounds as Record<string, unknown>;
    for (const key of NOTIFICATION_CHANNELS) {
      if (key in saved) notifications.sounds[key] = sanitizeSoundChoice(saved[key]);
    }
  }
  return notifications;
}

/** Browser settings from before they were stored on this PC. Null when there is nothing to copy. */
export function readLegacySettings(): Pick<AppSettings, "mapImageFit" | "colors" | "notifications"> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mapImageFit?: unknown; colors?: unknown; notifications?: unknown };
    return {
      mapImageFit: parsed.mapImageFit === "full" ? "full" : "pda",
      colors: sanitizeColors(parsed.colors),
      notifications: sanitizeNotifications(parsed.notifications),
    };
  } catch {
    return null;
  }
}

export function clearLegacySettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
