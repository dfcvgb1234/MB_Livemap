"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { clearMapImage, loadMapImage, saveMapImage } from "@/lib/map-image-store";
import { DEFAULT_COLORS, type MachineColorKey } from "@/lib/machine-colors";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
  type MapImageFit,
  type NotificationSettings,
} from "@/lib/settings";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

type SettingsContextValue = {
  settings: AppSettings;
  mapImageUrl: string | null;
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
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const urlRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);

  const replaceUrl = useCallback((next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setMapImageUrl(next);
  }, []);

  useEffect(() => {
    const loaded = loadSettings();
    settingsRef.current = loaded;
    setSettings(loaded);
    setReady(true);
    let cancelled = false;
    loadMapImage()
      .then((blob) => {
        if (cancelled || !blob) return;
        replaceUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) setImageError("Could not load the saved map image");
      });
    return () => {
      cancelled = true;
    };
  }, [replaceUrl]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

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

  const setMapImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setImageError("Choose a PNG, JPEG, or WebP image");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError("Image is larger than 20 MB");
        return;
      }
      try {
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || "image/png" });
        await saveMapImage(blob);
        replaceUrl(URL.createObjectURL(blob));
        setImageError(null);
      } catch {
        setImageError("Could not save that image");
      }
    },
    [replaceUrl],
  );

  const resetMapImage = useCallback(async () => {
    try {
      await clearMapImage();
      replaceUrl(null);
      setImageError(null);
    } catch {
      setImageError("Could not remove the map image");
    }
  }, [replaceUrl]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        mapImageUrl,
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
