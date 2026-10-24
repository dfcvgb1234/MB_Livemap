import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import QRCode from "qrcode";
import {
  enableLogFile,
  installBundledMod,
  lanAddresses,
  startDesktopHost,
  staticRootFromEnv,
} from "./desktopHost.js";
import {
  WHITELIST,
  emptyState,
  type AutoDriveGraph,
  type AutoDriveMode,
  type CourseplayCourses,
  type BridgeToWeb,
  type CommandMessage,
  type CommandResult,
  type GameState,
  type LivemapNotification,
  type NotificationKind,
  type NotificationLevel,
  type StatusMessage,
  type WhitelistAction,
} from "./types.js";
import { createMapOverlay } from "./mapOverlay.js";
import { createSettingsStore } from "./settingsStore.js";
import {
  createMockAutoDrive,
  createMockCourseplay,
  setMockFarmFilter,
  setMockMultiplayer,
  startMockInjector,
} from "./mock.js";
import { handleMcpHttp } from "./mcpHttp.js";

enableLogFile(process.env.MB_LIVEMAP_LOG ?? "");

const TCP_PORT = Number(process.env.MB_LIVEMAP_TCP_PORT ?? 18765);
const WS_PORT = Number(process.env.MB_LIVEMAP_WS_PORT ?? 18766);
const HTTP_PORT = Number(process.env.MB_LIVEMAP_HTTP_PORT ?? 18767);
const PIPE_PATH = process.env.MB_LIVEMAP_PIPE ?? "\\\\.\\pipe\\mb-livemap";
const SETTINGS_DIR =
  process.env.MB_LIVEMAP_SETTINGS_DIR ??
  path.join(
    homedir(),
    "Documents",
    "My Games",
    "FarmingSimulator2025",
    "modSettings",
    "FS25_MB_Livemap",
  );
const COMMAND_FILE = path.join(SETTINGS_DIR, "commands.xml");
const FARM_FILE = path.join(SETTINGS_DIR, "farms.xml");
const SESSION_FILE = path.join(SETTINGS_DIR, "session.xml");
const COURSE_WATCH_FILE = path.join(SETTINGS_DIR, "coursewatch.txt");
const TOKEN = process.env.MB_LIVEMAP_TOKEN ?? "";
const STATIC_ROOT = staticRootFromEnv();
const DESKTOP = STATIC_ROOT !== "";
const WEB_PORT = Number(process.env.MB_LIVEMAP_PORT ?? 43127);
// The HTTP MCP handler reads state through the local bridge client. Always use this process.
process.env.MB_LIVEMAP_HTTP = `http://127.0.0.1:${DESKTOP ? WEB_PORT : HTTP_PORT}`;
const modInstall = installBundledMod(SETTINGS_DIR);
const overlay = createMapOverlay(SETTINGS_DIR);
const settingsStore = createSettingsStore(SETTINGS_DIR);
if (modInstall.message) console.log(`[mod] ${modInstall.message}`);
const MOCK =
  process.env.MB_LIVEMAP_MOCK === "1" ||
  process.env.MB_LIVEMAP_MOCK === "true" ||
  process.argv.includes("--mock");

let latestState: GameState = emptyState(MOCK ? "mock" : "mod");
let latestAutoDrive: AutoDriveGraph = MOCK
  ? createMockAutoDrive()
  : { type: "autodrive", available: false };
let latestCourseplay: CourseplayCourses = MOCK
  ? createMockCourseplay()
  : { type: "courseplay", available: false };
let autoDriveFromMock = MOCK;
let courseplayFromMock = MOCK;
let lastStateTs: number | null = MOCK ? Date.now() : null;
let modSocket: Socket | null = null;
let modViaPipe = false;
const pipeCommandQueue: CommandMessage[] = [];
let mockActive = MOCK;
let stopMock: (() => void) | null = null;
let mockHz = 0;

const webClients = new Set<WebSocket>();
const pendingCommands = new Map<
  string,
  { command: CommandMessage; from?: WebSocket }
>();

function statusPayload(): StatusMessage {
  return {
    type: "status",
    modConnected: modSocket !== null && !modSocket.destroyed,
    mockActive,
    lastStateTs,
  };
}

function broadcast(msg: BridgeToWeb) {
  const raw = JSON.stringify(msg);
  for (const client of webClients) {
    if (client.readyState === client.OPEN) {
      client.send(raw);
    }
  }
}

type MockVehiclePatch = {
  adActive?: boolean;
  adDestination?: string | null;
  adSecondDestination?: string | null;
  adMode?: AutoDriveMode | null;
  cpActive?: boolean;
  cpCourse?: string | null;
};

