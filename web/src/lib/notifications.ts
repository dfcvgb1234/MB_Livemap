import type { NotificationChannel, NotificationSettings, NotificationSoundId } from "./settings";
import type { AnimalHusbandry, Production, ProductionFill, Vehicle } from "./types";

export type ToastChannel = NotificationChannel;

export type ToastLevel = "info" | "warn" | "error";

export type ToastItem = {
  id: string;
  channel: ToastChannel;
  title: string;
  body: string;
  level: ToastLevel;
  vehicleId?: string;
};

const FUEL = /diesel|\bdef\b|adblue|\bair\b|electric|methane|fuel/i;

export function channelEnabled(channel: ToastChannel, notifications: NotificationSettings) {
  return notifications[channel];
}

export function staysUntilDismissed(channel: ToastChannel, notifications: NotificationSettings) {
  return notifications.manualDismiss[channel] !== false;
}

/** The clip to play for this alert, or null when sounds are off or this alert is silent. */
export function resolveNotificationSound(
  channel: ToastChannel,
  notifications: NotificationSettings,
): NotificationSoundId | null {
  if (!notifications.soundEnabled) return null;
  const choice = notifications.sounds[channel] ?? "default";
  if (choice === "none") return null;
  if (choice === "default") return notifications.defaultSound;
  return choice;
}

export function fillChannel(vehicle: Pick<Vehicle, "type" | "category">): "combineFull" | "trailerFull" | null {
  const key = (vehicle.type ?? "").toLowerCase();
  if (/combine|harvester|forage|cotton/.test(key)) return "combineFull";
  if (vehicle.category === "trailer") return "trailerFull";
  return null;
}

export function cargoRatio(vehicle: Pick<Vehicle, "fills">): { ratio: number; name: string } | null {
  let best: { ratio: number; name: string } | null = null;
  for (const fill of vehicle.fills ?? []) {
    if (fill.name.includes(" · ")) continue;
    if (FUEL.test(fill.name)) continue;
    if (fill.fillLevel == null || fill.capacity == null || fill.capacity <= 0) continue;
    const ratio = fill.fillLevel / fill.capacity;
    if (!best || ratio > best.ratio) best = { ratio, name: fill.name };
  }
  return best;
}

export type ProductionAlert = {
  key: string;
  channel: "productionMissing" | "productionFull";
  title: string;
  body: string;
  level: ToastLevel;
};

/** One alert per production line the game reports as blocked. */
export function productionAlerts(productions: Production[]): ProductionAlert[] {
  const alerts: ProductionAlert[] = [];
  for (const point of productions) {
    if ((point.status ?? "").toLowerCase() === "unowned") continue;
    for (const line of point.lines ?? []) {
      if (line.enabled === false) continue;
      const status = (line.status ?? "").toUpperCase();
      if (status === "INACTIVE" || status === "DISABLED" || status === "OFF") continue;
      if (status === "MISSING_INPUTS") {
        alerts.push({
          key: `productionMissing:${point.id}:${line.name}`,
          channel: "productionMissing",
          title: point.name,
          body: `${line.name} needs inputs`,
          level: "warn",
        });
      } else if (status === "NO_OUTPUT_SPACE") {
        alerts.push({
          key: `productionFull:${point.id}:${line.name}`,
          channel: "productionFull",
          title: point.name,
          body: `${line.name} storage is full`,
          level: "error",
        });
      }
    }
  }
  return alerts;
}

export type EmptyChannel = "seederEmpty" | "sprayerEmpty" | "fertilizerEmpty" | "slurryEmpty" | "manureEmpty";

type ToolKind = "seeder" | "sprayer" | "fertilizer" | "slurry" | "manure";

const EMPTY_CHANNEL: Record<ToolKind, EmptyChannel> = {
  seeder: "seederEmpty",
  sprayer: "sprayerEmpty",
  fertilizer: "fertilizerEmpty",
  slurry: "slurryEmpty",
  manure: "manureEmpty",
};

