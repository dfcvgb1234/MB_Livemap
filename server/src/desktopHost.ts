import { appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { documentsDir } from "./documentsDir.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
};

/** Skip virtual and VPN adapters so the tablet QR uses the home Wi-Fi address. */
const SKIP_ADAPTER = /WSL|Nord|VPN|vEthernet|Hyper-V|Virtual|VMware|VirtualBox|Docker|Tailscale|ZeroTier|Loopback/i;

export function lanAddresses(): string[] {
  const found: string[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (SKIP_ADAPTER.test(name)) continue;
    for (const addr of addrs ?? []) {
      const v4 = addr.family === "IPv4" || (addr.family as unknown) === 4;
      if (!v4 || addr.internal) continue;
      if (addr.address.startsWith("127.") || addr.address.startsWith("169.254.")) continue;
      found.push(addr.address);
    }
  }
  return found;
}

export function enableLogFile(file: string) {
  if (!file) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const wrap =
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        appendFileSync(file, `${new Date().toISOString()} ${args.map(String).join(" ")}\n`);
      } catch {
        // A full disk should not take down the livemap.
      }
      fn(...args);
    };
  console.log = wrap(console.log.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
}

/** Copy the bundled mod zip into the FS25 mods folder when this build includes one. */
export function installBundledMod() {
  const zip = process.env.MB_LIVEMAP_MOD_ZIP ?? "";
  if (!zip || !existsSync(zip)) return;

  const modsDir = path.join(documentsDir(), "My Games", "FarmingSimulator2025", "mods");
  if (!existsSync(modsDir)) return;

  try {
    copyFileSync(zip, path.join(modsDir, "FS25_MB_Livemap.zip"));
  } catch (err) {
    console.warn("[mod] copy failed:", err instanceof Error ? err.message : err);
  }
}

function flightFile(rel: string): string | null {
  // Next asks for `__next.autodrive.__PAGE__.txt`. On Windows the export writes
  // that as `__next.autodrive/__PAGE__.txt` because the build path still
  // contains backslashes.
  const slash = rel.lastIndexOf("/");
  const dir = slash >= 0 ? rel.slice(0, slash) : "";
  const file = slash >= 0 ? rel.slice(slash + 1) : rel;
  if (!file.startsWith("__next.") || !file.endsWith(".txt")) return null;
  const inner = file.slice("__next.".length, -".txt".length);
  const dot = inner.indexOf(".");
  if (dot <= 0) return null;
  const mapped = `__next.${inner.slice(0, dot)}/${inner.slice(dot + 1).replaceAll(".", "/")}.txt`;
  return dir ? `${dir}/${mapped}` : mapped;
}

