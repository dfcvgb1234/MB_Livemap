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
  CourseplayCourses,
  CourseplayStart,
  CommandResult,
  ConnectionStatus,
  GameState,
  LivemapNotification,
  StatusMessage,
  WhitelistAction,
} from "@/lib/types";

function farmStorageKey(mapName: string | null | undefined) {
  return `mb-livemap-farms:${mapName && mapName.length > 0 ? mapName : "default"}`;
}

function readSavedFarms(mapName: string | null | undefined) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(farmStorageKey(mapName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
}

function writeSavedFarms(mapName: string | null | undefined, ids: number[], localFarmId: number) {
  const extra = ids.filter((id) => id !== localFarmId);
  window.localStorage.setItem(farmStorageKey(mapName), JSON.stringify(extra));
}

export function useLivemap() {
  const [state, setState] = useState<GameState | null>(null);
  const [autoDrive, setAutoDrive] = useState<AutoDriveGraph | null>(null);
  const [courseplay, setCourseplay] = useState<CourseplayCourses | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<StatusMessage | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<LivemapSocket | null>(null);
  const everConnected = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [enabledFarmIds, setEnabledFarmIds] = useState<number[] | null>(null);
  const farmMapRef = useRef<string | null>(null);
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
      onCourseplay: setCourseplay,
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

  useEffect(() => {
    if (state?.multiplayer !== true || typeof state.localFarmId !== "number") return;
    const mapName = state.mapName ?? "";
    if (farmMapRef.current === mapName && enabledFarmIds != null) return;
    farmMapRef.current = mapName;
    const saved = readSavedFarms(mapName);
    const ids = [state.localFarmId, ...saved.filter((id) => id !== state.localFarmId)];
    setEnabledFarmIds(ids);
  }, [state?.multiplayer, state?.localFarmId, state?.mapName, enabledFarmIds]);

  useEffect(() => {
    if (connection !== "connected" || state?.multiplayer !== true || enabledFarmIds == null) return;
    socketRef.current?.send({ type: "farmFilter", farmIds: enabledFarmIds });
  }, [connection, state?.multiplayer, enabledFarmIds]);

  const setFarmEnabled = useCallback((farmId: number, enabled: boolean) => {
    const currentState = stateRef.current;
    const localId = currentState?.localFarmId;
    if (currentState?.multiplayer !== true || typeof localId !== "number" || farmId === localId) return;
    setEnabledFarmIds((current) => {
      const base = current ?? [localId];
      const without = base.filter((id) => id !== farmId && id !== localId);
      const next = enabled ? [localId, ...without, farmId] : [localId, ...without];
      writeSavedFarms(currentState.mapName, next, localId);
      return next;
    });
  }, []);

  const sendCommand = useCallback(
    (
      action: WhitelistAction,
      vehicleId: string,
      targetId?: string,
      extra?: {
        mode?: AutoDriveMode;
        secondTargetId?: string;
        fillType?: string;
        cpStart?: CourseplayStart;
        cpLane?: number;
      },
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
    courseplay,
    bridgeStatus,
    connection,
    lastResult,
    error,
    sendCommand,
    enabledFarmIds,
    setFarmEnabled,
    subscribeNotifications,
    focusVehicle,
    focus,
    isLive: connection === "connected" && state !== null,
  };
}
