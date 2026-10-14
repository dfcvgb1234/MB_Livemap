"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { TabletSmartphone } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ConnectLink = { url: string; qr: string };

type ConnectInfo = {
  links: ConnectLink[];
  mod: { status: string; message: string };
};

type ConnectValue = {
  info: ConnectInfo | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  reload: () => void;
};

const ConnectContext = createContext<ConnectValue | null>(null);

function useConnect() {
  const value = useContext(ConnectContext);
  if (!value) throw new Error("Connect controls are rendered outside ConnectProvider");
  return value;
}

async function loadConnect(): Promise<ConnectInfo | null> {
  const response = await fetch("/api/connect");
  if (!response.ok) return null;
  const data = (await response.json()) as ConnectInfo;
  if (!data || !Array.isArray(data.links) || !data.mod) return null;
  return data;
}

export function ConnectProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(() => {
    void loadConnect()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!info) return;
    if (new URLSearchParams(window.location.search).get("setup") === "1") setOpen(true);
  }, [info]);

  return (
    <ConnectContext.Provider value={{ info, open, setOpen, reload }}>{children}</ConnectContext.Provider>
  );
}

export function ModBanner() {
  const { info } = useConnect();
  if (!info?.mod.message) return null;
  return (
    <div className="bg-[#e2b657] px-[18px] py-2.5 text-sm font-semibold text-[#2a2112]">{info.mod.message}</div>
  );
}

export function ConnectButton() {
  const { info, setOpen } = useConnect();
  if (!info) return null;
  return (
    <button
      type="button"
      aria-label="Connect an iPad"
      onClick={() => setOpen(true)}
      className="grid size-10 place-items-center rounded-lg text-[#f3efe4] hover:bg-white/10"
    >
      <TabletSmartphone className="size-5" aria-hidden />
    </button>
  );
}

export function ConnectSheet() {
  const { info, open, setOpen, reload } = useConnect();

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reload();
      }}
    >
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-white/10 bg-[#221e18] text-[#f3efe4] sm:max-w-md"
      >
        <SheetHeader className="pr-10">
          <SheetTitle className="text-lg text-[#f3efe4]">Use it on an iPad</SheetTitle>
          <SheetDescription className="text-[#b7b1a4]">
            The iPad and this PC have to be on the same Wi-Fi. Scan a code with the iPad camera.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          {info && info.links.length > 0 ? (
            info.links.map((link) => (
              <div key={link.url} className="flex flex-col items-start gap-3">
                <img
                  src={link.qr}
                  alt={`QR code for ${link.url}`}
                  width={280}
                  height={280}
                  className="rounded-lg bg-white p-2"
                />
                <p className="text-sm break-all text-[#f3efe4]">{link.url}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#b7b1a4]">
              This PC has no Wi-Fi address yet. Connect to Wi-Fi, then open this panel again.
            </p>
          )}
          <p className="text-xs text-[#b7b1a4]">
            If the iPad cannot open the page, set this PC&apos;s Wi-Fi to a private network. In Windows
            Settings, open Network and internet, Wi-Fi, the network name, then choose Private.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