const mockAdOverrides = new Map<string, MockVehiclePatch>();

function patchMockVehicle(vehicleId: string, patch: MockVehiclePatch) {
  mockAdOverrides.set(vehicleId, { ...mockAdOverrides.get(vehicleId), ...patch });
}

function applyMockAd(state: GameState): GameState {
  if (state.source !== "mock" || mockAdOverrides.size === 0) return state;
  return {
    ...state,
    vehicles: state.vehicles.map((vehicle) => {
      const override = mockAdOverrides.get(vehicle.id);
      return override ? { ...vehicle, ...override } : vehicle;
    }),
  };
}

function setState(state: GameState) {
  latestState = applyMockAd(state);
  lastStateTs = state.ts;
  overlay.note(latestState);
  broadcast(latestState);
  broadcast(statusPayload());
}

const PARTIAL_KEYS = [
  "mapName",
  "mapSize",
  "customEnvironment",
  "mapDirectory",
  "missionDirectory",
  "calendar",
  "vehicles",
  "multiplayer",
  "localFarmId",
  "farms",
  "players",
  "weather",
  "fields",
  "productions",
  "animals",
] as const;

const NULLABLE_KEYS = new Set<string>([
  "mapName",
  "mapSize",
  "customEnvironment",
  "mapDirectory",
  "missionDirectory",
  "calendar",
  "localFarmId",
]);

function stopMockInjector() {
  mockActive = false;
  stopMock?.();
  stopMock = null;
  mockHz = 0;
}

function syncMockRate() {
  if (!mockActive) return;
  const hz = settingsStore.vehicleHz();
  if (stopMock && mockHz === hz) return;
  stopMock?.();
  mockHz = hz;
  stopMock = startMockInjector(setState, hz, broadcast);
}

/** Fold a partial mod snapshot into the last full state. Missing groups stay as they were. */
function mergeModState(partial: Partial<GameState> & { ts?: number }) {
  if (mockActive) {
    stopMockInjector();
    console.log("[mock] stopped — live mod connected");
    if (autoDriveFromMock) setAutoDrive({ type: "autodrive", available: false });
    if (courseplayFromMock) setCourseplay({ type: "courseplay", available: false });
    mockAdOverrides.clear();
    latestState = emptyState("mod");
  }
  const patch: Partial<GameState> = {};
  for (const key of PARTIAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
    const value = partial[key];
    if (value === undefined) continue;
    if (value === null && !NULLABLE_KEYS.has(key)) continue;
    (patch as Record<string, unknown>)[key] = value;
  }
  const ts = typeof partial.ts === "number" ? partial.ts : Date.now();
  setState({ ...latestState, ...patch, type: "state", source: "mod", ts });
}

function setAutoDrive(graph: AutoDriveGraph, fromMock = false) {
  latestAutoDrive = graph;
  autoDriveFromMock = fromMock;
  broadcast(graph);
}

function setCourseplay(courses: CourseplayCourses, fromMock = false) {
  latestCourseplay = courses;
  courseplayFromMock = fromMock;
  broadcast(courses);
  rememberCourseMtimes(courses, fromMock);
  courseRefreshPending = false;
}

const registeredCourseMtime = new Map<string, number>();
let courseRefreshPending = false;
let courseRefreshPendingAt = 0;

function readCourseWatchGeneration(): number {
  try {
    const value = Number(readFileSync(COURSE_WATCH_FILE, "utf8").trim());
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  } catch {
    // No watch file yet.
  }
  return 0;
}

let courseWatchGeneration = readCourseWatchGeneration();

function courseplayCoursePath(filePath: string): string | null {
  if (typeof filePath !== "string" || filePath === "" || filePath.includes("\0")) return null;
  const resolved = path.resolve(filePath);
  const parts = resolved.split(path.sep).map((part) => part.toLowerCase());
  if (!parts.includes("fs25_courseplay")) return null;
  return resolved;
}

function courseMtimeMs(filePath: string): number | null {
  const resolved = courseplayCoursePath(filePath);
  if (resolved == null) return null;
  try {
    const stat = statSync(resolved);
    return stat.isFile() ? stat.mtimeMs : null;
  } catch {
    return null;
  }
}

function rememberCourseMtimes(courses: CourseplayCourses, fromMock: boolean) {
  registeredCourseMtime.clear();
  if (fromMock || mockActive) return;
  for (const course of courses.courses ?? []) {
    const resolved = courseplayCoursePath(course.id);
    const mtime = resolved == null ? null : courseMtimeMs(resolved);
    if (resolved != null && mtime != null) registeredCourseMtime.set(resolved, mtime);
  }
}

