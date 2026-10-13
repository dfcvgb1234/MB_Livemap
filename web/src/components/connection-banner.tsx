"use client";

import type { ConnectionStatus, StatusMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  connection: ConnectionStatus;
  bridgeStatus: StatusMessage | null;
  error: string | null;
};

export function ConnectionBanner({ connection, bridgeStatus, error }: Props) {
  const offline = connection !== "connected";
  const usingMock = bridgeStatus?.mockActive;
  const modOk = bridgeStatus?.modConnected;

  let label = "Connected";
  let tone: "ok" | "warn" | "bad" = "ok";

  if (connection === "connecting") {
    label = "Connecting to bridge…";
    tone = "warn";
  } else if (connection === "reconnecting") {
    label = "Reconnecting to bridge…";
    tone = "warn";
  } else if (connection === "disconnected") {
    label = "Bridge offline — start the server (npm run mock)";
    tone = "bad";
  } else if (usingMock) {
    label = "Live mock data (FS25 not connected)";
    tone = "warn";
  } else if (modOk) {
    label = "Live from FS25 mod";
    tone = "ok";
  } else {
    label = "Bridge connected — waiting for mod or mock";
    tone = "warn";
  }

  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm font-medium",
        tone === "ok" && "bg-emerald-950/80 text-emerald-100",
        tone === "warn" && "bg-amber-950/80 text-amber-100",
        tone === "bad" && "bg-red-950/85 text-red-100",
      )}
      role="status"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block size-2.5 rounded-full",
            tone === "ok" && "bg-emerald-400 animate-pulse",
            tone === "warn" && "bg-amber-400 animate-pulse",
            tone === "bad" && "bg-red-400",
            offline && "animate-pulse",
          )}
        />
        <span>{label}</span>
      </div>
      {error ? <span className="truncate text-xs opacity-80">{error}</span> : null}
    </div>
  );
}
