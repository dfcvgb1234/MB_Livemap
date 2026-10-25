import {
  BUILTIN_PROFILES,
  SETTINGS_GROUPS,
  type IntervalsMs,
  type PerformanceProfile,
  type SettingsGroupInfo,
} from "./performance";
import type { AppSettings } from "./settings";
import { bridgeHttpUrl } from "./ws";

export type SettingsPayload = {
  settings: AppSettings;
  builtins: PerformanceProfile[];
  groups: SettingsGroupInfo[];
  activeIntervalsMs: IntervalsMs;
  fresh: boolean;
};

function endpoint(path: string) {
  return `${bridgeHttpUrl()}${path}`;
}

function isPayload(value: unknown): value is SettingsPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as { settings?: unknown; builtins?: unknown; groups?: unknown };
  return record.settings != null && typeof record.settings === "object" && Array.isArray(record.builtins) && Array.isArray(record.groups);
}

export async function fetchSettings(): Promise<SettingsPayload> {
  const response = await fetch(endpoint("/api/settings"));
  if (!response.ok) throw new Error("Settings could not be loaded.");
  const data: unknown = await response.json();
  if (!isPayload(data)) throw new Error("Settings could not be loaded.");
  return data;
}

export async function saveSettings(settings: AppSettings): Promise<SettingsPayload> {
  const response = await fetch(endpoint("/api/settings"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error("Settings could not be saved.");
  const data: unknown = await response.json();
  if (!isPayload(data)) throw new Error("Settings could not be saved.");
  return data;
}

export const FALLBACK_BUILTINS = BUILTIN_PROFILES;
export const FALLBACK_GROUPS = SETTINGS_GROUPS;