function publishCourseWatch(generation: number) {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  const tmp = `${COURSE_WATCH_FILE}.tmp`;
  writeFileSync(tmp, `${generation}\n`, "utf8");
  try {
    unlinkSync(COURSE_WATCH_FILE);
  } catch {
    // The first publish has nothing to replace.
  }
  renameSync(tmp, COURSE_WATCH_FILE);
}

function coursesAreNewer(): boolean {
  for (const [filePath, registered] of registeredCourseMtime) {
    const mtime = courseMtimeMs(filePath);
    if (mtime != null && mtime > registered) return true;
  }
  return false;
}

function pollCourseMtimes() {
  if (mockActive || courseplayFromMock || registeredCourseMtime.size === 0) return;
  if (!coursesAreNewer()) return;
  if (courseRefreshPending && Date.now() - courseRefreshPendingAt < 5000) return;
  courseWatchGeneration += 1;
  courseRefreshPending = true;
  courseRefreshPendingAt = Date.now();
  try {
    publishCourseWatch(courseWatchGeneration);
  } catch (err) {
    console.warn("[courseplay] could not mark courses for reload:", err instanceof Error ? err.message : err);
    return;
  }
  console.log("[courseplay] saved course is newer than the registered one — reloading");
  sendToMod(JSON.stringify({ type: "refreshCourses" }));
}

function xmlAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function writeFarmFilter(farmIds: number[]) {
  const ids = [...new Set(farmIds.filter((id) => Number.isInteger(id) && id > 0))].join(",");
  const body = `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<farms ids="${xmlAttr(ids)}"/>\n`;
  mkdirSync(SETTINGS_DIR, { recursive: true });
  const tmp = `${FARM_FILE}.tmp`;
  writeFileSync(tmp, body, "utf8");
  renameSync(tmp, FARM_FILE);
}

function writeSessionFile() {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  const body = `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<session id="${xmlAttr(randomUUID())}"/>\n`;
  writeFileSync(SESSION_FILE, body, "utf8");
}

function commandFileAgeMs() {
  try {
    return Date.now() - statSync(COMMAND_FILE).mtimeMs;
  } catch {
    return null;
  }
}

function flushPipeCommands() {
  if (!modViaPipe || pipeCommandQueue.length === 0) return;
  const age = commandFileAgeMs();
  if (age !== null && age < 10_000) return;
  if (age !== null) {
    try {
      unlinkSync(COMMAND_FILE);
    } catch {
      return;
    }
  }

  const cmd = pipeCommandQueue[0];
  if (!cmd) return;
  const body =
    `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n` +
    `<commands id="${xmlAttr(cmd.id)}" action="${xmlAttr(cmd.action)}" vehicleId="${xmlAttr(cmd.vehicleId)}" targetId="${xmlAttr(cmd.targetId ?? "")}" mode="${xmlAttr(cmd.mode ?? "")}" secondTargetId="${xmlAttr(cmd.secondTargetId ?? "")}" fillType="${xmlAttr(cmd.fillType ?? "")}" cpStart="${xmlAttr(cmd.cpStart ?? "")}" cpLane="${xmlAttr(cmd.cpLane == null ? "" : String(cmd.cpLane))}"/>\n`;
  const tmp = `${COMMAND_FILE}.tmp`;
  try {
    mkdirSync(SETTINGS_DIR, { recursive: true });
    writeFileSync(tmp, body, "utf8");
    renameSync(tmp, COMMAND_FILE);
    pipeCommandQueue.shift();
  } catch (err) {
    console.warn("[pipe] failed to write command file:", err instanceof Error ? err.message : err);
    try {
      unlinkSync(tmp);
    } catch {
      // The next flush retries.
    }
  }
}

function sendToMod(line: string) {
  if (modViaPipe) {
    let msg: { type?: string };
    try {
      msg = JSON.parse(line) as { type?: string };
    } catch {
      return false;
    }
    if (msg.type === "command") {
      pipeCommandQueue.push(msg as CommandMessage);
      flushPipeCommands();
    }
    return true;
  }
  if (!modSocket || modSocket.destroyed) {
    return false;
  }
  modSocket.write(line.endsWith("\n") ? line : `${line}\n`);
  return true;
}

const AD_MODES = new Set(["drive", "pickup", "deliver", "load", "unload", "fieldwork"]);
const CP_STARTS = new Set(["first", "nearest", "last"]);

