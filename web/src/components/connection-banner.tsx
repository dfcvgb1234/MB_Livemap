"use client";

import type { ConnectionStatus, StatusMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  connection: ConnectionStatus;
  bridgeStatus: StatusMessage | null;
  error: string | null;
};

export function ConnectionBanner({ connection, bridgeStatus, error }: Props) {
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
    label = "Bridge offline";
    tone = "bad";
  } else if (usingMock) {
    label = "Live mock data (FS25 not connected)";
    tone = "warn";
  } else if (modOk) {
    return null;
  } else {
    label = "Waiting for the game";
    tone = "warn";
  }

  return (
    <p
      className={cn(
        "mb-3 rounded-[10px] px-3 py-2.5 text-sm",
        tone === "warn" && "bg-[#e2b657]/16 text-[#f3efe4]",
        tone === "bad" && "bg-[#e07a6a]/16 text-[#ffd2cb]",
      )}
      role="status"
    >
      {error ? `${label}. ${error}` : label}
    </p>
  );
}
