"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useLivemapContext } from "@/components/livemap-provider";
import { useSettings } from "@/components/settings-provider";
import { useFillAlerts, useProductionAlerts } from "@/hooks/use-fill-alerts";
import {
  loadHistory,
  prependHistory,
  saveHistory,
  type HistoryEntry,
} from "@/lib/notification-history";
import { channelEnabled, staysUntilDismissed, type ToastItem } from "@/lib/notifications";
import type { LivemapNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

type NotificationContextValue = {
  history: HistoryEntry[];
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  clearHistory: () => void;
  dismiss: (id: string) => void;
  toasts: ToastItem[];
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function adChannel(note: LivemapNotification): ToastItem["channel"] {
  if (note.kind === "arrived") return "adArrived";
  if (note.kind === "stuck") return "adStuck";
  if (note.kind === "finished") return "cpFinished";
  return "adProblem";
}

const LEVEL_CLASS = {
  info: "border-[#e2b657]",
  warn: "border-[#d9783c]",
  error: "border-[#d46a6a]",
} as const;

const AUTO_DISMISS_MS = 8000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { subscribeNotifications } = useLivemapContext();
  const { settings, ready } = useSettings();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HistoryEntry[]>([]);
  const recent = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const toastsRef = useRef<ToastItem[]>([]);
  const settingsRef = useRef(settings);
  const readyRef = useRef(ready);
  settingsRef.current = settings;
  readyRef.current = ready;
  toastsRef.current = toasts;

  useEffect(() => {
    const stored = loadHistory();
    setHistory((current) => {
      const seen = new Set(current.map((entry) => entry.id));
      const next = [...current, ...stored.filter((entry) => !seen.has(entry.id))].slice(0, 200);
      historyRef.current = next;
      saveHistory(next);
      return next;
    });
  }, []);

  const remember = useCallback((toast: ToastItem) => {
    const entry: HistoryEntry = { ...toast, at: Date.now() };
    setHistory(() => {
      const next = prependHistory(historyRef.current, entry);
      historyRef.current = next;
      saveHistory(next);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: string) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    saveHistory([]);
    setHistory([]);
  }, []);

  const push = useCallback(
    (toast: ToastItem) => {
      if (!readyRef.current) return;
      if (!channelEnabled(toast.channel, settingsRef.current.notifications)) return;
      const key = `${toast.channel}:${toast.vehicleId ?? ""}:${toast.title}:${toast.body}`;
      const last = recent.current.get(key) ?? 0;
      const now = Date.now();
      if (now - last < 4000) return;
      recent.current.set(key, now);
      remember(toast);
      setToasts((current) => [...current.filter((item) => item.id !== toast.id), toast]);
      if (!staysUntilDismissed(toast.channel, settingsRef.current.notifications)) {
        scheduleDismiss(toast.id);
      }
    },
    [remember, scheduleDismiss],
  );

  useFillAlerts(push);
  useProductionAlerts(push);

  useEffect(() => {
    return subscribeNotifications((note) => {
      push({
        id: note.id,
        channel: adChannel(note),
        title: note.vehicleName || "AutoDrive",
        body: note.text,
        level: note.level,
        vehicleId: note.vehicleId,
      });
    });
  }, [push, subscribeNotifications]);

  useEffect(() => {
    for (const toast of toastsRef.current) {
      const stay = staysUntilDismissed(toast.channel, settings.notifications);
      const timer = timers.current.get(toast.id);
      if (stay && timer) {
        clearTimeout(timer);
        timers.current.delete(toast.id);
      } else if (!stay && !timer) {
        scheduleDismiss(toast.id);
      }
    }
  }, [settings.notifications, scheduleDismiss]);

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{ history, historyOpen, setHistoryOpen, clearHistory, dismiss, toasts }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationCenter() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationCenter must be used within NotificationProvider");
  return ctx;
}

export function ToastStack() {
  const { toasts, dismiss } = useNotificationCenter();
  const { focusVehicle } = useLivemapContext();
  const router = useRouter();
  const pathname = usePathname();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-auto fixed top-[4.75rem] left-1/2 z-[80] flex max-h-[min(70dvh,32rem)] w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 overflow-y-auto"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-toast={toast.channel}
          className={cn(
            "flex items-start gap-2 rounded-xl border-l-4 bg-[#221e18] px-3 py-2.5 text-[#f3efe4] shadow-[0_16px_40px_rgba(0,0,0,0.35)]",
            LEVEL_CLASS[toast.level],
          )}
        >
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              if (!toast.vehicleId) return;
              focusVehicle(toast.vehicleId);
              if (pathname !== "/") router.push("/");
            }}
          >
            <span className="block truncate text-sm font-semibold">{toast.title}</span>
            <span className="mt-0.5 block text-[13px] text-[#b7b1a4]">{toast.body}</span>
          </button>
          <button
            type="button"
            aria-label={`Dismiss ${toast.title}`}
            className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-white/10"
            onClick={() => dismiss(toast.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