function isLoopbackAddress(address: string | undefined) {
  if (!address) return false;
  const host = address.toLowerCase().replace(/^::ffff:/, "");
  return host === "127.0.0.1" || host === "::1";
}

function isLoopback(c: Parameters<typeof getConnInfo>[0]) {
  try {
    return isLoopbackAddress(getConnInfo(c).remote.address);
  } catch {
    return false;
  }
}

function isWhitelistAction(value: string): value is WhitelistAction {
  return WHITELIST.has(value);
}

function commandFromBody(body: unknown): CommandMessage | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid command" };
  const raw = body as Record<string, unknown>;
  if (typeof raw.action !== "string" || raw.action === "") return { error: "command requires action" };
  if (!isWhitelistAction(raw.action)) return { error: `Unsupported action: ${raw.action}` };
  if (typeof raw.vehicleId !== "string" || raw.vehicleId === "") return { error: "command requires vehicleId" };

  const cmd: CommandMessage = {
    type: "command",
    id: typeof raw.id === "string" && raw.id !== "" ? raw.id : randomUUID(),
    action: raw.action,
    vehicleId: raw.vehicleId,
  };
  if (raw.targetId !== undefined) {
    if (typeof raw.targetId !== "string" || raw.targetId === "") return { error: "targetId must be a string" };
    cmd.targetId = raw.targetId;
  }
  if (raw.secondTargetId !== undefined) {
    if (typeof raw.secondTargetId !== "string" || raw.secondTargetId === "") {
      return { error: "secondTargetId must be a string" };
    }
    cmd.secondTargetId = raw.secondTargetId;
  }
  if (raw.fillType !== undefined) {
    if (typeof raw.fillType !== "string" || raw.fillType === "") return { error: "fillType must be a string" };
    cmd.fillType = raw.fillType;
  }
  if (raw.mode !== undefined) {
    if (typeof raw.mode !== "string" || !AD_MODES.has(raw.mode)) return { error: "Unknown AutoDrive mode" };
    cmd.mode = raw.mode as CommandMessage["mode"];
  }
  if (raw.cpStart !== undefined) {
    if (typeof raw.cpStart !== "string" || !CP_STARTS.has(raw.cpStart)) return { error: "Unknown Courseplay start" };
    cmd.cpStart = raw.cpStart as CommandMessage["cpStart"];
  }
  if (raw.cpLane !== undefined) {
    if (typeof raw.cpLane !== "number" || !Number.isFinite(raw.cpLane)) return { error: "cpLane must be a number" };
    cmd.cpLane = raw.cpLane;
  }
  return cmd;
}

const commandWaiters = new Map<string, (result: CommandResult) => void>();

function replyToClient(from: WebSocket | undefined, result: CommandResult) {
  if (from && from.readyState === from.OPEN) {
    from.send(JSON.stringify(result));
  }
  const waiter = commandWaiters.get(result.id);
  if (waiter) {
    commandWaiters.delete(result.id);
    waiter(result);
  }
}

/** Resolves with the mod's commandResult, or the mock result when that finishes inline. */
function submitCommand(cmd: CommandMessage): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      commandWaiters.delete(cmd.id);
      resolve(result);
    };
    commandWaiters.set(cmd.id, finish);
    try {
      handleCommand(cmd);
    } catch (err) {
      finish({
        type: "commandResult",
        id: cmd.id,
        ok: false,
        error: err instanceof Error ? err.message : "Command failed",
      });
      return;
    }
    if (!pendingCommands.has(cmd.id) && !settled) {
      finish({
        type: "commandResult",
        id: cmd.id,
        ok: false,
        error: "Command was not completed",
      });
    }
  });
}

