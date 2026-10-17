import { bridgeHttpUrl } from "@/lib/ws";

export type MapOverlayStatus = {
  status: "ready" | "missing" | "skipped";
  mapName: string | null;
  error?: string;
  revision: number;
  source?: "scan" | "custom";
};

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

function endpoint(path: string): string {
  return `${bridgeHttpUrl()}${path}`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error !== "") return data.error;
  } catch {
    // The bridge sent no message.
  }
  return fallback;
}

function isStatus(value: unknown): value is MapOverlayStatus {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status === "ready" || status === "missing" || status === "skipped";
}

async function readStatus(response: Response, fallback: string): Promise<MapOverlayStatus> {
  if (!response.ok) throw new Error(await readError(response, fallback));
  const data: unknown = await response.json();
  if (!isStatus(data)) throw new Error(fallback);
  return data;
}

export async function fetchMapOverlay(): Promise<MapOverlayStatus> {
  const response = await fetch(endpoint("/api/map-overlay"));
  return readStatus(response, "Could not check the map picture");
}

export function mapOverlayImageUrl(revision: number): string {
  return endpoint(`/api/map-overlay.png?v=${revision}`);
}

export async function uploadMapOverlay(file: File): Promise<MapOverlayStatus> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("That file is larger than 40 MB");
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(endpoint("/api/map-overlay"), { method: "POST", body });
  return readStatus(response, "Could not use that file");
}

export async function skipMapOverlay(): Promise<MapOverlayStatus> {
  const response = await fetch(endpoint("/api/map-overlay/skip"), { method: "POST" });
  return readStatus(response, "Could not skip the map picture");
}

export async function clearMapOverlay(): Promise<MapOverlayStatus> {
  const response = await fetch(endpoint("/api/map-overlay"), { method: "DELETE" });
  return readStatus(response, "Could not remove the map picture");
}
