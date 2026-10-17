import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Keep in step with web/src/lib/performance.ts. */

export const UPDATE_GROUPS = [
  "vehicles",
  "weather",
  "fields",
  "productions",
  "animals",
  "autodrive",
  "courseplay",
] as const;

export type UpdateGroup = (typeof UPDATE_GROUPS)[number];

export type IntervalsMs = Record<UpdateGroup, number>;

export type PerformanceProfile = {
  id: string;
  name: string;
  intervalsMs: IntervalsMs;
};

export type StoredSettings = {
  version: 1;
  mapImageFit: "pda" | "full";
  colors: Record<ColorKey, string>;
  notifications: NotificationSettings;
  performance: {
    activeId: string;
    custom: PerformanceProfile[];
  };
};

export type SettingsGroupInfo = {
  id: UpdateGroup;
  label: string;
  steps: number[];
  min: number;
  max: number;
};

export type SettingsResponse = {
  settings: StoredSettings;
  builtins: PerformanceProfile[];
  groups: SettingsGroupInfo[];
  activeIntervalsMs: IntervalsMs;
  fresh: boolean;
};

const COLOR_KEYS = [
  "tractor",
  "combine",
  "truck",
  "car",
  "loader",
  "train",
  "trailer",
  "implement",
  "other",
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];

const DEFAULT_COLORS: Record<ColorKey, string> = {
  tractor: "#e2b657",
  combine: "#e07a3d",
  truck: "#6ea8d9",
  car: "#8fd18a",
  loader: "#d6c24a",
  train: "#d46a6a",
  trailer: "#6ea8d9",
  implement: "#c9a24a",
  other: "#f3efe4",
};

const NOTIFICATION_CHANNELS = [
  "combineFull",
  "trailerFull",
  "adArrived",
  "adStuck",
  "adProblem",
  "cpFinished",
  "productionMissing",
  "productionFull",
] as const;

type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

