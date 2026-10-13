"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCommand,
  defaultWsUrl,
  LivemapSocket,
} from "@/lib/ws";
import type {
  CommandResult,
  ConnectionStatus,
  GameState,
  StatusMessage,
  WhitelistAction,
} from "@/lib/types";

export function useLivemap() {
  const [state, setState] = useState<GameState | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<StatusMessage | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<LivemapSocket | null>(null);
  const everConnected = useRef(false);

  useEffect(() => {
    const socket = new LivemapSocket(defaultWsUrl(), {
      onState: (s) => {
        setState(s);
        setError(null);
      },
      onStatus: setBridgeStatus,
      onCommandResult: setLastResult,
      onConnection: (ok) => {
        if (ok) {
          everConnected.current = true;
          setConnection("connected");
        } else {
          setConnection(everConnected.current ? "reconnecting" : "disconnected");
        }
      },
      onError: setError,
    });
    socketRef.current = socket;
    socket.connect();
    return () => socket.close();
  }, []);

  const sendCommand = useCallback(
    (action: WhitelistAction, vehicleId: string, targetId?: string) => {
      const cmd = createCommand(action, vehicleId, targetId);
      const ok = socketRef.current?.sendCommand(cmd) ?? false;
      if (!ok) {
        setError("Not connected to bridge");
      }
      return cmd.id;
    },
    [],
  );

  return {
    state,
    bridgeStatus,
    connection,
    lastResult,
    error,
    sendCommand,
    isLive: connection === "connected" && state !== null,
  };
}