function handleCommand(cmd: CommandMessage, from?: WebSocket): CommandResult {
  if (!WHITELIST.has(cmd.action)) {
    const result: CommandResult = {
      type: "commandResult",
      id: cmd.id,
      ok: false,
      error: `Unsupported action: ${cmd.action}`,
    };
    replyToClient(from, result);
    broadcast(result);
    return result;
  }

  if (mockActive && !modSocket) {
    // Simulate command success against mock state.
    if (cmd.action === "engine.start" || cmd.action === "engine.stop") {
      const on = cmd.action === "engine.start";
      latestState = {
        ...latestState,
        ts: Date.now(),
        vehicles: latestState.vehicles.map((v) =>
          v.id === cmd.vehicleId ? { ...v, engineOn: on, speed: on ? v.speed || 5 : 0 } : v,
        ),
      };
      lastStateTs = latestState.ts;
      broadcast(latestState);
    }
    if (cmd.action === "autodrive.start" || cmd.action === "autodrive.stop") {
      const vehicle = latestState.vehicles.find((v) => v.id === cmd.vehicleId);
      if (!vehicle?.adCapable) {
        const result: CommandResult = {
          type: "commandResult",
          id: cmd.id,
          ok: false,
          error: "Vehicle does not support AutoDrive",
        };
        replyToClient(from, result);
        broadcast(result);
        return result;
      }
      if (cmd.action === "autodrive.stop") {
        patchMockVehicle(cmd.vehicleId, {
          adActive: false,
          adDestination: null,
          adSecondDestination: null,
          adMode: null,
        });
        latestState = applyMockAd({
          ...latestState,
          ts: Date.now(),
        });
      } else {
        if (vehicle.adActive) {
          const result: CommandResult = {
            type: "commandResult",
            id: cmd.id,
            ok: false,
            error: "AutoDrive is already running",
          };
          replyToClient(from, result);
          broadcast(result);
          return result;
        }
        const mode = cmd.mode ?? "drive";
        if (
          mode !== "drive" &&
          mode !== "pickup" &&
          mode !== "deliver" &&
          mode !== "load" &&
          mode !== "unload" &&
          mode !== "fieldwork"
        ) {
          const result: CommandResult = {
            type: "commandResult",
            id: cmd.id,
            ok: false,
            error: "Unknown AutoDrive mode",
          };
          replyToClient(from, result);
          broadcast(result);
          return result;
        }
        if (mode === "fieldwork") {
          const course = latestCourseplay.courses?.find((item) => item.id === cmd.targetId);
          if (!latestCourseplay.available || !cmd.targetId || !course) {
            const result: CommandResult = {
              type: "commandResult",
              id: cmd.id,
              ok: false,
              error: "Unknown course",
            };
            replyToClient(from, result);
            broadcast(result);
            return result;
          }
          if (!vehicle.cpCapable) {
            const result: CommandResult = {
              type: "commandResult",
              id: cmd.id,
              ok: false,
              error: "Vehicle does not support Courseplay",
            };
            replyToClient(from, result);
            broadcast(result);
            return result;
          }
          patchMockVehicle(cmd.vehicleId, {
            adActive: true,
            adDestination: `${course.folder} / ${course.name}`,
            adSecondDestination: null,
            adMode: "fieldwork",
          });
        } else {
        const markerId = Number(cmd.targetId);
        const marker = latestAutoDrive.markers?.find((item) => item.id === markerId);
        if (!cmd.targetId || !marker) {
          const result: CommandResult = {
            type: "commandResult",
            id: cmd.id,
            ok: false,
            error: "Unknown destination",
          };
          replyToClient(from, result);
          broadcast(result);
          return result;
        }
        const needsSecond = mode === "pickup" || mode === "load" || mode === "unload";
        const secondId = Number(cmd.secondTargetId);
        const second = latestAutoDrive.markers?.find((item) => item.id === secondId);
        if (needsSecond && (!cmd.secondTargetId || !second)) {
          const result: CommandResult = {
            type: "commandResult",
            id: cmd.id,
            ok: false,
            error: "Unknown second destination",
          };
          replyToClient(from, result);
          broadcast(result);
          return result;
        }
        if ((mode === "pickup" || mode === "load") && !cmd.fillType) {
          const result: CommandResult = {
            type: "commandResult",
            id: cmd.id,
            ok: false,
            error: "Choose a fruit type",
          };
          replyToClient(from, result);
          broadcast(result);
          return result;
        }
        patchMockVehicle(cmd.vehicleId, {
          adActive: true,
          adDestination: marker.name,
          adSecondDestination: second?.name ?? null,
          adMode: mode,
        });
        }
        latestState = applyMockAd({
          ...latestState,
          ts: Date.now(),
        });
      }
      lastStateTs = latestState.ts;
      broadcast(latestState);
    }
    if (cmd.action === "courseplay.start" || cmd.action === "courseplay.stop") {
      const vehicle = latestState.vehicles.find((v) => v.id === cmd.vehicleId);
      if (!vehicle?.cpCapable) {
        const result: CommandResult = {
          type: "commandResult",
          id: cmd.id,
          ok: false,
          error: "Vehicle does not support Courseplay",
        };
        replyToClient(from, result);
        broadcast(result);
        return result;
      }
      if (cmd.action === "courseplay.stop") {
        patchMockVehicle(cmd.vehicleId, { cpActive: false, cpCourse: null });
      } else {
        if (vehicle.cpActive) {
          const result: CommandResult = {
            type: "commandResult",
            id: cmd.id,
            ok: false,
            error: "Courseplay is already running",
          };
          replyToClient(from, result);
          broadcast(result);
          return result;
        }
        const course = latestCourseplay.courses?.find((item) => item.id === cmd.targetId);
        if (!latestCourseplay.available || !cmd.targetId || !course) {
          const result: CommandResult = {
            type: "commandResult",
            id: cmd.id,
            ok: false,
            error: "Unknown course",
          };
          replyToClient(from, result);
          broadcast(result);
          return result;
        }
        patchMockVehicle(cmd.vehicleId, {
          cpActive: true,
          cpCourse: `${course.folder} / ${course.name}`,
        });
      }
      latestState = applyMockAd({
        ...latestState,
        ts: Date.now(),
      });
      lastStateTs = latestState.ts;
      broadcast(latestState);
    }
    const result: CommandResult = {
      type: "commandResult",
      id: cmd.id,
      ok: true,
    };
    replyToClient(from, result);
    broadcast(result);
    broadcast(statusPayload());
    return result;
  }

  pendingCommands.set(cmd.id, { command: cmd, from });
  const ok = sendToMod(JSON.stringify(cmd));
  if (!ok) {
    pendingCommands.delete(cmd.id);
    const result: CommandResult = {
      type: "commandResult",
      id: cmd.id,
      ok: false,
      error: "Mod not connected",
    };
    replyToClient(from, result);
    broadcast(result);
    return result;
  }

  // Timeout pending commands after 8s
  setTimeout(() => {
    if (!pendingCommands.has(cmd.id)) return;
    pendingCommands.delete(cmd.id);
    const result: CommandResult = {
      type: "commandResult",
      id: cmd.id,
      ok: false,
      error: "Command timed out waiting for mod",
    };
    replyToClient(from, result);
    broadcast(result);
  }, 8000);

  return {
    type: "commandResult",
    id: cmd.id,
    ok: true,
    error: undefined,
  };
}

