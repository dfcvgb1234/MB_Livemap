import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { decode as decodeJpeg } from "jpeg-js";
import { decodeDds, encodePng } from "./dds.js";
import { withZip, type ZipEntryInfo } from "./zipList.js";
import type { GameState } from "./types.js";

const execFileAsync = promisify(execFile);

const PREFERRED = ["overview.dds", "pda_map_H.dds"];
const MAX_UPLOAD = 40 * 1024 * 1024;
const MAX_DDS = 80 * 1024 * 1024;
const BASE_MAPS: Record<string, string> = {
  riverbendsprings: "mapUS",
  hutanpantai: "mapAS",
  zielonka: "mapEU",
};

export type MapOverlayStatus = {
  status: "ready" | "missing" | "skipped";
  mapName: string | null;
  error?: string;
  revision: number;
  source?: "scan" | "custom";
};

type Found = { png: Uint8Array } | { error: string };

type Result = {
  status: "ready" | "missing" | "skipped";
  mapName: string | null;
  error?: string;
  revision: number;
  source?: "scan" | "custom";
  bytes: Uint8Array | null;
  mime: string;
};

type Targets = {
  map: string;
  env: string;
  mapDir: string;
  missionDir: string;
};

export type OverlayStore = {
  note: (state: GameState) => void;
  status: () => Promise<MapOverlayStatus>;
  image: () => Promise<{ bytes: Uint8Array; mime: string } | null>;
  upload: (filename: string, bytes: Uint8Array) => Promise<{ ok: true } | { ok: false; error: string }>;
  skip: () => Promise<{ ok: true } | { ok: false; error: string }>;
  clear: () => Promise<void>;
};

export function createMapOverlay(settingsDir: string): OverlayStore {
  const directory = path.join(settingsDir, "overlays");
  let generation = 0;
  let identity = "";
  let latest: GameState | null = null;
  let gameRootCache: string | null = null;
  let current: Result = {
    status: "missing",
    mapName: null,
    revision: 0,
    bytes: null,
    mime: "image/png",
  };
  let pending: Promise<void> = Promise.resolve();

  function begin(state: GameState) {
    const gen = ++generation;
    const job = compute(state).then((result) => {
      if (gen !== generation) return;
      current = { ...result, revision: current.revision + 1 };
    });
    pending = job.then(() => undefined);
  }

  async function settled(): Promise<Result> {
    let job = pending;
    for (;;) {
      await job;
      if (pending === job) return current;
      job = pending;
    }
  }

  async function compute(state: GameState): Promise<Omit<Result, "revision">> {
    const mapName = text(state.mapName);
    if (state.source !== "mod" || !mapName) {
      return { status: "missing", mapName, bytes: null, mime: "image/png" };
    }
    const saved = readSaved(directory, mapName);
    if (saved?.kind === "skip") {
      return { status: "skipped", mapName, bytes: null, mime: "image/png" };
    }
    if (saved?.kind === "custom") {
      return {
        status: "ready",
        source: "custom",
        mapName,
        bytes: saved.bytes,
        mime: saved.mime,
      };
    }
    const found = await locateOverview({
      mapName,
      customEnvironment: text(state.customEnvironment),
      mapDirectory: text(state.mapDirectory),
      missionDirectory: text(state.missionDirectory),
      modsDir: modsDirectory(),
      gameRoot: await locateGameRoot(),
    });
    if (!found) return { status: "missing", mapName, bytes: null, mime: "image/png" };
    if ("error" in found) {
      return { status: "missing", mapName, error: found.error, bytes: null, mime: "image/png" };
    }
    return { status: "ready", source: "scan", mapName, bytes: found.png, mime: "image/png" };
  }

  async function locateGameRoot(): Promise<string | null> {
    if (gameRootCache && isGameRoot(gameRootCache)) return gameRootCache;
    const fromProcess = await rootFromProcess();
    if (fromProcess) {
      gameRootCache = fromProcess;
      return fromProcess;
    }
    for (const candidate of usualGameRoots()) {
      if (isGameRoot(candidate)) {
        gameRootCache = candidate;
        return candidate;
      }
    }
    return null;
  }

  function requireMap(): { ok: true; state: GameState; mapName: string } | { ok: false; error: string } {
    const state = latest;
    const mapName = state ? text(state.mapName) : null;
    if (!state || state.source !== "mod" || !mapName) {
      return { ok: false, error: "Load a save before choosing a map picture." };
    }
    return { ok: true, state, mapName };
  }

  return {
    note(state) {
      latest = state;
      const next = identityKey(state);
      if (next === identity) return;
      identity = next;
      begin(state);
    },
    async status() {
      const result = await settled();
      return publicStatus(result);
    },
    async image() {
      const result = await settled();
      if (result.status !== "ready" || !result.bytes) return null;
      return { bytes: result.bytes, mime: result.mime };
    },
    async upload(_filename, bytes) {
      const gate = requireMap();
      if (!gate.ok) return gate;
      const gen = ++generation;
      let saved: { bytes: Uint8Array; mime: string };
      try {
        saved = imageFromUpload(bytes);
      } catch (err) {
        begin(gate.state);
        return { ok: false, error: err instanceof Error ? err.message : "Could not use that file" };
      }
      if (gen !== generation) return { ok: true };
      writeChoice(directory, gate.mapName, { choice: "custom", mime: saved.mime }, saved.bytes);
      current = {
        status: "ready",
        source: "custom",
        mapName: gate.mapName,
        bytes: saved.bytes,
        mime: saved.mime,
        revision: current.revision + 1,
      };
      pending = Promise.resolve();
      return { ok: true };
    },
    async skip() {
      const gate = requireMap();
      if (!gate.ok) return gate;
      ++generation;
      writeChoice(directory, gate.mapName, { choice: "skip" }, null);
      current = {
        status: "skipped",
        mapName: gate.mapName,
        revision: current.revision + 1,
        bytes: null,
        mime: "image/png",
      };
      pending = Promise.resolve();
      return { ok: true };
    },
    async clear() {
      const state = latest;
      const mapName = state ? text(state.mapName) : null;
      if (mapName) {
        rmQuiet(choiceFile(directory, mapName));
        rmQuiet(bytesFile(directory, mapName));
      }
      if (state) begin(state);
    },
  };
}

