import type {
  AutoDriveGraph,
  AutoDriveMode,
  CommandMessage,
  CommandResult,
  GameState,
  LivemapNotification,
  StatusMessage,
  WhitelistAction,
} from "./types";

export function defaultWsUrl() {
  if (typeof window === "undefined") return "ws://127.0.0.1:18766";
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL;
  if (fromEnv) return fromEnv;
  const host = window.location.hostname || "127.0.0.1";
  return `ws://${host}:18766`;
}

export function createCommand(
  action: WhitelistAction,
  vehicleId: string,
  targetId?: string,
  extra?: { mode?: AutoDriveMode; secondTargetId?: string; fillType?: string },
): CommandMessage {
  return {
    type: "command",
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    vehicleId,
    ...(targetId ? { targetId } : {}),
    ...(extra?.mode ? { mode: extra.mode } : {}),
    ...(extra?.secondTargetId ? { secondTargetId: extra.secondTargetId } : {}),
    ...(extra?.fillType ? { fillType: extra.fillType } : {}),
  };
}

export type WsHandlers = {
  onState?: (state: GameState) => void;
  onAutoDrive?: (graph: AutoDriveGraph) => void;
  onStatus?: (status: StatusMessage) => void;
  onCommandResult?: (result: CommandResult) => void;
  onNotification?: (note: LivemapNotification) => void;
  onConnection?: (connected: boolean) => void;
  onError?: (message: string) => void;
};

export class LivemapSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: WsHandlers;
  private closedByUser = false;
  private retryMs = 800;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, handlers: WsHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  connect() {
    this.closedByUser = false;
    this.clearRetry();
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.handlers.onConnection?.(false);
      this.scheduleRetry();
      return;
    }

    this.ws.onopen = () => {
      if (this.closedByUser) return;
      this.retryMs = 800;
      this.handlers.onConnection?.(true);
    };

    this.ws.onclose = () => {
      if (this.closedByUser) return;
      this.handlers.onConnection?.(false);
      this.scheduleRetry();
    };

    this.ws.onerror = () => {
      this.handlers.onError?.("WebSocket error");
    };

    this.ws.onmessage = (ev) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      const typed = msg as { type?: string };
      if (typed.type === "state") this.handlers.onState?.(msg as GameState);
      else if (typed.type === "autodrive")
        this.handlers.onAutoDrive?.(msg as AutoDriveGraph);
      else if (typed.type === "status")
        this.handlers.onStatus?.(msg as StatusMessage);
      else if (typed.type === "commandResult")
        this.handlers.onCommandResult?.(msg as CommandResult);
      else if (typed.type === "notification")
        this.handlers.onNotification?.(msg as LivemapNotification);
      else if (typed.type === "error")
        this.handlers.onError?.((msg as { message?: string }).message ?? "Error");
    };
  }

  sendCommand(cmd: CommandMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
      return true;
    }
    return false;
  }

  close() {
    this.closedByUser = true;
    this.clearRetry();
    this.ws?.close();
    this.ws = null;
  }

  private scheduleRetry() {
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryMs = Math.min(this.retryMs * 1.5, 8000);
      this.connect();
    }, this.retryMs);
  }

  private clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
