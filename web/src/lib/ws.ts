import type {
  AutoDriveGraph,
  AutoDriveMode,
  CourseplayCourses,
  CommandMessage,
  CommandResult,
  CourseplayStart,
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
  // `next dev` keeps the socket on 18766. The packaged app serves the page
  // and the socket on the same port, so a tablet follows the address it opened.
  if (process.env.NODE_ENV === "development") return `ws://${host}:18766`;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host || host}`;
}

export function bridgeHttpUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_HTTP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return "http://127.0.0.1:18767";
  if (process.env.NODE_ENV === "development") {
    const host = window.location.hostname || "127.0.0.1";
    return `http://${host}:18767`;
  }
  return window.location.origin;
}

export function createCommand(
  action: WhitelistAction,
  vehicleId: string,
  targetId?: string,
  extra?: {
    mode?: AutoDriveMode;
    secondTargetId?: string;
    fillType?: string;
    cpStart?: CourseplayStart;
    cpLane?: number;
    x?: number;
    z?: number;
  },
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
    ...(extra?.cpStart ? { cpStart: extra.cpStart } : {}),
    ...(extra?.cpLane != null ? { cpLane: extra.cpLane } : {}),
    ...(extra?.x != null ? { x: extra.x } : {}),
    ...(extra?.z != null ? { z: extra.z } : {}),
  };
}

export type WsHandlers = {
  onState?: (state: GameState) => void;
  onAutoDrive?: (graph: AutoDriveGraph) => void;
  onCourseplay?: (courses: CourseplayCourses) => void;
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
      else if (typed.type === "courseplay")
        this.handlers.onCourseplay?.(msg as CourseplayCourses);
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
    return this.send(cmd);
  }

  send(message: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
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
