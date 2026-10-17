"use client";

import { useLivemapContext } from "@/components/livemap-provider";
import { useSettings } from "@/components/settings-provider";

export function MapOverlayPrompt() {
  const { state } = useLivemapContext();
  const { overlayPrompt, overlayDetail, imageError, setMapImageFile, skipMapOverlay } = useSettings();
  if (!overlayPrompt) return null;

  const name = state?.mapName ?? "This map";
  const detail = imageError ?? overlayDetail;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-overlay-title"
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#221e18] p-5 text-[#f3efe4] shadow-2xl"
      >
        <h2 id="map-overlay-title" className="text-lg font-semibold break-words">
          No map picture for {name}
        </h2>
        <p className="mt-2 text-sm text-[#b7b1a4]">
          No overview image was found. If this is a DLC map, that image is inside an encrypted archive this
          app cannot open. Choose an overview.dds file, or continue without a map picture.
        </p>
        {detail ? <p className="mt-3 text-sm text-[#d46a6a]">{detail}</p> : null}
        <div className="mt-5 flex flex-col gap-2">
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-[#e2b657] px-3 text-sm font-semibold text-[#2a2112]">
            Choose overview.dds
            <input
              type="file"
              accept=".dds,image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void setMapImageFile(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void skipMapOverlay()}
            className="min-h-11 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15"
          >
            Continue without a map picture
          </button>
        </div>
      </div>
    </div>
  );
}
