"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useLivemap } from "@/hooks/use-livemap";

type LivemapContextValue = ReturnType<typeof useLivemap>;

const LivemapContext = createContext<LivemapContextValue | null>(null);

export function LivemapProvider({ children }: { children: ReactNode }) {
  const value = useLivemap();
  return (
    <LivemapContext.Provider value={value}>{children}</LivemapContext.Provider>
  );
}

export function useLivemapContext() {
  const ctx = useContext(LivemapContext);
  if (!ctx) {
    throw new Error("useLivemapContext must be used within LivemapProvider");
  }
  return ctx;
}
