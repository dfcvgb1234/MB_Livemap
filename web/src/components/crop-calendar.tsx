"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CROP_CALENDAR, MONTHS, calendarKey } from "@/lib/crop-calendar";
import type { Field } from "@/lib/types";

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
  const frameRef = useRef<HTMLDivElement>(null);
  const [markerLeft, setMarkerLeft] = useState<number | null>(null);
  const present = new Set(
    fields
      .map((f) => calendarKey(f.fruitType))
      .filter((key): key is string => key != null),
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const headers = frame.querySelectorAll("th");
    const cropWidth = headers[0]?.getBoundingClientRect().width ?? 0;
    let monthsWidth = 0;
    for (let index = 1; index < headers.length; index += 1) {
      monthsWidth += headers[index].getBoundingClientRect().width;
    }
    const fraction = (month - 0.5) / 12;
    setMarkerLeft(cropWidth + fraction * monthsWidth);
  }, [month, fields.length]);

  return (
    <section className="mb-3 rounded-[14px] border border-white/10 bg-[#2b261e] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
      <h2 className="text-[15px] font-semibold tracking-[0.04em] uppercase">Crop calendar</h2>
      <p className="mt-1 text-[13px] text-[#b7b1a4]">Month {month}</p>
      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-2 text-xs text-[#b7b1a4]">
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3.5 rounded-[3px] bg-[#8fb56a]/85" /> Plant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3.5 rounded-[3px] bg-[#d9783c]/90" /> Harvest
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3.5 rounded-[3px] bg-[#e2c14a]" /> Plant and harvest
        </span>
      </div>
      <div className="mt-2.5 overflow-x-auto">
        <div ref={frameRef} className="relative w-max min-w-full">
          <table className="w-max min-w-full border-separate border-spacing-y-[3px] text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-[2] min-w-[92px] bg-[#2b261e] px-1.5 py-1 text-left">
                  Crop
                </th>
                {MONTHS.map((name, index) => (
                  <th key={`${name}-${index}`} className="px-1.5 py-1 text-center">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CROP_CALENDAR.map((crop) => (
                <tr key={crop.fruit}>
                  <td className="sticky left-0 z-[2] bg-[#2b261e] px-1.5 py-1 text-left">
                    <span className="inline-flex items-center gap-1.5">
                      {present.has(crop.fruit) ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-[#8fb56a]" title="On the map" />
                      ) : null}
                      {crop.label}
                    </span>
                  </td>
                  {MONTHS.map((_, index) => {
                    const value = index + 1;
                    const sow = crop.sow.includes(value);
                    const harvest = crop.harvest.includes(value);
                    const title = sow && harvest ? "Plant / Harvest" : sow ? "Plant" : harvest ? "Harvest" : "";
                    return (
                      <td
                        key={value}
                        title={title}
                        className={`border-b border-white/10 px-1.5 py-1 ${
                          sow && harvest
                            ? "bg-[#e2c14a]"
                            : sow
                              ? "bg-[#8fb56a]/85"
                              : harvest
                                ? "bg-[#d9783c]/90"
                                : ""
                        }`}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {markerLeft != null ? (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-[1] w-0.5 -translate-x-px bg-[#e2b657] shadow-[0_0_8px_rgba(226,182,87,0.9)]"
              style={{ left: markerLeft }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
