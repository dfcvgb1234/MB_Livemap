"use client";

import {
  HideDisabledLinesButton,
  disabledProductionCount,
  isDisabledProductionLine,
  productionLineLabel,
  productionLineTone,
  useHiddenProductionLines,
} from "@/components/production-lines";
import type { AnimalHusbandry, Production, ProductionFill } from "@/lib/types";

function formatAmount(value: number | null) {
  if (value == null) return "—";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString();
}

function FillList({ fills }: { fills: ProductionFill[] }) {
  if (fills.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {fills.map((fill) => {
        const percent =
          fill.fillLevel != null && fill.capacity != null && fill.capacity > 0
            ? Math.max(0, Math.min(100, (fill.fillLevel / fill.capacity) * 100))
            : 0;
        const amount =
          fill.capacity != null && fill.capacity > 0
            ? `${formatAmount(fill.fillLevel)} / ${formatAmount(fill.capacity)} L`
            : fill.fillLevel != null
              ? `${formatAmount(fill.fillLevel)} L`
              : "—";
        return (
          <div key={fill.name}>
            <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
              <span>{fill.name}</span>
              <span>{amount}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <i className="block h-full bg-[#e2b657]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TONE_CLASS = {
  ok: "text-[#8fb56a]",
  warn: "text-[#e2b657]",
  full: "text-[#d9783c]",
  muted: "text-[#b7b1a4]",
} as const;

function statusClass(status: string | null) {
  const value = (status ?? "").toUpperCase();
  if (value === "RUNNING" || value === "ACTIVE") return TONE_CLASS.ok;
  if (value === "MISSING_INPUTS") return TONE_CLASS.warn;
  if (value === "NO_OUTPUT_SPACE") return TONE_CLASS.full;
  return TONE_CLASS.muted;
}

function statusLabel(status: string | null) {
  if (status === "active") return "Running";
  if (status === "idle") return "Off";
  if (!status) return "Unknown";
  return status;
}

function displayName(value: string | null | undefined) {
  if (!value) return "";
  if (value === value.toUpperCase() && /[A-Z]/.test(value)) {
    return value
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return value;
}

export function ProductionCards({ productions }: { productions: Production[] }) {
  const owned = productions.filter((point) => point.status !== "unowned");
  const hiddenLines = useHiddenProductionLines();
  return (
    <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
      <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">Productions</h2>
      {owned.length === 0 ? (
        <p className="mt-2.5 text-[13px] text-[#b7b1a4]">No owned production points</p>
      ) : (
        owned.map((point) => {
          const lines = point.lines ?? [];
          const disabledCount = disabledProductionCount(lines);
          const hideDisabled = hiddenLines.hides(point.id);
          const shown = hideDisabled ? lines.filter((line) => !isDisabledProductionLine(line)) : lines;
          const fills = [...point.inputs, ...point.outputs];
          return (
            <article key={point.id} className="border-t border-white/10 py-2.5 first:border-t-0 first:pt-2">
              <div className="mb-1 flex items-center justify-between gap-2.5">
                <strong>{point.name}</strong>
                <span className="flex items-center gap-1.5">
                  {disabledCount > 0 ? (
                    <HideDisabledLinesButton
                      pressed={hideDisabled}
                      tone="dark"
                      onToggle={() => hiddenLines.toggle(point.id)}
                    />
                  ) : null}
                  {lines.length === 0 ? (
                    <span className={`text-[13px] ${statusClass(point.status)}`}>{statusLabel(point.status)}</span>
                  ) : null}
                </span>
              </div>
              {shown.map((line, index) => (
                <div key={`${line.name}-${index}`} className="mt-0.5 flex items-baseline justify-between gap-2.5 text-[13px]">
                  <span>{line.name}</span>
                  <span className={TONE_CLASS[productionLineTone(line)]}>{productionLineLabel(line)}</span>
                </div>
              ))}
              {hideDisabled && disabledCount > 0 ? (
                <p className="mt-1 text-[12px] text-[#b7b1a4]">
                  {disabledCount} disabled {disabledCount === 1 ? "line" : "lines"} hidden
                </p>
              ) : null}
              <FillList fills={fills} />
            </article>
          );
        })
      )}
    </section>
  );
}

function percent(value: number | null) {
  if (value == null) return null;
  const scaled = value <= 1 ? value * 100 : value;
  return Math.round(scaled);
}

export function AnimalCards({ animals }: { animals: AnimalHusbandry[] }) {
  return (
    <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
      <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">Animals</h2>
      {animals.length === 0 ? (
        <p className="mt-2.5 text-[13px] text-[#b7b1a4]">No owned animal pens</p>
      ) : (
        animals.map((pen) => {
          const health = percent(pen.health);
          const productivity = percent(pen.productivity);
          const typeName = displayName(pen.animalType) || "Animals";
          const herds = pen.herds ?? [];
          const showHerds =
            herds.length > 1 || (herds.length === 1 && displayName(herds[0].name) !== typeName);
          const countLabel =
            pen.count == null
              ? "—"
              : pen.capacity != null
                ? `${pen.count} / ${pen.capacity}`
                : String(pen.count);
          return (
            <article key={pen.id} className="border-t border-white/10 py-2.5 first:border-t-0 first:pt-2">
              <div className="mb-1 flex items-baseline justify-between gap-2.5">
                <strong>{pen.name}</strong>
                <span className="text-[13px] text-[#b7b1a4]">{typeName}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-[13px]">
                <span>{typeName}</span>
                <span>{countLabel}</span>
              </div>
              {health != null ? (
                <div className="mt-1 flex items-baseline justify-between text-[13px]">
                  <span>Health</span>
                  <span>{health}%</span>
                </div>
              ) : null}
              {productivity != null ? (
                <div className="mt-1 flex items-baseline justify-between text-[13px]">
                  <span>Productivity</span>
                  <span>{productivity}%</span>
                </div>
              ) : null}
              {showHerds
                ? herds.map((herd) => (
                    <div key={herd.name} className="mt-1 flex items-baseline justify-between text-[13px]">
                      <span>{displayName(herd.name)}</span>
                      <span>{herd.count}</span>
                    </div>
                  ))
                : null}
              {pen.palletBlocked ? (
                <div className="mt-1 flex items-baseline justify-between text-[13px]">
                  <span>Pallets</span>
                  <span className="text-[#d9783c]">Too many pallets</span>
                </div>
              ) : null}
              <FillList fills={pen.fills ?? []} />
            </article>
          );
        })
      )}
    </section>
  );
}
