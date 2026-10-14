"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCommand,
  defaultWsUrl,
  LivemapSocket,
} from "@/lib/ws";
import type {
  AutoDriveGraph,
  AutoDriveMode,
  CommandResult,
  ConnectionStatus,
  GameState,
  LivemapNotification,
  StatusMessage,
  WhitelistAction,
} from "@/lib/types";

export function useLivemap() {
  const [state, setState] = useState<GameState | null>(null);
  const [autoDrive, setAutoDrive] = useState<AutoDriveGraph | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<StatusMessage | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<LivemapSocket | null>(null);
  const everConnected = useRef(false);
  const notificationListeners = useRef(new Set<(note: LivemapNotification) => void>());
  const [focus, setFocus] = useState<{ id: string; tick: number } | null>(null);

  const subscribeNotifications = useCallback((listener: (note: LivemapNotification) => void) => {
    notificationListeners.current.add(listener);
    return () => {
      notificationListeners.current.delete(listener);
    };
  }, []);

  const focusVehicle = useCallback((id: string) => {
    setFocus({ id, tick: Date.now() });
  }, []);

  useEffect(() => {
    const socket = new LivemapSocket(defaultWsUrl(), {
      onState: (s) => {
        everConnected.current = true;
        setConnection("connected");
        setState(s);
        setError(null);
      },
      onAutoDrive: setAutoDrive,
      onStatus: setBridgeStatus,
      onCommandResult: setLastResult,
      onNotification: (note) => {
        for (const listener of notificationListeners.current) listener(note);
      },
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
    (
      action: WhitelistAction,
      vehicleId: string,
      targetId?: string,
      extra?: { mode?: AutoDriveMode; secondTargetId?: string; fillType?: string },
    ) => {
      const cmd = createCommand(action, vehicleId, targetId, extra);
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
    autoDrive,
    bridgeStatus,
    connection,
    lastResult,
    error,
    sendCommand,
    subscribeNotifications,
    focusVehicle,
    focus,
    isLive: connection === "connected" && state !== null,
  };
}