export async function locateOverview(input: {
  mapName: string;
  customEnvironment: string | null;
  mapDirectory: string | null;
  missionDirectory: string | null;
  modsDir: string;
  gameRoot: string | null;
}): Promise<Found | null> {
  const direct = directFile(input.mapDirectory) ?? directFile(input.missionDirectory);
  if (direct) return ddsFileToPng(direct);

  const targets: Targets = {
    map: normalize(input.mapName),
    env: normalize(input.customEnvironment ?? ""),
    mapDir: normalize(input.mapDirectory ?? ""),
    missionDir: normalize(input.missionDirectory ?? ""),
  };
  const fromMods = findInMods(input.modsDir, targets);
  if (fromMods) return fromMods;

  const base = baseGameFile(input.gameRoot, targets.map);
  if (base) return ddsFileToPng(base);
  return null;
}

function publicStatus(result: Result): MapOverlayStatus {
  return {
    status: result.status,
    mapName: result.mapName,
    revision: result.revision,
    ...(result.error ? { error: result.error } : {}),
    ...(result.source ? { source: result.source } : {}),
  };
}

function identityKey(state: GameState): string {
  return [state.source, text(state.mapName) ?? "", text(state.customEnvironment) ?? "", text(state.mapDirectory) ?? "", text(state.missionDirectory) ?? ""].join("\n");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapKey(mapName: string): string {
  return normalize(mapName).slice(0, 80) || "map";
}

function choiceFile(directory: string, mapName: string): string {
  return path.join(directory, `${mapKey(mapName)}.json`);
}

function bytesFile(directory: string, mapName: string): string {
  return path.join(directory, `${mapKey(mapName)}.bin`);
}

function readSaved(directory: string, mapName: string): { kind: "skip" } | { kind: "custom"; bytes: Uint8Array; mime: string } | null {
  let parsed: { choice?: unknown; mime?: unknown };
  try {
    parsed = JSON.parse(readFileSync(choiceFile(directory, mapName), "utf8")) as { choice?: unknown; mime?: unknown };
  } catch {
    return null;
  }
  if (parsed.choice === "skip") return { kind: "skip" };
  if (parsed.choice !== "custom" || typeof parsed.mime !== "string") return null;
  try {
    const bytes = readFileSync(bytesFile(directory, mapName));
    if (bytes.byteLength < 1) return null;
    return { kind: "custom", bytes, mime: parsed.mime };
  } catch {
    return null;
  }
}

function writeChoice(
  directory: string,
  mapName: string,
  choice: { choice: "skip" } | { choice: "custom"; mime: string },
  bytes: Uint8Array | null,
) {
  mkdirSync(directory, { recursive: true });
  const file = bytesFile(directory, mapName);
  if (bytes) writeFileSync(file, bytes);
  else rmQuiet(file);
  writeFileSync(choiceFile(directory, mapName), JSON.stringify(choice));
}

function rmQuiet(file: string) {
  try {
    rmSync(file, { force: true });
  } catch {
    // The next request tries again.
  }
}

function modsDirectory(): string {
  return path.join(homedir(), "Documents", "My Games", "FarmingSimulator2025", "mods");
}

function directFile(dir: string | null): string | null {
  if (!dir || dir.includes("$") || dir.includes("\0")) return null;
  const trimmed = dir.trim().replace(/[\\/]+$/, "");
  if (!path.isAbsolute(trimmed)) return null;
  for (const name of PREFERRED) {
    const candidate = path.join(trimmed, name);
    if (readableDds(candidate)) return candidate;
  }
  return null;
}

function readableDds(file: string): boolean {
  try {
    const stat = statSync(file);
    return stat.isFile() && stat.size >= 128 && stat.size <= MAX_DDS;
  } catch {
    return false;
  }
}

function ddsFileToPng(file: string): Found {
  try {
    return ddsBytesToPng(readFileSync(file));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That DDS format is not supported" };
  }
}

function ddsBytesToPng(bytes: Uint8Array): Found {
  try {
    const image = decodeDds(bytes);
    return { png: encodePng(image.width, image.height, image.rgba) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That DDS format is not supported" };
  }
}

function findInMods(modsDir: string, targets: Targets): Found | null {
  if (!existsSync(modsDir)) return null;
  let entries: Dirent[];
  try {
    entries = readdirSync(modsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const names = entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const entry = entries.find((item) => item.name === name);
    if (!entry?.isDirectory()) continue;
    const dir = path.join(modsDir, name);
    const xml = readText(path.join(dir, "modDesc.xml"));
    if (!xml || !modMatches(xml, normalize(name), targets)) continue;
    const dds = findPreferredFile(dir);
    if (!dds) continue;
    return ddsFileToPng(dds);
  }
  for (const name of names) {
    const entry = entries.find((item) => item.name === name);
    if (!entry?.isFile() || !name.toLowerCase().endsWith(".zip")) continue;
    const found = findInZip(path.join(modsDir, name), targets);
    if (found) return found;
  }
  return null;
}

function findPreferredFile(root: string): string | null {
  const queue = [root];
  let walked = 0;
  while (queue.length > 0) {
    const dir = queue.shift();
    if (!dir) break;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const files = new Map<string, string>();
    for (const entry of entries) {
      if (entry.isFile()) files.set(entry.name.toLowerCase(), entry.name);
    }
    for (const name of PREFERRED) {
      const actual = files.get(name.toLowerCase());
      if (!actual) continue;
      const full = path.join(dir, actual);
      if (readableDds(full)) return full;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      walked += 1;
      if (walked > 2000) return null;
      queue.push(path.join(dir, entry.name));
    }
  }
  return null;
}

function findInZip(zipPath: string, targets: Targets): Found | null {
  try {
    return withZip(zipPath, (zip) => {
      const entries = zip.list();
      const desc = pickEntry(entries, (name) => name === "moddesc.xml" || name.endsWith("/moddesc.xml"));
      const dds = pickDds(entries);
      if (!desc || !dds) return null;
      const xml = new TextDecoder("utf-8").decode(zip.read(desc));
      const container = normalize(path.basename(zipPath, path.extname(zipPath)));
      if (!modMatches(xml, container, targets)) return null;
      return ddsBytesToPng(zip.read(dds));
    });
  } catch {
    return null;
  }
}

function pickEntry(entries: ZipEntryInfo[], pred: (name: string) => boolean): ZipEntryInfo | null {
  const matches = entries
    .map((entry) => ({ entry, name: entry.name.toLowerCase() }))
    .filter(({ name, entry }) => pred(name) && !entry.encrypted && entry.uncompressedSize <= 1_000_000);
  matches.sort((a, b) => a.name.length - b.name.length);
  return matches[0]?.entry ?? null;
}

function pickDds(entries: ZipEntryInfo[]): ZipEntryInfo | null {
  const matches = entries
    .map((entry) => ({ entry, name: entry.name.toLowerCase() }))
    .filter(
      ({ name, entry }) =>
        (name.endsWith("overview.dds") || name.endsWith("pda_map_h.dds")) &&
        !entry.encrypted &&
        entry.uncompressedSize >= 128 &&
        entry.uncompressedSize <= MAX_DDS &&
        entry.compressedSize <= MAX_DDS,
    );
  matches.sort((a, b) => {
    const rank = (name: string) => (name.endsWith("overview.dds") ? 0 : 1);
    const byName = rank(a.name) - rank(b.name);
    return byName !== 0 ? byName : a.name.length - b.name.length;
  });
  return matches[0]?.entry ?? null;
}

function modMatches(xml: string, container: string, targets: Targets): boolean {
  const titles = modTitles(xml);
  if (targets.map && titles.some((title) => title === targets.map)) return true;
  if (targets.env.length >= 4 && container.includes(targets.env)) return true;
  if (directoryNamesMod(targets.mapDir, container)) return true;
  if (directoryNamesMod(targets.missionDir, container)) return true;
  return false;
}

function directoryNamesMod(dirNorm: string, container: string): boolean {
  return container.length >= 4 && dirNorm !== "" && (dirNorm === container || dirNorm.endsWith(container));
}

function modTitles(xml: string): string[] {
  const block = xml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!block?.[1]) return [];
  const titles: string[] = [];
  const tagged = /<[a-zA-Z0-9_-]+>([^<]+)<\/[a-zA-Z0-9_-]+>/g;
  let match: RegExpExecArray | null;
  while ((match = tagged.exec(block[1]))) {
    const title = normalize(match[1] ?? "");
    if (title) titles.push(title);
  }
  if (titles.length === 0) {
    const plain = normalize(block[1].replace(/<[^>]+>/g, " "));
    if (plain) titles.push(plain);
  }
  return titles;
}

function readText(file: string): string | null {
  try {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 1_000_000) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function baseGameFile(gameRoot: string | null, mapName: string): string | null {
  if (!gameRoot) return null;
  const folder = BASE_MAPS[mapName];
  if (!folder) return null;
  const dir = path.join(gameRoot, "data", "maps", folder, "textures", "ui");
  for (const name of PREFERRED) {
    const candidate = path.join(dir, name);
    if (readableDds(candidate)) return candidate;
  }
  return null;
}

function isGameRoot(dir: string): boolean {
  try {
    return statSync(path.join(dir, "data", "maps")).isDirectory();
  } catch {
    return false;
  }
}

async function rootFromProcess(): Promise<string | null> {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name = 'FarmingSimulator2025.exe' OR Name = 'FarmingSimulator2025Game.exe'\").ExecutablePath",
      ],
      { timeout: 8000, windowsHide: true },
    );
    for (const line of stdout.split(/\r?\n/)) {
      const exe = line.trim();
      if (!exe) continue;
      const root = rootFromExe(exe);
      if (root) return root;
    }
  } catch {
    // The install folder is checked next.
  }
  return null;
}

