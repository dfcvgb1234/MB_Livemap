"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLivemapContext } from "@/components/livemap-provider";
import {
  clearMapOverlay,
  fetchMapOverlay,
  mapOverlayImageUrl,
  skipMapOverlay as skipMapOverlayRequest,
  uploadMapOverlay,
  type MapOverlayStatus,
} from "@/lib/map-overlay";
import { DEFAULT_COLORS, type MachineColorKey } from "@/lib/machine-colors";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
  type MapImageFit,
  type NotificationSettings,
} from "@/lib/settings";

type SettingsContextValue = {
  settings: AppSettings;
  mapImageUrl: string | null;
  mapImageEditable: boolean;
  canClearMapImage: boolean;
  clearMapImageLabel: string;
  overlayPrompt: boolean;
  overlayDetail: string | null;
  imageError: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  ready: boolean;
  setMapImageFit: (fit: MapImageFit) => void;
  setColor: (key: MachineColorKey, hex: string) => void;
  resetColors: () => void;
  setNotifications: (patch: Partial<NotificationSettings>) => void;
  setMapImageFile: (file: File) => Promise<void>;
  resetMapImage: () => Promise<void>;
  skipMapOverlay: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { state } = useLivemapContext();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [overlay, setOverlay] = useState<MapOverlayStatus | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);
  const fetchGen = useRef(0);
  const liveMap = state?.source === "mod" && !!state.mapName;
  const mockMap = state?.source === "mock";

  useEffect(() => {
    const loaded = loadSettings();
    settingsRef.current = loaded;
    setSettings(loaded);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!liveMap) {
      setOverlay(null);
      return;
    }
    const gen = ++fetchGen.current;
    let cancelled = false;
    setOverlay(null);
    fetchMapOverlay()
      .then((data) => {
        if (cancelled || gen !== fetchGen.current) return;
        setOverlay(data);
        setImageError(null);
      })
      .catch(() => {
        if (cancelled || gen !== fetchGen.current) return;
        setOverlay(null);
        setImageError("Could not check the map picture");
      });
    return () => {
      cancelled = true;
    };
  }, [liveMap, state?.mapName, state?.customEnvironment, state?.mapDirectory, state?.missionDirectory]);

  const commit = useCallback((updater: (current: AppSettings) => AppSettings) => {
    const next = updater(settingsRef.current);
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
  }, []);

  const setMapImageFit = useCallback(
    (fit: MapImageFit) => {
      commit((current) => ({ ...current, mapImageFit: fit }));
    },
    [commit],
  );

  const setColor = useCallback(
    (key: MachineColorKey, hex: string) => {
      commit((current) => ({ ...current, colors: { ...current.colors, [key]: hex } }));
    },
    [commit],
  );

  const resetColors = useCallback(() => {
    commit((current) => ({ ...current, colors: { ...DEFAULT_COLORS } }));
  }, [commit]);

  const setNotifications = useCallback(
    (patch: Partial<NotificationSettings>) => {
      commit((current) => ({ ...current, notifications: { ...current.notifications, ...patch } }));
    },
    [commit],
  );

  const setMapImageFile = useCallback(async (file: File) => {
    const gen = ++fetchGen.current;
    try {
      const data = await uploadMapOverlay(file);
      if (gen !== fetchGen.current) return;
      setOverlay(data);
      setImageError(null);
    } catch (err) {
      if (gen !== fetchGen.current) return;
      setImageError(err instanceof Error ? err.message : "Could not use that file");
    }
  }, []);

  const resetMapImage = useCallback(async () => {
    const gen = ++fetchGen.current;
    try {
      const data = await clearMapOverlay();
      if (gen !== fetchGen.current) return;
      setOverlay(data);
      setImageError(null);
    } catch (err) {
      if (gen !== fetchGen.current) return;
      setImageError(err instanceof Error ? err.message : "Could not remove the map picture");
    }
  }, []);

  const skipMapOverlay = useCallback(async () => {
    const gen = ++fetchGen.current;
    try {
      const data = await skipMapOverlayRequest();
      if (gen !== fetchGen.current) return;
      setOverlay(data);
      setImageError(null);
    } catch (err) {
      if (gen !== fetchGen.current) return;
      setImageError(err instanceof Error ? err.message : "Could not skip the map picture");
    }
  }, []);

  const mapImageUrl = mockMap
    ? "/PDA.png"
    : overlay?.status === "ready"
      ? mapOverlayImageUrl(overlay.revision)
      : null;
  const canClearMapImage = overlay?.status === "skipped" || overlay?.source === "custom";

  return (
    <SettingsContext.Provider
      value={{
        settings,
        mapImageUrl,
        mapImageEditable: liveMap,
        canClearMapImage,
        clearMapImageLabel: overlay?.status === "skipped" ? "Look for a map picture" : "Remove map picture",
        overlayPrompt: liveMap && overlay?.status === "missing",
        overlayDetail: overlay?.error ?? null,
        imageError,
        open,
        setOpen,
        ready,
        setMapImageFit,
        setColor,
        resetColors,
        setNotifications,
        setMapImageFile,
        resetMapImage,
        skipMapOverlay,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
