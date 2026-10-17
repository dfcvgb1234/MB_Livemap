"use client";

import { useEffect, useState } from "react";
import { COLOR_LABELS, MACHINE_COLOR_KEYS } from "@/lib/machine-colors";
import { NOTIFICATION_CHANNELS, type MapImageFit } from "@/lib/settings";
import { MAX_CUSTOM_PROFILES, formatInterval, type UpdateGroup } from "@/lib/performance";
import { cn } from "@/lib/utils";
import { useSettings } from "@/components/settings-provider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORIES = [
  { id: "performance", label: "Performance" },
  { id: "map", label: "Map" },
  { id: "colors", label: "Colors" },
  { id: "notifications", label: "Notifications" },
] as const;

type Category = (typeof CATEGORIES)[number]["id"];

const NOTIFICATION_LABELS: Record<(typeof NOTIFICATION_CHANNELS)[number], string> = {
  combineFull: "Combine almost full",
  trailerFull: "Trailer almost full",
  adArrived: "AutoDrive arrived",
  adStuck: "AutoDrive stuck",
  adProblem: "AutoDrive problems",
  cpFinished: "Courseplay finished",
  productionMissing: "Production needs inputs",
  productionFull: "Production storage full",
};

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

function FitButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function rateOptions(steps: number[], current: number) {
  return steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
}

