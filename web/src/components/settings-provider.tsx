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
  BUILTIN_PROFILES,
  MAX_CUSTOM_PROFILES,
  NORMAL_INTERVALS,
  SETTINGS_GROUPS,
  nextCustomName,
  type PerformanceProfile,
  type SettingsGroupInfo,
  type UpdateGroup,
} from "@/lib/performance";
import { fetchSettings, saveSettings as saveSettingsApi, type SettingsPayload } from "@/lib/settings-api";
import {
  DEFAULT_SETTINGS,
  clearLegacySettings,
  readLegacySettings,
  type AppSettings,
  type MapImageFit,
  type NotificationSettings,
} from "@/lib/settings";

type SettingsContextValue = {
  settings: AppSettings;
  builtins: PerformanceProfile[];
  groups: SettingsGroupInfo[];
  mapImageUrl: string | null;
  mapImageEditable: boolean;
  canClearMapImage: boolean;
  clearMapImageLabel: string;
  overlayPrompt: boolean;
  overlayDetail: string | null;
  imageError: string | null;
  saveError: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  ready: boolean;
  setMapImageFit: (fit: MapImageFit) => void;
  setColor: (key: MachineColorKey, hex: string) => void;
  resetColors: () => void;
  setNotifications: (patch: Partial<NotificationSettings>) => void;
  setActiveProfile: (id: string) => void;
  createProfile: () => void;
  renameProfile: (id: string, name: string) => void;
  deleteProfile: (id: string) => void;
  setProfileInterval: (id: string, group: UpdateGroup, ms: number) => void;
  retrySave: () => void;
  setMapImageFile: (file: File) => Promise<void>;
  resetMapImage: () => Promise<void>;
  skipMapOverlay: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { state } = useLivemapContext();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [builtins, setBuiltins] = useState<PerformanceProfile[]>(BUILTIN_PROFILES);
  const [groups, setGroups] = useState<SettingsGroupInfo[]>(SETTINGS_GROUPS);
  const [overlay, setOverlay] = useState<MapOverlayStatus | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);
  const readyRef = useRef(false);
  const fetchGen = useRef(0);
  const saveGen = useRef(0);
  const pendingRef = useRef<AppSettings | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef(Promise.resolve());
  const liveMap = state?.source === "mod" && !!state.mapName;
  const mockMap = state?.source === "mock";

  const applyPayload = useCallback((payload: SettingsPayload) => {
    if (pendingRef.current) return;
    settingsRef.current = payload.settings;
    setSettings(payload.settings);
    setBuiltins(payload.builtins);
    setGroups(payload.groups);
    setSaveError(null);
  }, []);

  const loadFromServer = useCallback(async () => {
    const payload = await fetchSettings();
    if (payload.fresh) {
      const legacy = readLegacySettings();
      if (legacy) {
        const saved = await saveSettingsApi({
          ...payload.settings,
          mapImageFit: legacy.mapImageFit,
          colors: legacy.colors,
          notifications: legacy.notifications,
        });
        clearLegacySettings();
        applyPayload(saved);
        return;
      }
    }
    applyPayload(payload);
  }, [applyPayload]);

  const flush = useCallback((snapshot: AppSettings) => {
    const id = ++saveGen.current;
    chainRef.current = chainRef.current.then(async () => {
      if (pendingRef.current !== snapshot) return;
      try {
        const saved = await saveSettingsApi(snapshot);
        if (id !== saveGen.current || pendingRef.current !== snapshot) return;
        pendingRef.current = null;
        applyPayload(saved);
      } catch {
        if (id !== saveGen.current) return;
        setSaveError("Settings could not be saved.");
      }
    });
  }, [applyPayload]);

  const commit = useCallback(
    (updater: (current: AppSettings) => AppSettings) => {
      if (!readyRef.current) return;
      const next = updater(settingsRef.current);
      settingsRef.current = next;
      pendingRef.current = next;
      setSettings(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const snapshot = pendingRef.current;
        if (snapshot) flush(snapshot);
      }, 250);
    },
    [flush],
  );

  const retrySave = useCallback(() => {
    if (pendingRef.current) {
      flush(pendingRef.current);
      return;
    }
    void loadFromServer().catch(() => {
      setSaveError("Settings could not be loaded. Start the livemap server, then open settings again.");
    });
  }, [flush, loadFromServer]);

  useEffect(() => {
    let cancelled = false;
    void loadFromServer()
      .catch(() => {
        if (!cancelled) {
          setSaveError("Settings could not be loaded. Start the livemap server, then open settings again.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          readyRef.current = true;
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadFromServer]);

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

  const setActiveProfile = useCallback(
    (id: string) => {
      commit((current) => ({ ...current, performance: { ...current.performance, activeId: id } }));
    },
    [commit],
  );

  const createProfile = useCallback(() => {
    commit((current) => {
      if (current.performance.custom.length >= MAX_CUSTOM_PROFILES) return current;
      const builtin = builtins.find((profile) => profile.id === current.performance.activeId);
      const customSource = current.performance.custom.find((profile) => profile.id === current.performance.activeId);
      const source = builtin?.intervalsMs ?? customSource?.intervalsMs ?? NORMAL_INTERVALS;
      const id = crypto.randomUUID();
      return {
        ...current,
        performance: {
          activeId: id,
          custom: [
            ...current.performance.custom,
            {
              id,
              name: nextCustomName(current.performance.custom.map((profile) => profile.name)),
              intervalsMs: { ...source },
            },
          ],
        },
      };
    });
  }, [builtins, commit]);

  const renameProfile = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      commit((current) => ({
        ...current,
        performance: {
          ...current.performance,
          custom: current.performance.custom.map((profile) => (profile.id === id ? { ...profile, name: trimmed } : profile)),
        },
      }));
    },
    [commit],
  );

  const deleteProfile = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        performance: {
          activeId: current.performance.activeId === id ? "normal" : current.performance.activeId,
          custom: current.performance.custom.filter((profile) => profile.id !== id),
        },
      }));
    },
    [commit],
  );

  const setProfileInterval = useCallback(
    (id: string, group: UpdateGroup, ms: number) => {
      commit((current) => ({
        ...current,
        performance: {
          ...current.performance,
          custom: current.performance.custom.map((profile) =>
            profile.id === id ? { ...profile, intervalsMs: { ...profile.intervalsMs, [group]: ms } } : profile,
          ),
        },
      }));
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
        builtins,
        groups,
        mapImageUrl,
        mapImageEditable: liveMap,
        canClearMapImage,
        clearMapImageLabel: overlay?.status === "skipped" ? "Look for a map picture" : "Remove map picture",
        overlayPrompt: liveMap && overlay?.status === "missing",
        overlayDetail: overlay?.error ?? null,
        imageError,
        saveError,
        open,
        setOpen,
        ready,
        setMapImageFit,
        setColor,
        resetColors,
        setNotifications,
        setActiveProfile,
        createProfile,
        renameProfile,
        deleteProfile,
        setProfileInterval,
        retrySave,
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
