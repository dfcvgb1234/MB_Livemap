"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { ConnectButton, ConnectProvider, ConnectSheet, ModBanner } from "@/components/connect-sheet";
import { LivemapProvider, useLivemapContext } from "@/components/livemap-provider";
import { MapOverlayPrompt } from "@/components/map-overlay-prompt";
import { NotificationHistorySheet } from "@/components/notification-history-sheet";
import { SettingsProvider, useSettings } from "@/components/settings-provider";
import { SettingsDialog } from "@/components/settings-dialog";
import { NotificationProvider, ToastStack, useNotificationCenter } from "@/components/toast-stack";
import { driverPageLabel } from "@/lib/driver-page";
import { cn } from "@/lib/utils";

function formatUpdated(ts: number | null | undefined) {
  if (!ts) return "No update yet";
  return `Updated ${new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { state, bridgeStatus, autoDrive, courseplay } = useLivemapContext();
  const driverLabel = driverPageLabel(autoDrive?.available === true, courseplay?.available === true);
  const nav = [
    { href: "/", label: "Livemap" },
    ...(driverLabel ? [{ href: "/autodrive", label: driverLabel }] : []),
  ];
  const { setOpen } = useSettings();
  const { history, setHistoryOpen } = useNotificationCenter();
  const pathname = usePathname();
  const vehicles = state?.vehicles.length ?? 0;
  const fields = state?.fields.length ?? 0;

  return (
    <div className="flex h-svh flex-col bg-[radial-gradient(circle_at_top_left,rgba(226,182,87,0.08),transparent_28%),#17140f] text-[#f3efe4]">
      <ModBanner />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-[18px] py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-[42px] shrink-0 place-items-center rounded-lg bg-[#e2b657] text-base font-bold text-[#2a2112]">
            MB
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{state?.mapName ?? "Livemap"}</h1>
            <p className="text-[13px] text-[#b7b1a4]">
              {vehicles} vehicles · {fields} fields
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-1 rounded-xl bg-black/25 p-1">
          {nav.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
                  active ? "bg-[#e2b657] text-[#2a2112]" : "text-[#f3efe4] hover:bg-white/10",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2.5">
          {bridgeStatus?.mockActive ? (
            <span className="rounded-full bg-[#d9783c] px-2 py-1 text-xs font-bold text-[#2a160c]">
              Mock
            </span>
          ) : null}
          <span className="text-[13px] text-[#b7b1a4]">{formatUpdated(state?.ts)}</span>
          <button
            type="button"
            aria-label={history.length > 0 ? `Notifications, ${history.length}` : "Notifications"}
            onClick={() => setHistoryOpen(true)}
            className="relative grid size-10 place-items-center rounded-lg text-[#f3efe4] hover:bg-white/10"
          >
            <Bell className="size-5" aria-hidden />
            {history.length > 0 ? (
              <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-[#e2b657] px-1 text-[10px] font-bold text-[#2a2112]">
                {history.length > 99 ? "99+" : history.length}
              </span>
            ) : null}
          </button>
          <ConnectButton />
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setOpen(true)}
            className="grid size-10 place-items-center rounded-lg text-[#f3efe4] hover:bg-white/10"
          >
            <Settings className="size-5" aria-hidden />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto [container-type:size] [overflow-anchor:none]">{children}</div>
      <ToastStack />
      <NotificationHistorySheet />
      <SettingsDialog />
      <ConnectSheet />
      <MapOverlayPrompt />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LivemapProvider>
      <SettingsProvider>
        <NotificationProvider>
          <ConnectProvider>
            <ShellInner>{children}</ShellInner>
          </ConnectProvider>
        </NotificationProvider>
      </SettingsProvider>
    </LivemapProvider>
  );
}
