import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createLivemapMcp } from "./mcp.js";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 8;

type Session = {
  transport: WebStandardStreamableHTTPServerTransport;
  lastUsed: number;
  close: () => Promise<void>;
};

const sessions = new Map<string, Session>();

function rpcError(status: number, code: number, message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function originAllowed(origin: string | null) {
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

async function closeSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  await session.close();
}

async function sweepSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > SESSION_TTL_MS) await closeSession(id);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (!oldest) break;
    await closeSession(oldest[0]);
  }
}

async function openSession() {
  await sweepSessions();
  const mcp = createLivemapMcp();
  await mcp.refreshTools();
  let sessionId = "";
  const timer = setInterval(() => {
    void mcp.refreshTools();
  }, 2000);
  timer.unref();
  const close = async () => {
    clearInterval(timer);
    if (sessionId) sessions.delete(sessionId);
    await mcp.server.close();
  };
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessionId = id;
      sessions.set(id, { transport, lastUsed: Date.now(), close });
    },
  });
  transport.onclose = () => {
    clearInterval(timer);
    if (sessionId) sessions.delete(sessionId);
  };
  await mcp.server.connect(transport);
  return transport;
}

/** Streamable HTTP MCP. One session per client, only meant for loopback callers. */
export async function handleMcpHttp(request: Request): Promise<Response> {
  if (!originAllowed(request.headers.get("origin"))) {
    return rpcError(403, -32000, "MCP is only accepted from this computer");
  }
  const requested = request.headers.get("mcp-session-id");
  if (requested) {
    const existing = sessions.get(requested);
    if (!existing) return rpcError(404, -32001, "Session not found");
    existing.lastUsed = Date.now();
    return existing.transport.handleRequest(request);
  }
  if (request.method !== "POST") {
    return rpcError(400, -32000, "Bad Request: Mcp-Session-Id header is required");
  }
  const transport = await openSession();
  return transport.handleRequest(request);
}