type NotificationSettings = {
  combineFull: boolean;
  trailerFull: boolean;
  adArrived: boolean;
  adStuck: boolean;
  adProblem: boolean;
  cpFinished: boolean;
  productionMissing: boolean;
  productionFull: boolean;
  manualDismiss: Record<NotificationChannel, boolean>;
  fillThreshold: number;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_ID = /^[A-Za-z0-9_-]{1,80}$/;
const BUILTIN_IDS = new Set(["high", "normal", "low"]);
const MAX_CUSTOM = 20;

const LIMITS: Record<UpdateGroup, { min: number; max: number }> = {
  vehicles: { min: 100, max: 5000 },
  weather: { min: 500, max: 60000 },
  fields: { min: 1000, max: 60000 },
  productions: { min: 1000, max: 60000 },
  animals: { min: 1000, max: 60000 },
  autodrive: { min: 250, max: 30000 },
  courseplay: { min: 500, max: 30000 },
};

const STEPS: Record<UpdateGroup, number[]> = {
  vehicles: [100, 200, 250, 400, 500, 1000, 2000, 5000],
  weather: [500, 1000, 2000, 5000, 10000, 15000, 30000, 60000],
  fields: [1000, 2000, 5000, 10000, 15000, 30000, 60000],
  productions: [1000, 2000, 5000, 10000, 15000, 30000, 60000],
  animals: [1000, 2000, 5000, 10000, 15000, 30000, 60000],
  autodrive: [250, 500, 1000, 2000, 5000, 10000, 30000],
  courseplay: [500, 1000, 2000, 5000, 10000, 30000],
};

const LABELS: Record<UpdateGroup, string> = {
  vehicles: "Vehicles",
  weather: "Weather",
  fields: "Fields",
  productions: "Productions",
  animals: "Animals",
  autodrive: "AutoDrive",
  courseplay: "Courseplay",
};

function intervals(
  vehicles: number,
  weather: number,
  fields: number,
  productions: number,
  animals: number,
  autodrive: number,
  courseplay: number,
): IntervalsMs {
  return { vehicles, weather, fields, productions, animals, autodrive, courseplay };
}

export const BUILTIN_PROFILES: PerformanceProfile[] = [
  {
    id: "high",
    name: "High",
    intervalsMs: intervals(100, 1000, 2000, 2000, 2000, 500, 1000),
  },
  {
    id: "normal",
    name: "Normal",
    intervalsMs: intervals(400, 5000, 5000, 5000, 5000, 2000, 2000),
  },
  {
    id: "low",
    name: "Low",
    intervalsMs: intervals(1000, 15000, 15000, 15000, 15000, 5000, 5000),
  },
];

const NORMAL = BUILTIN_PROFILES[1]!.intervalsMs;

export const SETTINGS_GROUPS: SettingsGroupInfo[] = UPDATE_GROUPS.map((id) => ({
  id,
  label: LABELS[id],
  steps: STEPS[id],
  min: LIMITS[id].min,
  max: LIMITS[id].max,
}));

function defaultManualDismiss(): Record<NotificationChannel, boolean> {
  return {
    combineFull: true,
    trailerFull: true,
    adArrived: true,
    adStuck: true,
    adProblem: true,
    cpFinished: true,
    productionMissing: true,
    productionFull: true,
  };
}

export function defaultSettings(): StoredSettings {
  return {
    version: 1,
    mapImageFit: "pda",
    colors: { ...DEFAULT_COLORS },
    notifications: {
      combineFull: true,
      trailerFull: true,
      adArrived: true,
      adStuck: true,
      adProblem: true,
      cpFinished: true,
      productionMissing: true,
      productionFull: true,
      manualDismiss: defaultManualDismiss(),
      fillThreshold: 90,
    },
    performance: { activeId: "normal", custom: [] },
  };
}

function clampInterval(group: UpdateGroup, value: unknown): number {
  const limits = LIMITS[group];
  const n = typeof value === "number" ? value : NORMAL[group];
  if (!Number.isFinite(n)) return NORMAL[group];
  return Math.min(limits.max, Math.max(limits.min, Math.round(n)));
}

function sanitizeIntervals(value: unknown): IntervalsMs {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next = { ...NORMAL };
  for (const group of UPDATE_GROUPS) next[group] = clampInterval(group, record[group]);
  return next;
}

function sanitizeColors(value: unknown): Record<ColorKey, string> {
  const colors = { ...DEFAULT_COLORS };
  if (!value || typeof value !== "object") return colors;
  const record = value as Record<string, unknown>;
  for (const key of COLOR_KEYS) {
    const hex = record[key];
    if (typeof hex === "string" && HEX.test(hex)) colors[key] = hex;
  }
  return colors;
}

function clampThreshold(value: unknown) {
  const n = typeof value === "number" ? value : 90;
  if (!Number.isFinite(n)) return 90;
  return Math.min(100, Math.max(50, Math.round(n)));
}

function sanitizeNotifications(value: unknown): NotificationSettings {
  const notifications: NotificationSettings = {
    combineFull: true,
    trailerFull: true,
    adArrived: true,
    adStuck: true,
    adProblem: true,
    cpFinished: true,
    productionMissing: true,
    productionFull: true,
    manualDismiss: defaultManualDismiss(),
    fillThreshold: 90,
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

function sanitizeCustom(value: unknown): PerformanceProfile[] {
  if (!Array.isArray(value)) return [];
  const profiles: PerformanceProfile[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (profiles.length >= MAX_CUSTOM) break;
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawId = typeof record.id === "string" ? record.id.trim() : "";
    const id = CUSTOM_ID.test(rawId) && !BUILTIN_IDS.has(rawId) ? rawId : randomUUID();
    if (seen.has(id)) continue;
    seen.add(id);
    const rawName = typeof record.name === "string" ? record.name.trim() : "";
    profiles.push({
      id,
      name: rawName.slice(0, 40) || "Custom",
      intervalsMs: sanitizeIntervals(record.intervalsMs),
    });
  }
  return profiles;
}

export function sanitizeSettings(value: unknown): StoredSettings {
  const defaults = defaultSettings();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  const performance = record.performance;
  const perf = performance && typeof performance === "object" ? (performance as Record<string, unknown>) : {};
  const custom = sanitizeCustom(perf.custom);
  const requested = typeof perf.activeId === "string" ? perf.activeId : "normal";
  const activeId =
    BUILTIN_IDS.has(requested) || custom.some((profile) => profile.id === requested) ? requested : "normal";
  return {
    version: 1,
    mapImageFit: record.mapImageFit === "full" ? "full" : "pda",
    colors: sanitizeColors(record.colors),
    notifications: sanitizeNotifications(record.notifications),
    performance: { activeId, custom },
  };
}

export function resolveIntervals(settings: StoredSettings): IntervalsMs {
  const active = settings.performance.activeId;
  const builtin = BUILTIN_PROFILES.find((profile) => profile.id === active);
  if (builtin) return { ...builtin.intervalsMs };
  const custom = settings.performance.custom.find((profile) => profile.id === active);
  return custom ? { ...custom.intervalsMs } : { ...NORMAL };
}

function xmlAttr(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function performanceXml(settings: StoredSettings) {
  const rates = resolveIntervals(settings);
  const attrs = UPDATE_GROUPS.map((group) => `${group}="${rates[group]}"`).join(" ");
  return (
    `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n` +
    `<performance profile="${xmlAttr(settings.performance.activeId)}" ${attrs}/>\n`
  );
}

function writeAtomic(file: string, body: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, body, "utf8");
  renameSync(tmp, file);
}

export type SettingsStore = {
  response(): SettingsResponse;
  save(value: unknown): SettingsResponse;
  vehicleHz(): number;
};

export function createSettingsStore(dir: string): SettingsStore {
  const jsonFile = path.join(dir, "settings.json");
  const xmlFile = path.join(dir, "performance.xml");
  let fresh = !existsSync(jsonFile);
  let current = defaultSettings();

  if (!fresh) {
    try {
      current = sanitizeSettings(JSON.parse(readFileSync(jsonFile, "utf8")));
    } catch (err) {
      console.warn("[settings] could not read settings.json:", err instanceof Error ? err.message : err);
      current = defaultSettings();
    }
  }

  const persist = () => {
    writeAtomic(jsonFile, `${JSON.stringify(current, null, 2)}\n`);
    writeAtomic(xmlFile, performanceXml(current));
  };

  try {
    persist();
  } catch (err) {
    console.warn("[settings] could not write settings:", err instanceof Error ? err.message : err);
  }

  const response = (): SettingsResponse => ({
    settings: current,
    builtins: BUILTIN_PROFILES.map((profile) => ({ ...profile, intervalsMs: { ...profile.intervalsMs } })),
    groups: SETTINGS_GROUPS,
    activeIntervalsMs: resolveIntervals(current),
    fresh,
  });

  return {
    response,
    save(value: unknown) {
      current = sanitizeSettings(value);
      fresh = false;
      persist();
      return response();
    },
    vehicleHz() {
      return 1000 / resolveIntervals(current).vehicles;
    },
  };
}
