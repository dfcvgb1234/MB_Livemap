import type {
  AutoDriveMarker,
  CommandMessage,
  CommandResult,
  CourseplayCourse,
  GameState,
} from "./types.js";

export type BridgeHealth = {
  ok: boolean;
  modConnected: boolean;
  mockActive: boolean;
  lastStateTs: number | null;
};

export type AutoDriveView = {
  available: boolean;
  markers: AutoDriveMarker[];
};

export type CourseplayView = {
  available: boolean;
  courses: CourseplayCourse[];
};

export type ModFlags = {
  autodrive: boolean;
  courseplay: boolean;
  precisionFarming: boolean;
};

export type FarmSnapshot = {
  health: BridgeHealth;
  state: GameState;
  autodrive: AutoDriveView;
  courseplay: CourseplayView;
  mods: ModFlags;
};

export class BridgeUnavailable extends Error {
  constructor() {
    super("The livemap bridge is not running");
    this.name = "BridgeUnavailable";
  }
}

const DEFAULT_BASES = ["http://127.0.0.1:18767", "http://127.0.0.1:43127"];

function candidateBases() {
  const fromEnv = process.env.MB_LIVEMAP_HTTP?.trim().replace(/\/$/, "");
  if (!fromEnv) return DEFAULT_BASES;
  return [fromEnv, ...DEFAULT_BASES.filter((base) => base !== fromEnv)];
}

let cachedBase: string | null = null;

async function ping(base: string) {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function bridgeBase() {
  if (cachedBase && (await ping(cachedBase))) return cachedBase;
  cachedBase = null;
  for (const base of candidateBases()) {
    if (await ping(base)) {
      cachedBase = base;
      return base;
    }
  }
  return null;
}

async function getJson<T>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Bridge ${path} returned ${response.status}`);
  return (await response.json()) as T;
}

export async function loadSnapshot(): Promise<FarmSnapshot | null> {
  const base = await bridgeBase();
  if (!base) return null;
  const [health, state, autodrive, courseplay] = await Promise.all([
    getJson<BridgeHealth>(base, "/health"),
    getJson<GameState>(base, "/state"),
    getJson<AutoDriveView>(base, "/autodrive"),
    getJson<CourseplayView>(base, "/courseplay"),
  ]);
  return {
    health,
    state,
    autodrive,
    courseplay,
    mods: {
      autodrive: autodrive.available === true,
      courseplay: courseplay.available === true,
      precisionFarming: state.fields.some((field) => field.precisionFarming != null),
    },
  };
}

export async function postCommand(
  body: Omit<CommandMessage, "type" | "id"> & { id?: string },
): Promise<CommandResult> {
  const base = await bridgeBase();
  if (!base) throw new BridgeUnavailable();
  const response = await fetch(`${base}/api/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; id?: string } | null;
  if (!response.ok || payload == null || typeof payload.ok !== "boolean") {
    return {
      type: "commandResult",
      id: body.id ?? "",
      ok: false,
      error: payload?.error ?? `Bridge command returned ${response.status}`,
    };
  }
  return {
    type: "commandResult",
    id: typeof payload.id === "string" ? payload.id : (body.id ?? ""),
    ok: payload.ok,
    ...(payload.error ? { error: payload.error } : {}),
  };
}
