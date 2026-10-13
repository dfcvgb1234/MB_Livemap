"use client";

import { useSyncExternalStore } from "react";
import { CROP_CALENDAR, MONTHS, fruitColor } from "@/lib/crop-calendar";
import type { Field } from "@/lib/types";
import { growthLabel } from "@/lib/crop-calendar";

type Props = {
  fields: Field[];
};

function subscribe() {
  return () => {};
}

function getMonth() {
  return new Date().getMonth() + 1;
}

function getServerMonth() {
  return 1;
}

export function CropCalendar({ fields }: Props) {
  const month = useSyncExternalStore(subscribe, getMonth, getServerMonth);
  const present = new Set(
    fields.map((f) => f.fruitType).filter(Boolean) as string[],
  );

  const rows =
    present.size > 0
      ? CROP_CALENDAR.filter((c) => present.has(c.fruit))
      : CROP_CALENDAR;

  return (
    <section className="rounded-2xl bg-stone-50/95 p-4 shadow-sm ring-1 ring-stone-200/80">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">
            Crop calendar
          </h2>
          <p className="text-sm text-stone-600">
            Sow / harvest windows for crops on your fields
          </p>
        </div>
        <span className="rounded-md bg-lime-100 px-2 py-1 text-xs font-medium text-lime-900">
          Month {month}
        </span>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-lg bg-stone-100 px-3 py-4 text-sm text-stone-600">
          No field data yet. When the mod reports fields, growth stages appear
          here alongside the seasonal calendar.
        </p>
      ) : (
        <ul className="mb-4 grid gap-2 sm:grid-cols-2">
          {fields.slice(0, 8).map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200"
            >
              <span className="flex items-center gap-2 font-medium text-stone-800">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: fruitColor(f.fruitType) }}
                />
                Field {f.id}
                <span className="font-normal text-stone-500">
                  {f.fruitType ?? "unknown crop"}
                </span>
              </span>
              <span className="text-xs text-stone-500">
                {growthLabel(f.growthState, f.growthMax)}
                {f.owned === false ? " · not owned" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-stone-50 px-2 py-1 text-left font-medium text-stone-600">
                Crop
              </th>
              {MONTHS.map((m, i) => (
                <th
                  key={`${m}-${i}`}
                  className={`px-1 py-1 text-center font-medium ${
                    i + 1 === month ? "text-lime-800" : "text-stone-500"
                  }`}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((crop) => (
              <tr key={crop.fruit}>
                <td className="sticky left-0 bg-stone-50 px-2 py-1.5 font-medium text-stone-800">
                  {crop.label}
                </td>
                {MONTHS.map((_, i) => {
                  const m = i + 1;
                  const sow = crop.sow.includes(m);
                  const harvest = crop.harvest.includes(m);
                  return (
                    <td key={m} className="px-1 py-1.5">
                      <div
                        className={`mx-auto h-6 w-full max-w-8 rounded ${
                          sow && harvest
                            ? "bg-gradient-to-r from-sky-400 to-amber-400"
                            : sow
                              ? "bg-sky-400"
                              : harvest
                                ? "bg-amber-400"
                                : i + 1 === month
                                  ? "bg-stone-200"
                                  : "bg-stone-100"
                        }`}
                        title={
                          sow && harvest
                            ? "Sow & harvest"
                            : sow
                              ? "Sow"
                              : harvest
                                ? "Harvest"
                                : ""
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex gap-4 text-xs text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-sky-400" /> Sow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-amber-400" /> Harvest
          </span>
        </div>
      </div>
    </section>
  );
}
