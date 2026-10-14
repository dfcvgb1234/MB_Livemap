import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
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
} from "./types.js";
import { createMockAutoDrive, createMockCourseplay, startMockInjector } from "./mock.js";

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
const SESSION_FILE = path.join(SETTINGS_DIR, "session.xml");
const TOKEN = process.env.MB_LIVEMAP_TOKEN ?? "";
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
  broadcast(latestState);
  broadcast(statusPayload());
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
}

function xmlAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

function replyToClient(from: WebSocket | undefined, result: CommandResult) {
  if (from && from.readyState === from.OPEN) {
    from.send(JSON.stringify(result));
  }
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
    const state = msg as GameState;
    state.source = "mod";
    if (mockActive) {
      // Prefer live mod over mock once connected.
      mockActive = false;
      stopMock?.();
      stopMock = null;
      console.log("[mock] stopped — live mod connected");
      if (autoDriveFromMock) {
        setAutoDrive({ type: "autodrive", available: false });
      }
      if (courseplayFromMock) {
        setCourseplay({ type: "courseplay", available: false });
      }
      mockAdOverrides.clear();
    }
    setState(state);
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

tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
  console.log(`[tcp] listening on 0.0.0.0:${TCP_PORT}`);
});

// FS25 cannot load LuaSocket. The mod writes JSON lines to this pipe instead.
const pipeServer = createTcpServer((socket) => {
  attachModSocket(socket, true);
});
pipeServer.on("error", (err) => {
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

// --- WebSocket (web) ---
const wsHttp = createHttpServer();
const wss = new WebSocketServer({ server: wsHttp });

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

    if (typed.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
  });

  ws.on("close", () => {
    webClients.delete(ws);
    console.log(`[ws] client disconnected (${webClients.size})`);
  });
});

wsHttp.listen(WS_PORT, "0.0.0.0", () => {
  console.log(`[ws] listening on 0.0.0.0:${WS_PORT}`);
});

// --- HTTP health / control ---
const app = new Hono();
app.use("*", cors({ origin: "*" }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    tcpPort: TCP_PORT,
    pipe: process.platform === "win32" ? PIPE_PATH : null,
    wsPort: WS_PORT,
    modConnected: modSocket !== null && !modSocket.destroyed,
    mockActive,
    lastStateTs,
  }),
);

app.get("/state", (c) => c.json(latestState));

app.post("/mock/start", (c) => {
  if (!mockActive) {
    mockActive = true;
    stopMock = startMockInjector(setState, 2, broadcast);
    setAutoDrive(createMockAutoDrive(), true);
    setCourseplay(createMockCourseplay(), true);
  }
  return c.json({ mockActive: true });
});

app.post("/mock/stop", (c) => {
  mockActive = false;
  stopMock?.();
  stopMock = null;
  broadcast(statusPayload());
  return c.json({ mockActive: false });
});

serve({ fetch: app.fetch, port: HTTP_PORT, hostname: "0.0.0.0" }, () => {
  console.log(`[http] health on http://0.0.0.0:${HTTP_PORT}/health`);
});

if (MOCK) {
  console.log("[mock] mock injector enabled");
  stopMock = startMockInjector(setState, 2, broadcast);
}

console.log(
  `[bridge] ready — TCP ${TCP_PORT} · PIPE ${PIPE_PATH} · WS ${WS_PORT} · HTTP ${HTTP_PORT}${MOCK ? " · MOCK" : ""}`,
);
