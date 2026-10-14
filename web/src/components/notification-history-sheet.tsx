"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLivemapContext } from "@/components/livemap-provider";
import { useNotificationCenter } from "@/components/toast-stack";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ToastChannel } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const CHANNEL_LABEL: Record<ToastChannel, string> = {
  combineFull: "Combine",
  trailerFull: "Trailer",
  adArrived: "Arrived",
  adStuck: "Stuck",
  adProblem: "AutoDrive",
  productionMissing: "Production",
  productionFull: "Production",
};

const LEVEL_CLASS = {
  info: "border-[#e2b657]",
  warn: "border-[#d9783c]",
  error: "border-[#d46a6a]",
} as const;

function formatWhen(at: number) {
  return new Date(at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationHistorySheet() {
  const { history, historyOpen, setHistoryOpen, clearHistory } = useNotificationCenter();
  const { focusVehicle } = useLivemapContext();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
      <SheetContent
        side="right"
        className="h-full w-full border-white/10 bg-[#221e18] text-[#f3efe4] sm:max-w-md"
      >
        <SheetHeader className="pr-10">
          <SheetTitle className="text-lg text-[#f3efe4]">Notifications</SheetTitle>
          <SheetDescription className="text-[#b7b1a4]">
            Earlier alerts stay here until you clear them.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <button
            type="button"
            disabled={history.length === 0}
            onClick={clearHistory}
            className="min-h-10 w-full rounded-lg bg-white/10 px-3 text-sm font-semibold enabled:hover:bg-white/15 disabled:opacity-40"
          >
            Clear history
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {history.length === 0 ? (
            <p className="px-1 py-6 text-sm text-[#b7b1a4]">No notifications yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-xl border-l-4 bg-black/20 px-3 py-2.5 text-left",
                      LEVEL_CLASS[entry.level],
                    )}
                    onClick={() => {
                      if (!entry.vehicleId) return;
                      focusVehicle(entry.vehicleId);
                      setHistoryOpen(false);
                      if (pathname !== "/") router.push("/");
                    }}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-[11px] text-[#b7b1a4]">
                      <span>{CHANNEL_LABEL[entry.channel]}</span>
                      <span>{formatWhen(entry.at)}</span>
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold">{entry.title}</span>
                    <span className="mt-0.5 block text-[13px] text-[#b7b1a4]">{entry.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
