import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import {
  WHITELIST,
  emptyState,
  type BridgeToWeb,
  type CommandMessage,
  type CommandResult,
  type GameState,
  type StatusMessage,
} from "./types.js";
import { startMockInjector } from "./mock.js";

const TCP_PORT = Number(process.env.MB_LIVEMAP_TCP_PORT ?? 18765);
const WS_PORT = Number(process.env.MB_LIVEMAP_WS_PORT ?? 18766);
const HTTP_PORT = Number(process.env.MB_LIVEMAP_HTTP_PORT ?? 18767);
const TOKEN = process.env.MB_LIVEMAP_TOKEN ?? "";
const MOCK =
  process.env.MB_LIVEMAP_MOCK === "1" ||
  process.env.MB_LIVEMAP_MOCK === "true" ||
  process.argv.includes("--mock");

let latestState: GameState = emptyState(MOCK ? "mock" : "mod");
let lastStateTs: number | null = MOCK ? Date.now() : null;
let modSocket: Socket | null = null;
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

function setState(state: GameState) {
  latestState = state;
  lastStateTs = state.ts;
  broadcast(state);
  broadcast(statusPayload());
}

function sendToMod(line: string) {
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
    }
    setState(state);
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

// --- TCP (mod) ---
const tcpServer = createTcpServer((socket) => {
  console.log(`[tcp] mod connected from ${socket.remoteAddress}:${socket.remotePort}`);
  if (modSocket && !modSocket.destroyed) {
    console.log("[tcp] replacing previous mod connection");
    modSocket.destroy();
  }
  modSocket = socket;
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
    console.log("[tcp] mod disconnected");
    if (modSocket === socket) modSocket = null;
    broadcast(statusPayload());
  });
  socket.on("error", (err) => {
    console.warn("[tcp] socket error:", err.message);
  });
});

tcpServer.listen(TCP_PORT, "127.0.0.1", () => {
  console.log(`[tcp] listening on 127.0.0.1:${TCP_PORT}`);
});

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

wsHttp.listen(WS_PORT, "127.0.0.1", () => {
  console.log(`[ws] listening on 127.0.0.1:${WS_PORT}`);
});

// --- HTTP health / control ---
const app = new Hono();
app.use("*", cors({ origin: "*" }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    tcpPort: TCP_PORT,
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
    stopMock = startMockInjector(setState, 2);
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

serve({ fetch: app.fetch, port: HTTP_PORT, hostname: "127.0.0.1" }, () => {
  console.log(`[http] health on http://127.0.0.1:${HTTP_PORT}/health`);
});

if (MOCK) {
  console.log("[mock] mock injector enabled");
  stopMock = startMockInjector(setState, 2);
}

console.log(
  `[bridge] ready — TCP ${TCP_PORT} · WS ${WS_PORT} · HTTP ${HTTP_PORT}${MOCK ? " · MOCK" : ""}`,
);
