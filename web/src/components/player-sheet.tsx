"use client";

import type { FarmInfo, MapPlayer } from "@/lib/types";

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function MoneyStat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <dt className="text-[11px] font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium text-[#f3efe4]">{formatMoney(value)}</dd>
    </div>
  );
}

/** Farm membership and the farm account for the selected player. */
export function PlayerSheet({ player, farm }: { player: MapPlayer | null; farm: FarmInfo | null }) {
  if (player == null) return null;
  const onFarm = farm != null;
  return (
    <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
      <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">{player.name}</h2>
      <p className="mt-1 flex items-center gap-2 text-[13px] text-[#b7b1a4]">
        {onFarm && farm.color ? (
          <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: farm.color }} />
        ) : null}
        {onFarm ? farm.name : "Not on a farm"}
      </p>
      {onFarm ? (
        <dl className="mt-3 grid grid-cols-3 gap-2">
          <MoneyStat label="Balance" value={farm.balance} />
          <MoneyStat label="Loan" value={farm.loan} />
          <MoneyStat label="Equity" value={farm.equity} />
        </dl>
      ) : (
        <p className="mt-3 text-[13px] text-[#b7b1a4]">This player has no farm account yet.</p>
      )}
    </section>
  );
}