function normalizeNotification(note: Partial<LivemapNotification>): LivemapNotification {
  const kind: NotificationKind =
    note.kind === "arrived" || note.kind === "stuck" || note.kind === "problem" || note.kind === "info" || note.kind === "finished"
      ? note.kind
      : "info";
  const level: NotificationLevel =
    note.level === "info" || note.level === "warn" || note.level === "error" ? note.level : "info";
  return {
    type: "notification",
    id: typeof note.id === "string" && note.id !== "" ? note.id : randomUUID(),
    kind,
    level,
    text: typeof note.text === "string" ? note.text : "",
    ...(typeof note.vehicleId === "string" ? { vehicleId: note.vehicleId } : {}),
    ...(typeof note.vehicleName === "string" ? { vehicleName: note.vehicleName } : {}),
    ts: typeof note.ts === "number" ? note.ts : Date.now(),
  };
}

function handleModLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: unknown;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    console.warn("[tcp] invalid JSON from mod:", trimmed.slice(0, 120));
    return;
  }
  if (!msg || typeof msg !== "object") return;
  const typed = msg as { type?: string };

  if (typed.type === "state") {
    mergeModState(msg as Partial<GameState> & { ts?: number });
    return;
  }

  if (typed.type === "autodrive") {
    setAutoDrive(msg as AutoDriveGraph);
    return;
  }

  if (typed.type === "courseplay") {
    setCourseplay(msg as CourseplayCourses);
    return;
  }

  if (typed.type === "notification") {
    const note = normalizeNotification(msg as Partial<LivemapNotification>);
    if (note.text !== "") broadcast(note);
    return;
  }

  if (typed.type === "commandResult") {
    const result = msg as CommandResult;
    const pending = pendingCommands.get(result.id);
    pendingCommands.delete(result.id);
    replyToClient(pending?.from, result);
    broadcast(result);
    return;
  }

  if (typed.type === "hello") {
    console.log("[tcp] mod hello");
    sendToMod(JSON.stringify({ type: "hello", client: "bridge" }));
    broadcast(statusPayload());
  }
}

function attachModSocket(socket: Socket, viaPipe: boolean) {
  const label = viaPipe ? "pipe" : "tcp";
  console.log(
    viaPipe
      ? "[pipe] mod connected"
      : `[tcp] mod connected from ${socket.remoteAddress}:${socket.remotePort}`,
  );
  if (modSocket && !modSocket.destroyed) {
    console.log(`[${label}] replacing previous mod connection`);
    modSocket.destroy();
  }
  modSocket = socket;
  modViaPipe = viaPipe;
  broadcast(statusPayload());

  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      handleModLine(line);
    }
  });
  socket.on("close", () => {
    console.log(`[${label}] mod disconnected`);
    if (modSocket === socket) {
      modSocket = null;
      modViaPipe = false;
    }
    broadcast(statusPayload());
  });
  socket.on("error", (err) => {
    console.warn(`[${label}] socket error:`, err.message);
  });
}