function rootFromExe(exe: string): string | null {
  let dir = path.dirname(exe);
  if (path.basename(dir).toLowerCase() === "x64") dir = path.dirname(dir);
  return isGameRoot(dir) ? dir : null;
}

function usualGameRoots(): string[] {
  const found: string[] = [];
  const add = (dir: string) => {
    if (dir && !found.includes(dir)) found.push(dir);
  };
  const names = ["Farming Simulator 2025", "FarmingSimulator2025"];
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const steamRoots = [path.join(programFilesX86, "Steam"), path.join(programFiles, "Steam")];
  for (const steam of steamRoots) {
    try {
      const text = readFileSync(path.join(steam, "steamapps", "libraryfolders.vdf"), "utf8");
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) {
        const library = (match[1] ?? "").replace(/\\\\/g, "\\");
        for (const name of names) add(path.join(library, "steamapps", "common", name));
      }
    } catch {
      // This PC may not have a Steam library list.
    }
    for (const name of names) add(path.join(steam, "steamapps", "common", name));
  }
  for (const name of names) {
    add(path.join(programFiles, "Epic Games", name));
    add(path.join(programFilesX86, "Epic Games", name));
  }
  return found;
}

function imageFromUpload(bytes: Uint8Array): { bytes: Uint8Array; mime: string } {
  if (bytes.byteLength > MAX_UPLOAD) throw new Error("That file is larger than 40 MB");
  if (isDds(bytes)) {
    const image = decodeDds(bytes);
    return { bytes: encodePng(image.width, image.height, image.rgba), mime: "image/png" };
  }
  if (isPng(bytes)) return { bytes, mime: "image/png" };
  if (isJpeg(bytes)) {
    const decoded = decodeJpeg(bytes, { formatAsRGBA: true, maxResolutionInMP: 70 });
    return { bytes: encodePng(decoded.width, decoded.height, decoded.data), mime: "image/png" };
  }
  if (isWebp(bytes)) return { bytes, mime: "image/webp" };
  throw new Error("Choose a DDS, PNG, JPEG, or WebP image");
}

function isDds(bytes: Uint8Array): boolean {
  return bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x53 && bytes[3] === 0x20;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}
