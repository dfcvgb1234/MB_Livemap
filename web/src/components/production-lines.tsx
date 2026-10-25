"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ProductionLine } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mb-livemap-hide-disabled-lines";

export function isDisabledProductionLine(line: Pick<ProductionLine, "status" | "enabled">) {
  if (line.enabled === false) return true;
  const status = (line.status ?? "").toUpperCase();
  return status === "INACTIVE" || status === "DISABLED" || status === "OFF";
}

export function disabledProductionCount(lines: ProductionLine[]) {
  return lines.filter(isDisabledProductionLine).length;
}

export function productionLineLabel(line: Pick<ProductionLine, "status" | "enabled">) {
  if (isDisabledProductionLine(line)) return "Off";
  const status = (line.status ?? "").toUpperCase();
  if (status === "RUNNING" || status === "ACTIVE") return "Running";
  if (status === "MISSING_INPUTS") return "Needs inputs";
  if (status === "NO_OUTPUT_SPACE") return "Storage full";
  if (!line.status) return "Unknown";
  return line.status;
}

export function productionLineTone(line: Pick<ProductionLine, "status" | "enabled">): "ok" | "warn" | "full" | "muted" {
  if (isDisabledProductionLine(line)) return "muted";
  const status = (line.status ?? "").toUpperCase();
  if (status === "RUNNING" || status === "ACTIVE") return "ok";
  if (status === "MISSING_INPUTS") return "warn";
  if (status === "NO_OUTPUT_SPACE") return "full";
  return "muted";
}

function readHiddenIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** Per production point. The choice is remembered on this browser. */
export function useHiddenProductionLines() {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  useEffect(() => {
    setHiddenIds(readHiddenIds());
  }, []);
  const hides = useCallback((id: string) => hiddenIds.includes(id), [hiddenIds]);
  const toggle = useCallback((id: string) => {
    setHiddenIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return { hides, toggle };
}

export function HideDisabledLinesButton({
  pressed,
  onToggle,
  tone,
}: {
  pressed: boolean;
  onToggle: () => void;
  tone: "light" | "dark";
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={pressed ? "Show disabled production lines" : "Hide disabled production lines"}
      title={pressed ? "Show disabled lines" : "Hide disabled lines"}
      onClick={onToggle}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md",
        tone === "light"
          ? pressed
            ? "bg-stone-800 text-white"
            : "text-stone-500 hover:bg-stone-100"
          : pressed
            ? "bg-[#e2b657] text-[#2a2112]"
            : "text-[#b7b1a4] hover:bg-white/10",
      )}
    >
      {pressed ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
    </button>
  );
}