const FILL_FUEL = /^(DIESEL|DEF|ADBLUE|AIR|ELECTRICCHARGE|ELECTRIC|METHANE|FUEL)$/;
const GENERIC_TOOL_TYPE = /^(implement|tool|trailer|vehicle|attachable|base|tooltrailed|other)?$/;

function compactType(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchToolKinds(text: string) {
  const kinds = new Set<ToolKind>();
  const slurry = /slurry|manurebarrel|liquidmanure/.test(text);
  if (slurry) kinds.add("slurry");
  if (/manurespreader/.test(text)) kinds.add("manure");
  if (/fertiliz/.test(text)) kinds.add("fertilizer");
  if (/sowing|seeder|seeddrill|directdrill/.test(text) || (/planter/.test(text) && !/tree/.test(text))) {
    kinds.add("seeder");
  }
  if (/sprayer/.test(text) && !slurry) kinds.add("sprayer");
  return kinds;
}

/** Seeders, sprayers, and spreaders, from the game's vehicle type rather than the translated name. */
export function toolKinds(type: string | null | undefined, name: string) {
  const key = compactType(type ?? "");
  const fromType = matchToolKinds(key);
  if (fromType.size > 0) return fromType;
  if (key !== "" && !GENERIC_TOOL_TYPE.test(key)) return fromType;
  return matchToolKinds(compactType(name));
}

function normalizeFillType(value: string | null | undefined) {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function emptyChannelForFill(fill: ProductionFill, kinds: Set<ToolKind>): EmptyChannel | null {
  if (kinds.size === 0 || fill.name.includes(" · ")) return null;
  const internal = normalizeFillType(fill.fillType);
  if (FUEL.test(fill.name) || FILL_FUEL.test(internal)) return null;
  if (fill.fillLevel == null || fill.capacity == null || fill.capacity <= 0) return null;

  if (internal === "LIQUIDMANURE" || internal === "DIGESTATE") return kinds.has("slurry") ? "slurryEmpty" : null;
  if (internal === "MANURE") return kinds.has("manure") ? "manureEmpty" : null;
  if (internal === "HERBICIDE") return kinds.has("sprayer") ? "sprayerEmpty" : null;
  if (internal === "LIQUIDFERTILIZER") {
    if (kinds.has("sprayer")) return "sprayerEmpty";
    if (kinds.has("fertilizer") || kinds.has("seeder")) return "fertilizerEmpty";
    return null;
  }
  if (internal === "FERTILIZER") return kinds.has("fertilizer") || kinds.has("seeder") ? "fertilizerEmpty" : null;
  if (internal === "SEEDS" || internal === "SEED") return kinds.has("seeder") ? "seederEmpty" : null;

  if (kinds.has("slurry") && kinds.size === 1) return EMPTY_CHANNEL.slurry;
  if (kinds.has("manure") && kinds.size === 1) return EMPTY_CHANNEL.manure;
  if (kinds.has("sprayer") && !kinds.has("seeder")) return EMPTY_CHANNEL.sprayer;
  if (kinds.has("fertilizer") && !kinds.has("seeder")) return EMPTY_CHANNEL.fertilizer;
  if (kinds.has("seeder")) return EMPTY_CHANNEL.seeder;
  return null;
}

export type TankWatch = {
  key: string;
  channel: EmptyChannel;
  title: string;
  body: string;
  vehicleId: string;
  ratio: number;
};

/** Lowest working tank on a seeder, sprayer, or spreader. Fuel and attached copies are ignored. */
export function emptyTankWatches(vehicle: Vehicle): TankWatch[] {
  const kinds = toolKinds(vehicle.type, vehicle.name);
  if (kinds.size === 0) return [];
  const best = new Map<EmptyChannel, { ratio: number; name: string }>();
  for (const fill of vehicle.fills ?? []) {
    const channel = emptyChannelForFill(fill, kinds);
    if (!channel || fill.fillLevel == null || fill.capacity == null || fill.capacity <= 0) continue;
    const ratio = fill.fillLevel / fill.capacity;
    const current = best.get(channel);
    if (!current || ratio < current.ratio) best.set(channel, { ratio, name: fill.name });
  }
  const watches: TankWatch[] = [];
  for (const [channel, cargo] of best) {
    watches.push({
      key: `${channel}:${vehicle.id}`,
      channel,
      title: `${vehicle.name} almost empty`,
      body: `${cargo.name} ${Math.round(cargo.ratio * 100)}%`,
      vehicleId: vehicle.id,
      ratio: cargo.ratio,
    });
  }
  return watches;
}

export type AnimalWatch = {
  key: string;
  channel: "animalMissing" | "animalFull";
  title: string;
  body: string;
  level: ToastLevel;
  /** High means the tank is filling up. Blocked pallets have no ratio. */
  direction: "low" | "high" | "blocked";
  ratio: number;
};

function fillRatio(fill: ProductionFill) {
  if (fill.fillLevel == null || fill.capacity == null || fill.capacity <= 0) return null;
  return fill.fillLevel / fill.capacity;
}

function animalUsage(fill: ProductionFill) {
  if (fill.usage === "food" || fill.usage === "water" || fill.usage === "straw" || fill.usage === "product") {
    return fill.usage;
  }
  if (fill.role === "output") return "product";
  const name = fill.name.toLowerCase();
  if (/straw|bedding/.test(name)) return "straw";
  if (/\bwater\b/.test(name)) return "water";
  if (/milk|wool|egg|manure|slurry|honey/.test(name)) return "product";
  if (fill.role === "input") return "food";
  return null;
}

function fullest(fills: ProductionFill[], usage: "food" | "water") {
  let best: { ratio: number; name: string } | null = null;
  for (const fill of fills) {
    if (animalUsage(fill) !== usage) continue;
    const ratio = fillRatio(fill);
    if (ratio == null) continue;
    if (!best || ratio > best.ratio) best = { ratio, name: fill.name };
  }
  return best;
}

/**
 * Food and water alert from the fullest matching tank, so an optional empty
 * food group stays quiet while another group still has feed. Straw is bedding
 * and is skipped. Each product alerts on its own when storage is full.
 */
export function animalWatches(animals: AnimalHusbandry[]): AnimalWatch[] {
  const watches: AnimalWatch[] = [];
  for (const pen of animals) {
    const fills = pen.fills ?? [];
    const occupied = pen.count == null || pen.count > 0;
    if (occupied) {
      const food = fullest(fills, "food");
      if (food) {
        watches.push({
          key: `animalMissing:${pen.id}:food`,
          channel: "animalMissing",
          title: pen.name,
          body: `${food.name} ${Math.round(food.ratio * 100)}%`,
          level: "warn",
          direction: "low",
          ratio: food.ratio,
        });
      }
      const water = fullest(fills, "water");
      if (water) {
        watches.push({
          key: `animalMissing:${pen.id}:water`,
          channel: "animalMissing",
          title: pen.name,
          body: `${water.name} ${Math.round(water.ratio * 100)}%`,
          level: "warn",
          direction: "low",
          ratio: water.ratio,
        });
      }
    }
    for (const fill of fills) {
      if (animalUsage(fill) !== "product") continue;
      const ratio = fillRatio(fill);
      if (ratio == null) continue;
      watches.push({
        key: `animalFull:${pen.id}:${fill.name}`,
        channel: "animalFull",
        title: pen.name,
        body: `${fill.name} ${Math.round(ratio * 100)}%`,
        level: "error",
        direction: "high",
        ratio,
      });
    }
    if (pen.palletBlocked) {
      watches.push({
        key: `animalFull:${pen.id}:pallets`,
        channel: "animalFull",
        title: pen.name,
        body: "No space for pallets",
        level: "error",
        direction: "blocked",
        ratio: 1,
      });
    }
  }
  return watches;
}