// --- TCP (mod) ---
const tcpServer = createTcpServer((socket) => {
  attachModSocket(socket, false);
});

tcpServer.on("error", (err) => {
  const code = err instanceof Error && "code" in err ? String(err.code) : "";
  if (code === "EADDRINUSE") {
    console.warn(`[tcp] port ${TCP_PORT} is already in use. Close the other MB Livemap, then start this one again.`);
    return;
  }
  console.warn("[tcp] server error:", err.message);
});

tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
  console.log(`[tcp] listening on 0.0.0.0:${TCP_PORT}`);
});

// FS25 cannot load LuaSocket. The mod writes JSON lines to this pipe instead.
const pipeServer = createTcpServer((socket) => {
  attachModSocket(socket, true);
});
pipeServer.on("error", (err) => {
  const code = err instanceof Error && "code" in err ? String(err.code) : "";
  if (code === "EADDRINUSE") {
    console.warn("[pipe] another MB Livemap is already using the game connection. Close that one, then start this one again.");
    return;
  }
  console.warn("[pipe] server error:", err.message);
});
if (process.platform === "win32") {
  try {
    writeSessionFile();
  } catch (err) {
    console.warn("[pipe] could not write session file:", err instanceof Error ? err.message : err);
  }
  pipeServer.listen(PIPE_PATH, () => {
    console.log(`[pipe] listening on ${PIPE_PATH}`);
    console.log(`[pipe] commands in ${COMMAND_FILE}`);
  });
  setInterval(flushPipeCommands, 200);
}

setInterval(pollCourseMtimes, 1000);

function attachWebClients(wss: WebSocketServer) {
wss.on("connection", (ws, req) => {
  if (TOKEN) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const token = url.searchParams.get("token") ?? req.headers["x-mb-livemap-token"];
    if (token !== TOKEN) {
      ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
      ws.close(1008, "Unauthorized");
      return;
    }
  }

  webClients.add(ws);
  console.log(`[ws] client connected (${webClients.size})`);
  ws.send(JSON.stringify(statusPayload()));
  ws.send(JSON.stringify(latestState));
  ws.send(JSON.stringify(latestAutoDrive));
  ws.send(JSON.stringify(latestCourseplay));

  ws.on("message", (data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(data));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const typed = msg as { type?: string };

    if (typed.type === "command") {
      const cmd = msg as CommandMessage;
      if (!cmd.id || !cmd.action || !cmd.vehicleId) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "command requires id, action, vehicleId",
          }),
        );
        return;
      }
      handleCommand(cmd, ws);
      return;
    }

    if (typed.type === "farmFilter") {
      const raw = (msg as { farmIds?: unknown }).farmIds;
      const farmIds = Array.isArray(raw) ? raw.filter((id): id is number => typeof id === "number") : [];
      try {
        writeFarmFilter(farmIds);
      } catch (err) {
        console.warn("[farms] failed to write farm filter:", err instanceof Error ? err.message : err);
        ws.send(JSON.stringify({ type: "error", message: "Could not save the farm filter" }));
        return;
      }
      if (mockActive) setMockFarmFilter(farmIds);
      return;
    }

    if (typed.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
  });

  ws.on("close", () => {
    webClients.delete(ws);
    console.log(`[ws] client disconnected (${webClients.size})`);
  });
});
}

// --- HTTP health / control ---
const app = new Hono();
app.use("*", cors({ origin: "*" }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    tcpPort: TCP_PORT,
    pipe: process.platform === "win32" ? PIPE_PATH : null,
    wsPort: DESKTOP ? WEB_PORT : WS_PORT,
    modConnected: modSocket !== null && !modSocket.destroyed,
    mockActive,
    lastStateTs,
  }),
);

app.get("/state", (c) => c.json(latestState));

app.get("/autodrive", (c) =>
  c.json({
    available: latestAutoDrive.available === true,
    markers: latestAutoDrive.available ? (latestAutoDrive.markers ?? []) : [],
  }),
);

app.get("/courseplay", (c) =>
  c.json({
    available: latestCourseplay.available === true,
    courses: latestCourseplay.available ? (latestCourseplay.courses ?? []) : [],
  }),
);

