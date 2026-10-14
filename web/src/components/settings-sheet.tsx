"use client";

import { COLOR_LABELS, MACHINE_COLOR_KEYS } from "@/lib/machine-colors";
import { NOTIFICATION_CHANNELS, type MapImageFit } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useSettings } from "@/components/settings-provider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function NotificationRow({
  label,
  enabled,
  onEnabled,
  stays,
  onStays,
}: {
  label: string;
  enabled: boolean;
  onEnabled: (next: boolean) => void;
  stays: boolean;
  onStays: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg pr-2 hover:bg-white/5">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onEnabled(!enabled)}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 px-2 text-left text-sm"
      >
        <span className="truncate">{label}</span>
        <span
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            enabled ? "bg-[#e2b657]" : "bg-white/15",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-[#2a2112] transition-transform",
              enabled ? "left-5" : "left-0.5",
            )}
          />
        </span>
      </button>
      <button
        type="button"
        aria-pressed={stays}
        aria-label={`${label} ${stays ? "stays until dismissed" : "closes automatically"}`}
        disabled={!enabled}
        onClick={() => onStays(!stays)}
        className={cn(
          "min-h-8 shrink-0 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-40",
          stays ? "bg-[#e2b657] text-[#2a2112]" : "bg-white/10 text-[#f3efe4]",
        )}
      >
        {stays ? "Stays" : "Auto"}
      </button>
    </div>
  );
}

function FitButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold",
        active ? "bg-[#e2b657] text-[#2a2112]" : "bg-white/10 text-[#f3efe4] hover:bg-white/15",
      )}
    >
      {label}
    </button>
  );
}

export function SettingsSheet() {
  const {
    settings,
    mapImageUrl,
    imageError,
    open,
    setOpen,
    setMapImageFit,
    setColor,
    resetColors,
    setNotifications,
    setMapImageFile,
    resetMapImage,
  } = useSettings();

  const fit = (next: MapImageFit) => setMapImageFit(next);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-white/10 bg-[#221e18] text-[#f3efe4] sm:max-w-md"
      >
        <SheetHeader className="pr-10">
          <SheetTitle className="text-lg text-[#f3efe4]">Settings</SheetTitle>
          <SheetDescription className="text-[#b7b1a4]">
            Map image, machine colors, and which alerts show on this device.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">Map image</h2>
            <img
              src={mapImageUrl ?? "/PDA.png"}
              alt=""
              className="h-28 w-full rounded-lg object-cover"
            />
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-[#e2b657] px-3 text-sm font-semibold text-[#2a2112]">
              Choose image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void setMapImageFile(file);
                }}
              />
            </label>
            <div className="flex gap-2">
              <FitButton label="PDA center" active={settings.mapImageFit === "pda"} onClick={() => fit("pda")} />
              <FitButton label="Full image" active={settings.mapImageFit === "full"} onClick={() => fit("full")} />
            </div>
            <p className="text-xs text-[#b7b1a4]">
              PDA images keep the terrain in the center half. Full uses the whole picture as the map.
            </p>
            <button
              type="button"
              disabled={mapImageUrl == null}
              onClick={() => void resetMapImage()}
              className="min-h-10 rounded-lg bg-white/10 px-3 text-sm font-semibold enabled:hover:bg-white/15 disabled:opacity-40"
            >
              Use built-in map
            </button>
            {imageError ? <p className="text-sm text-[#d46a6a]">{imageError}</p> : null}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">Machine colors</h2>
              <button
                type="button"
                onClick={resetColors}
                className="text-xs font-semibold text-[#e2b657] hover:underline"
              >
                Reset
              </button>
            </div>
            {MACHINE_COLOR_KEYS.map((key) => (
              <label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>{COLOR_LABELS[key]}</span>
                <input
                  aria-label={`${COLOR_LABELS[key]} color`}
                  type="color"
                  value={settings.colors[key]}
                  onChange={(event) => setColor(key, event.target.value)}
                  className="size-9 cursor-pointer rounded border border-white/10 bg-transparent"
                />
              </label>
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <h2 className="px-2 text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">
              Notifications
            </h2>
            <h2 className="px-2 text-xs font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">
              Notifications
            </h2>
              {NOTIFICATION_CHANNELS.map((channel) => {
                const label = {
                  combineFull: "Combine almost full",
                  trailerFull: "Trailer almost full",
                  adArrived: "AutoDrive arrived",
                  adStuck: "AutoDrive stuck",
                  adProblem: "AutoDrive problems",
                  productionMissing: "Production needs inputs",
                  productionFull: "Production storage full",
                }[channel];
                return (
                  <NotificationRow
                    key={channel}
                    label={label}
                    enabled={settings.notifications[channel]}
                    stays={settings.notifications.manualDismiss[channel]}
                    onEnabled={(next) => setNotifications({ [channel]: next })}
                    onStays={(next) =>
                      setNotifications({
                        manualDismiss: { ...settings.notifications.manualDismiss, [channel]: next },
                      })
                    }
                  />
                );
              })}
            <label className="mt-2 flex flex-col gap-2 px-2 text-sm">
              <span>Almost full at {settings.notifications.fillThreshold}%</span>
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                value={settings.notifications.fillThreshold}
                aria-label="Almost full threshold"
                onChange={(event) => setNotifications({ fillThreshold: Number(event.target.value) })}
                className="accent-[#e2b657]"
              />
            </label>
            <p className="px-2 text-xs text-[#b7b1a4]">
              Stays keeps an alert until you close it. Auto closes it after 8 seconds. Both are saved in the history.
              Other AutoDrive messages show with problems. Fuel and DEF are ignored.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
