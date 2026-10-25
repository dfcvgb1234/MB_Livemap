import type { ToastChannel, ToastLevel } from "./notifications";

export type HistoryEntry = {
  id: string;
  channel: ToastChannel;
  title: string;
  body: string;
  level: ToastLevel;
  vehicleId?: string;
  at: number;
};

const STORAGE_KEY = "mb-livemap-notification-history";
const MAX_HISTORY = 200;

const CHANNELS = new Set<ToastChannel>([
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
]);

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.body === "string" &&
    typeof entry.at === "number" &&
    (entry.level === "info" || entry.level === "warn" || entry.level === "error") &&
    typeof entry.channel === "string" &&
    CHANNELS.has(entry.channel)
  );
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

export function prependHistory(current: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY);
}