function resolveStatic(root: string, url: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent((url.split("?")[0] ?? "/")).replace(/\\/g, "/");
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  let rel = pathname.replace(/^\/+/, "");
  if (rel.endsWith("/")) rel = rel.slice(0, -1);
  const candidates =
    rel === ""
      ? ["index.html", "index.txt"]
      : [rel, flightFile(rel), `${rel}.html`, path.posix.join(rel, "index.html"), `${rel}.txt`, path.posix.join(rel, "index.txt")].filter(
          (candidate): candidate is string => candidate !== null,
        );

  const rootResolved = path.resolve(root);
  for (const candidate of candidates) {
    const full = path.resolve(rootResolved, candidate);
    const fromRoot = path.relative(rootResolved, full);
    if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) continue;
    try {
      if (statSync(full).isFile()) return full;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string) {
  const ext = path.extname(file).toLowerCase();
  const immutable = file.includes(`${path.sep}_next${path.sep}static${path.sep}`);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "Content-Length": statSync(file).size,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

/** The dashboard page and the JSON route share this name. The page is the form with a slash. */
const PAGE_AND_API = new Set(["autodrive"]);

function splitUrl(url: string) {
  const split = url.indexOf("?");
  return {
    path: split === -1 ? url : url.slice(0, split),
    query: split === -1 ? "" : url.slice(split),
  };
}

function wantsHtmlPage(accept: string | string[] | undefined) {
  const header = Array.isArray(accept) ? accept.join(",") : (accept ?? "");
  const first = header.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  return first === "text/html" || first === "application/xhtml+xml";
}

/** Keep /mcp on the protocol handler. A trailing slash must not miss the route or hit a page. */
function rewriteMcpUrl(url: string): string | null {
  const split = url.indexOf("?");
  const path = split === -1 ? url : url.slice(0, split);
  const query = split === -1 ? "" : url.slice(split);
  const bare = path.replace(/\/+$/, "") || "/";
  if (bare !== "/mcp" && !bare.startsWith("/mcp/")) return null;
  return `${bare}${query}`;
}

/** The Windows program sends this line, then the tablet's real bytes. */
function acceptProxied(socket: Socket, httpServer: HttpServer) {
  let buffer = Buffer.alloc(0);
  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    const newline = buffer.indexOf("\r\n");
    if (newline < 0) {
      if (buffer.length > 107) socket.destroy();
      return;
    }
    const line = buffer.subarray(0, newline).toString("ascii");
    const rest = buffer.subarray(newline + 2);
    const parts = line.split(" ");
    const clientIp = parts[2] ?? "";
    if (parts[0] !== "PROXY" || parts[1] !== "TCP4" || !/^(\d{1,3}\.){3}\d{1,3}$/.test(clientIp)) {
      socket.destroy();
      return;
    }
    Object.defineProperty(socket, "remoteAddress", {
      configurable: true,
      get: () => clientIp,
    });
    socket.pause();
    socket.off("data", onData);
    if (rest.length > 0) socket.unshift(rest);
    httpServer.emit("connection", socket);
    socket.resume();
  };
  socket.on("data", onData);
  socket.on("error", () => {
    socket.destroy();
  });
}

export function startDesktopHost(options: {
  port: number;
  host?: string;
  proxyProtocol?: boolean;
  staticRoot: string;
  fetch: Parameters<typeof getRequestListener>[0];
  attach: (wss: WebSocketServer) => void;
}) {
  const host = options.host || "0.0.0.0";
  const listener = getRequestListener(options.fetch);
  const server = createHttpServer((req, res) => {
    const mcpUrl = rewriteMcpUrl(req.url ?? "/");
    if (mcpUrl) req.url = mcpUrl;
    const { path: requestPath, query } = splitUrl(req.url ?? "/");
    const apiName = (requestPath.replace(/\/+$/, "") || "/").replace(/^\/+/, "");
    const sharedPage = PAGE_AND_API.has(apiName) && !requestPath.endsWith("/");
    if (sharedPage && (req.method === "GET" || req.method === "HEAD") && wantsHtmlPage(req.headers.accept)) {
      res.writeHead(308, { Location: `/${apiName}/${query}` });
      res.end();
      return;
    }
    if (!mcpUrl && !sharedPage && (req.method === "GET" || req.method === "HEAD")) {
      const file = resolveStatic(options.staticRoot, req.url ?? "/");
      if (file) {
        sendFile(req, res, file);
        return;
      }
    }
    void Promise.resolve(listener(req, res)).catch((err) => {
      console.error("[web]", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("MB Livemap hit an error.");
      }
    });
  });
  const wss = new WebSocketServer({ server });
  options.attach(wss);
  let failed = false;
  const fail = (err: Error) => {
    if (failed) return;
    failed = true;
    const code = "code" in err ? String(err.code) : "";
    if (code === "EADDRINUSE") {
      console.error(
        `[web] port ${options.port} is already in use. Close the other MB Livemap, then start this one again.`,
      );
    } else {
      console.error(`[web] ${err.message}`);
    }
    process.exit(1);
  };
  server.on("error", fail);
  wss.on("error", fail);
  const onListening = () => {
    console.log(`[web] http://${host}:${options.port}`);
  };
  if (options.proxyProtocol) {
    const gate = createTcpServer((socket) => acceptProxied(socket, server));
    gate.on("error", fail);
    gate.listen(options.port, host, onListening);
    return;
  }
  server.listen(options.port, host, onListening);
}

export function staticRootFromEnv(): string {
  const raw = process.env.MB_LIVEMAP_STATIC ?? "";
  if (!raw) return "";
  const resolved = path.resolve(raw);
  return existsSync(resolved) ? resolved : "";
}