export function SettingsDialog() {
  const {
    settings,
    builtins,
    groups,
    mapImageUrl,
    imageError,
    saveError,
    open,
    setOpen,
    setMapImageFit,
    setColor,
    resetColors,
    setNotifications,
    setActiveProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    setProfileInterval,
    retrySave,
    mapImageEditable,
    canClearMapImage,
    clearMapImageLabel,
    setMapImageFile,
    resetMapImage,
  } = useSettings();
  const [category, setCategory] = useState<Category>("performance");
  const activeCustom = settings.performance.custom.find((profile) => profile.id === settings.performance.activeId);
  const [draftName, setDraftName] = useState(activeCustom?.name ?? "");

  useEffect(() => {
    setDraftName(activeCustom?.name ?? "");
  }, [activeCustom?.id, activeCustom?.name]);

  const fit = (next: MapImageFit) => setMapImageFit(next);
  const profiles = [
    ...builtins.map((profile) => ({ ...profile, builtin: true })),
    ...settings.performance.custom.map((profile) => ({ ...profile, builtin: false })),
  ];
  const selected = profiles.find((profile) => profile.id === settings.performance.activeId) ?? profiles[1];
  const editable = selected != null && !selected.builtin;

  const commitName = (value: string) => {
    if (!activeCustom) return;
    const trimmed = value.trim().slice(0, 40);
    if (!trimmed || trimmed === activeCustom.name) {
      setDraftName(activeCustom.name);
      return;
    }
    setDraftName(trimmed);
    renameProfile(activeCustom.id, trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Saved on this PC for every screen that opens the livemap.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-3 pb-3 sm:w-48 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0 sm:px-3 sm:pb-4">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
                className={cn(
                  "min-h-10 shrink-0 rounded-lg px-3 text-left text-sm font-semibold",
                  category === item.id ? "bg-[#e2b657] text-[#2a2112]" : "text-[#f3efe4] hover:bg-white/10",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
            {saveError ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#d46a6a]/15 px-3 py-2 text-sm text-[#f3efe4]">
                <p>{saveError}</p>
                <button type="button" onClick={retrySave} className="font-semibold text-[#e2b657] hover:underline">
                  Try again
                </button>
              </div>
            ) : null}

            {category === "performance" && selected ? (
              <section className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      aria-pressed={profile.id === selected.id}
                      onClick={() => setActiveProfile(profile.id)}
                      className={cn(
                        "min-h-10 rounded-lg px-3 text-sm font-semibold",
                        profile.id === selected.id
                          ? "bg-[#e2b657] text-[#2a2112]"
                          : "bg-white/10 text-[#f3efe4] hover:bg-white/15",
                      )}
                    >
                      {profile.name}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={createProfile}
                    disabled={settings.performance.custom.length >= MAX_CUSTOM_PROFILES}
                    className="min-h-10 rounded-lg bg-white/10 px-3 text-sm font-semibold enabled:hover:bg-white/15 disabled:opacity-40"
                  >
                    New profile
                  </button>
                  {editable && activeCustom ? (
                    <>
                      <input
                        aria-label="Profile name"
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onBlur={(event) => commitName(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitName(event.currentTarget.value);
                            event.currentTarget.blur();
                          }
                        }}
                        className="min-h-10 min-w-40 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => deleteProfile(activeCustom.id)}
                        className="min-h-10 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15"
                      >
                        Delete profile
                      </button>
                    </>
                  ) : null}
                </div>
                <p className="text-xs text-[#b7b1a4]">
                  {editable
                    ? "This profile chooses how often each group is read from the game."
                    : "High, Normal, and Low are fixed. Create a profile to choose your own rates."}
                </p>
                <div className="flex flex-col gap-2">
                  {groups.map((group) => {
                    const current = selected.intervalsMs[group.id];
                    return (
                      <label key={group.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                        <span>{group.label}</span>
                        <select
                          aria-label={`${group.label} update rate`}
                          disabled={!editable}
                          value={current}
                          onChange={(event) =>
                            activeCustom && setProfileInterval(activeCustom.id, group.id as UpdateGroup, Number(event.target.value))
                          }
                          className="min-h-10 rounded-lg border border-white/10 bg-black/25 px-2 disabled:opacity-70"
                        >
                          {rateOptions(group.steps, current).map((step) => (
                            <option key={step} value={step}>
                              {formatInterval(step)}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-[#b7b1a4]">
                  Vehicles covers positions, fills, the date, and multiplayer farms. AutoDrive and Courseplay are checked
                  on their own timers and sent when they change.
                </p>
              </section>
            ) : null}

            {category === "map" ? (
              <section className="flex flex-col gap-3">
                {mapImageUrl ? (
                  <img src={mapImageUrl} alt="" className="h-28 w-full rounded-lg object-cover" />
                ) : (
                  <div className="grid h-28 place-items-center rounded-lg bg-black/25 text-sm text-[#b7b1a4]">
                    No map picture
                  </div>
                )}
                <label
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-lg bg-[#e2b657] px-3 text-sm font-semibold text-[#2a2112]",
                    mapImageEditable ? "cursor-pointer" : "pointer-events-none opacity-40",
                  )}
                >
                  Choose image
                  <input
                    type="file"
                    accept=".dds,image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={!mapImageEditable}
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
                  disabled={!canClearMapImage}
                  onClick={() => void resetMapImage()}
                  className="min-h-10 rounded-lg bg-white/10 px-3 text-sm font-semibold enabled:hover:bg-white/15 disabled:opacity-40"
                >
                  {clearMapImageLabel}
                </button>
                {imageError ? <p className="text-sm text-[#d46a6a]">{imageError}</p> : null}
              </section>
            ) : null}

            {category === "colors" ? (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-end">
                  <button type="button" onClick={resetColors} className="text-xs font-semibold text-[#e2b657] hover:underline">
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
            ) : null}

            {category === "notifications" ? (
              <section className="flex flex-col gap-1">
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <NotificationRow
                    key={channel}
                    label={NOTIFICATION_LABELS[channel]}
                    enabled={settings.notifications[channel]}
                    stays={settings.notifications.manualDismiss[channel]}
                    onEnabled={(next) => setNotifications({ [channel]: next })}
                    onStays={(next) =>
                      setNotifications({
                        manualDismiss: { ...settings.notifications.manualDismiss, [channel]: next },
                      })
                    }
                  />
                ))}
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
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
