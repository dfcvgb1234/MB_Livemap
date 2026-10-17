import { appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { homedir, networkInterfaces } from "node:os";
import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { WebSocketServer } from "ws";

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

export type ModInstallState = {
  status: "current" | "installed" | "updated" | "missing-game" | "copy-failed" | "skipped";
  message: string;
};

/** Copy the bundled mod zip into the FS25 mods folder when this build includes one. */
export function installBundledMod(settingsDir: string): ModInstallState {
  const zip = process.env.MB_LIVEMAP_MOD_ZIP ?? "";
  const version = (process.env.MB_LIVEMAP_VERSION ?? "").trim();
  if (!zip || !version) return { status: "skipped", message: "" };
  if (!existsSync(zip)) {
    return {
      status: "copy-failed",
      message: "The mod package is missing from the MB Livemap folder. Download it again.",
    };
  }

  const modsDir = path.join(homedir(), "Documents", "My Games", "FarmingSimulator2025", "mods");
  if (!existsSync(modsDir)) {
    return {
      status: "missing-game",
      message:
        "The Farming Simulator 2025 mods folder was not found. Install the game, then start MB Livemap again.",
    };
  }

  const dest = path.join(modsDir, "FS25_MB_Livemap.zip");
  const versionFile = path.join(settingsDir, "installed-version.txt");
  let previous = "";
  try {
    previous = readFileSync(versionFile, "utf8").trim();
  } catch {
    previous = "";
  }
  const hadZip = existsSync(dest);
  if (previous === version && hadZip) return { status: "current", message: "" };

  try {
    mkdirSync(settingsDir, { recursive: true });
    copyFileSync(zip, dest);
    writeFileSync(versionFile, version);
  } catch (err) {
    console.warn("[mod] copy failed:", err instanceof Error ? err.message : err);
    return {
      status: "copy-failed",
      message: "The mod could not be copied. Close Farming Simulator, then start MB Livemap again.",
    };
  }

  if (hadZip || previous !== "") {
    return {
      status: "updated",
      message: "A newer mod was copied into Farming Simulator. Restart the game, then load your save.",
    };
  }
  return {
    status: "installed",
    message:
      "MB Livemap Bridge was added to your mods folder. In the game, enable that mod, then load your save.",
  };
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

export function startDesktopHost(options: {
  port: number;
  staticRoot: string;
  fetch: Parameters<typeof getRequestListener>[0];
  attach: (wss: WebSocketServer) => void;
}) {
  const listener = getRequestListener(options.fetch);
  const server = createServer((req, res) => {
    if (req.method === "GET" || req.method === "HEAD") {
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
  server.listen(options.port, "0.0.0.0", () => {
    console.log(`[web] http://0.0.0.0:${options.port}`);
  });
}

export function staticRootFromEnv(): string {
  const raw = process.env.MB_LIVEMAP_STATIC ?? "";
  if (!raw) return "";
  const resolved = path.resolve(raw);
  return existsSync(resolved) ? resolved : "";
}