const mcpRoute = async (c: Parameters<typeof isLoopback>[0]) => {
  if (!isLoopback(c)) {
    return c.json({ error: "MCP is only accepted from this computer" }, 403);
  }
  return handleMcpHttp(c.req.raw);
};
app.all("/mcp", mcpRoute);
app.all("/mcp/", mcpRoute);

app.post("/api/command", async (c) => {
  if (!isLoopback(c)) {
    return c.json({ error: "Commands are only accepted from this computer" }, 403);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const parsed = commandFromBody(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const result = await submitCommand(parsed);
  return c.json(result);
});

app.get("/api/settings", (c) => c.json(settingsStore.response()));

app.put("/api/settings", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Settings could not be saved." }, 400);
  }
  try {
    const saved = settingsStore.save(body);
    syncMockRate();
    return c.json(saved);
  } catch (err) {
    console.warn("[settings] save failed:", err instanceof Error ? err.message : err);
    return c.json({ error: "Settings could not be saved." }, 500);
  }
});

app.get("/api/map-overlay", async (c) => {
  overlay.note(latestState);
  return c.json(await overlay.status());
});

app.get("/api/map-overlay.png", async (c) => {
  overlay.note(latestState);
  const image = await overlay.image();
  if (!image) return c.json({ error: "map DDS not found" }, 404);
  return new Response(Buffer.from(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "no-cache",
      "Content-Length": String(image.bytes.byteLength),
    },
  });
});

app.post("/api/map-overlay", async (c) => {
  overlay.note(latestState);
  const body = await c.req.parseBody();
  const uploaded = body.file;
  if (!(uploaded instanceof Blob)) {
    return c.json({ error: "Choose a DDS, PNG, JPEG, or WebP image" }, 400);
  }
  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  const filename = uploaded instanceof File ? uploaded.name : "upload";
  const saved = await overlay.upload(filename, bytes);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  return c.json(await overlay.status());
});

app.post("/api/map-overlay/skip", async (c) => {
  overlay.note(latestState);
  const saved = await overlay.skip();
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  return c.json(await overlay.status());
});

app.delete("/api/map-overlay", async (c) => {
  overlay.note(latestState);
  await overlay.clear();
  return c.json(await overlay.status());
});

app.get("/api/connect", async (c) => {
  const port = DESKTOP ? WEB_PORT : 43127;
  const links = await Promise.all(
    lanAddresses().map(async (ip) => {
      const url = `http://${ip}:${port}/`;
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 280,
        color: { dark: "#17140f", light: "#ffffff" },
      });
      return { url, qr };
    }),
  );
  return c.json({ links, mod: modInstall });
});

if (!DESKTOP || MOCK) {
  app.post("/mock/start", (c) => {
    setMockMultiplayer(c.req.query("mp") === "1");
    if (!mockActive) {
      mockActive = true;
      syncMockRate();
      setAutoDrive(createMockAutoDrive(), true);
      setCourseplay(createMockCourseplay(), true);
    }
    return c.json({ mockActive: true });
  });

  app.post("/mock/stop", (c) => {
    setMockMultiplayer(false);
    stopMockInjector();
    broadcast(statusPayload());
    return c.json({ mockActive: false });
  });
}

if (DESKTOP) {
  startDesktopHost({
    port: WEB_PORT,
    staticRoot: STATIC_ROOT,
    fetch: app.fetch,
    attach: attachWebClients,
  });
} else {
  const wsHttp = createHttpServer();
  const wss = new WebSocketServer({ server: wsHttp });
  attachWebClients(wss);
  wsHttp.listen(WS_PORT, "0.0.0.0", () => {
    console.log(`[ws] listening on 0.0.0.0:${WS_PORT}`);
  });
  serve({ fetch: app.fetch, port: HTTP_PORT, hostname: "0.0.0.0" }, () => {
    console.log(`[http] health on http://0.0.0.0:${HTTP_PORT}/health`);
  });
}

if (MOCK) {
  console.log("[mock] mock injector enabled");
  mockActive = true;
  syncMockRate();
}

console.log(
  DESKTOP
    ? `[bridge] ready — desktop http://0.0.0.0:${WEB_PORT} · MCP http://127.0.0.1:${WEB_PORT}/mcp · PIPE ${PIPE_PATH}${MOCK ? " · MOCK" : ""}`
    : `[bridge] ready — TCP ${TCP_PORT} · PIPE ${PIPE_PATH} · WS ${WS_PORT} · HTTP ${HTTP_PORT} · MCP http://127.0.0.1:${HTTP_PORT}/mcp${MOCK ? " · MOCK" : ""}`,
);
