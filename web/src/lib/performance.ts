/** Keep in step with server/src/settingsStore.ts. */

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

export type SettingsGroupInfo = {
  id: UpdateGroup;
  label: string;
  steps: number[];
  min: number;
  max: number;
};

export type PerformanceSettings = {
  activeId: string;
  custom: PerformanceProfile[];
};

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

export const SETTINGS_GROUPS: SettingsGroupInfo[] = UPDATE_GROUPS.map((id) => ({
  id,
  label: LABELS[id],
  steps: STEPS[id],
  min: LIMITS[id].min,
  max: LIMITS[id].max,
}));

export const DEFAULT_PERFORMANCE: PerformanceSettings = {
  activeId: "normal",
  custom: [],
};

export const MAX_CUSTOM_PROFILES = 20;

export function formatInterval(ms: number) {
  if (ms < 1000) {
    const hz = 1000 / ms;
    const label = Number.isInteger(hz) ? String(hz) : hz.toFixed(1);
    return `${label}/s`;
  }
  const seconds = ms / 1000;
  const label = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
  return seconds === 1 ? "every 1 second" : `every ${label} seconds`;
}

export function nextCustomName(existing: string[]) {
  const names = new Set(existing.map((name) => name.toLowerCase()));
  if (!names.has("custom")) return "Custom";
  for (let index = 2; index < 100; index += 1) {
    const name = `Custom ${index}`;
    if (!names.has(name.toLowerCase())) return name;
  }
  return "Custom";
}

export const NORMAL_INTERVALS: IntervalsMs = intervals(400, 5000, 5000, 5000, 5000, 2000, 2000);

export function activeIntervals(performance: PerformanceSettings, builtins: PerformanceProfile[]): IntervalsMs {
  const builtin = builtins.find((profile) => profile.id === performance.activeId);
  if (builtin) return builtin.intervalsMs;
  const custom = performance.custom.find((profile) => profile.id === performance.activeId);
  return custom?.intervalsMs ?? NORMAL_INTERVALS;
}
