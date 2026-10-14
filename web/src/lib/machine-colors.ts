import type { Vehicle } from "./types";

export const MACHINE_COLOR_KEYS = [
  "tractor",
  "combine",
  "truck",
  "car",
  "loader",
  "train",
  "trailer",
  "implement",
  "other",
] as const;

export type MachineColorKey = (typeof MACHINE_COLOR_KEYS)[number];

export type MachineColors = Record<MachineColorKey, string>;

export const COLOR_LABELS: Record<MachineColorKey, string> = {
  tractor: "Tractor",
  combine: "Combine",
  truck: "Truck",
  car: "Car",
  loader: "Loader",
  train: "Train",
  trailer: "Trailer",
  implement: "Implement",
  other: "Other",
};

export const DEFAULT_COLORS: MachineColors = {
  tractor: "#e2b657",
  combine: "#e07a3d",
  truck: "#6ea8d9",
  car: "#8fd18a",
  loader: "#d6c24a",
  train: "#d46a6a",
  trailer: "#6ea8d9",
  implement: "#c9a24a",
  other: "#f3efe4",
};

export function machineColorKey(vehicle: Pick<Vehicle, "type" | "category">): MachineColorKey {
  const key = (vehicle.type ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    key.includes("cotton") ||
    key.includes("combine") ||
    key.includes("harvester") ||
    key.includes("forage") ||
    key.includes("beet")
  ) {
    return "combine";
  }
  if (key.includes("truck")) return "truck";
  if (key.includes("loader") || key.includes("telehandler")) return "loader";
  if (key.includes("tractor")) return "tractor";
  if (key.includes("car")) return "car";
  if (key.includes("train") || key.includes("locomotive")) return "train";
  if (vehicle.category === "trailer" || key.includes("trailer")) return "trailer";
  if (vehicle.category === "implement") return "implement";
  return "other";
}

export function machineColor(vehicle: Pick<Vehicle, "type" | "category">, colors: MachineColors): string {
  return colors[machineColorKey(vehicle)];
}
