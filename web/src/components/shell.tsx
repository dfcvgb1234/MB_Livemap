"use client";

import { AppNav } from "@/components/app-nav";
import { ConnectionBanner } from "@/components/connection-banner";
import { LivemapProvider, useLivemapContext } from "@/components/livemap-provider";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { connection, bridgeStatus, error } = useLivemapContext();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#e8ebe3]">
      <header className="sticky top-0 z-40 border-b border-stone-300/60 bg-[#e8ebe3]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-stone-900">
                MB Livemap
              </p>
              <p className="text-xs text-stone-600">FS25 tablet dashboard</p>
            </div>
            <AppNav />
          </div>
          <ConnectionBanner
            connection={connection}
            bridgeStatus={bridgeStatus}
            error={error}
          />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-0 pb-8 pt-0 sm:px-4 sm:pt-4">
        {children}
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LivemapProvider>
      <ShellInner>{children}</ShellInner>
    </LivemapProvider>
  );
}
