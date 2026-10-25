"use client";

import { useCallback, useEffect, useState } from "react";
import type { CommandResult, Field, FieldPointSample, FieldPrecision, WhitelistAction } from "@/lib/types";

function fieldNumber(field: Field) {
  if (field.name != null && field.name.length > 0) return field.name;
  return field.id.replace(/^field[-_]?/i, "");
}

function formatHa(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`;
}

function formatAmount(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function cropStateLine(field: Field) {
  const stage =
    field.growthState != null && field.growthMax != null && field.growthMax > 0
      ? `${field.growthState}/${field.growthMax}`
      : null;
  if (field.cropState == null || field.cropState.length === 0) return stage ?? "—";
  if (field.cropState === "Growing" && stage != null) return `${field.cropState} · ${stage}`;
  return field.cropState;
}

function fertilizerDetail(field: Field) {
  if (field.fertilizerLevel == null || field.fertilizerMax == null) return null;
  return `${field.fertilizerLevel}/${field.fertilizerMax}`;
}

function phLine(precision: FieldPrecision) {
  if (precision.ph == null || !Number.isFinite(precision.ph)) return null;
  const amount = formatAmount(precision.ph);
  if (precision.phStatus != null && precision.phStatus.length > 0) return `${amount} · ${precision.phStatus}`;
  return amount;
}

function nitrogenLine(precision: FieldPrecision) {
  if (precision.nitrogen == null || !Number.isFinite(precision.nitrogen)) return null;
  const current = formatAmount(precision.nitrogen);
  if (precision.nitrogenTarget == null || !Number.isFinite(precision.nitrogenTarget)) return `${current} kg/ha`;
  return `${current}/${formatAmount(precision.nitrogenTarget)} kg/ha`;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="text-[#b7b1a4]">{label}</dt>
      <dd className="text-right font-medium text-[#f3efe4]">{value}</dd>
    </div>
  );
}

function WeedRow({ value }: { value: string | null | undefined }) {
  if (value == null || value.length === 0) return null;
  const tone =
    value === "None" ? "text-[#8fb56a]" : value === "Withered" ? "text-[#b7b1a4]" : "font-medium text-[#e2b657]";
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="text-[#b7b1a4]">Weeds</dt>
      <dd className={`text-right ${tone}`}>{value}</dd>
    </div>
  );
}

function NeedRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: boolean | null | undefined;
  detail?: string | null;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="text-[#b7b1a4]">{label}</dt>
      <dd className={value ? "text-right font-medium text-[#e2b657]" : "text-right text-[#8fb56a]"}>
        {value ? "Yes" : "No"}
        {detail != null && detail.length > 0 ? ` · ${detail}` : ""}
      </dd>
    </div>
  );
}

function PrecisionBlock({ precision }: { precision: FieldPrecision }) {
  const ph = phLine(precision);
  const nitrogen = nitrogenLine(precision);
  const soil = precision.soilType != null && precision.soilType.length > 0 ? precision.soilType : null;
  if (soil == null && ph == null && nitrogen == null) return null;
  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <h3 className="text-[11px] font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">Precision Farming</h3>
      <dl className="mt-2 space-y-1.5">
        {soil != null ? <StatRow label="Soil" value={soil} /> : null}
        {ph != null ? <StatRow label="pH" value={ph} /> : null}
        {nitrogen != null ? <StatRow label="Nitrogen" value={nitrogen} /> : null}
      </dl>
    </div>
  );
}

const CLEARED_SAMPLE: FieldPointSample = {
  fruitType: null,
  growthState: null,
  growthMax: null,
  cropState: null,
  needsRolling: null,
  needsFertilizer: null,
  fertilizerLevel: null,
  fertilizerMax: null,
  needsSpraying: null,
  weeds: null,
  needsPlowing: null,
  needsLime: null,
  needsStones: null,
  precisionFarming: null,
};

/** Field identity stays. Crop, care, and Precision Farming come from the click. */
export function fieldFromClick(field: Field, sample: FieldPointSample | null) {
  return { ...field, ...CLEARED_SAMPLE, ...(sample ?? {}) };
}

export function useFieldClickSample(
  sendCommand: (
    action: WhitelistAction,
    vehicleId: string,
    targetId?: string,
    extra?: { x?: number; z?: number },
  ) => string,
  lastResult: CommandResult | null,
  connected: boolean,
) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [sample, setSample] = useState<FieldPointSample | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (lastResult == null || requestId == null || lastResult.id !== requestId) return;
    setSample(lastResult.ok && lastResult.field != null ? lastResult.field : null);
    setPending(false);
  }, [lastResult, requestId]);

  useEffect(() => {
    if (!pending || requestId == null) return;
    const timer = window.setTimeout(() => setPending(false), 10000);
    return () => window.clearTimeout(timer);
  }, [pending, requestId]);

  const select = useCallback(
    (field: Field, point: { x: number; z: number }) => {
      setFieldId(field.id);
      setSample(null);
      const id = connected ? sendCommand("field.sample", "", undefined, point) : "";
      setRequestId(id === "" ? null : id);
      setPending(id !== "");
    },
    [connected, sendCommand],
  );

  const clear = useCallback(() => {
    setFieldId(null);
    setSample(null);
    setRequestId(null);
    setPending(false);
  }, []);

  return { fieldId, sample, pending, select, clear };
}

/** Field size, crop state, and care needs for the field selected on the map. */
export function FieldSheet({ field, sampling = false }: { field: Field | null; sampling?: boolean }) {
  if (field == null) return null;
  const crop = sampling ? "…" : field.fruitType != null && field.fruitType.length > 0 ? field.fruitType : "Empty";
  const owned = field.owned == null ? null : field.owned ? "Owned" : "Not owned";
  return (
    <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
      <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">Field {fieldNumber(field)}</h2>
      <p className="mt-1 text-[13px] text-[#b7b1a4]">
        {crop}
        {owned != null ? ` · ${owned}` : ""}
      </p>
      <dl className="mt-3 space-y-1.5">
        <StatRow label="Size" value={formatHa(field.areaHa)} />
        <StatRow label="Crop state" value={sampling ? "…" : cropStateLine(field)} />
        <NeedRow label="Needs rolling" value={field.needsRolling} />
        <NeedRow label="Needs fertilizer" value={field.needsFertilizer} detail={fertilizerDetail(field)} />
        <WeedRow value={field.weeds} />
        <NeedRow label="Needs spraying" value={field.needsSpraying} />
        <NeedRow label="Needs plowing" value={field.needsPlowing} />
        <NeedRow label="Needs lime" value={field.needsLime} />
        <NeedRow label="Needs stones" value={field.needsStones} />
      </dl>
      {field.precisionFarming != null ? <PrecisionBlock precision={field.precisionFarming} /> : null}
      <p className="mt-3 text-[11px] leading-snug text-[#8d877c]">Sampled at cursor click position</p>
    </section>
  );
}
