export type CropSeason = {
  fruit: string;
  label: string;
  /** Months (1–12) when sowing is in season. */
  sow: number[];
  /** Months (1–12) when harvest is in season. */
  harvest: number[];
};

function months(from: number, to: number): number[] {
  const out: number[] = [];
  for (let month = from; month <= to; month += 1) out.push(month);
  return out;
}

const YEAR = months(1, 12);

/**
 * Northern-hemisphere seasons for the crops grown on this map.
 * Plantation and DLC crops that are not on the map are left out.
 */
export const CROP_CALENDAR: CropSeason[] = [
  { fruit: "wheat", label: "Wheat", sow: months(9, 10), harvest: months(7, 8) },
  { fruit: "barley", label: "Barley", sow: months(9, 10), harvest: months(6, 7) },
  { fruit: "oat", label: "Oat", sow: months(3, 4), harvest: months(7, 8) },
  { fruit: "canola", label: "Canola", sow: months(8, 9), harvest: months(7, 8) },
  { fruit: "corn", label: "Corn", sow: months(4, 5), harvest: months(8, 11) },
  { fruit: "sunflower", label: "Sunflowers", sow: months(3, 4), harvest: months(10, 11) },
  { fruit: "soybean", label: "Soybeans", sow: months(4, 5), harvest: months(10, 11) },
  { fruit: "sorghum", label: "Sorghum", sow: months(4, 5), harvest: months(8, 9) },
  { fruit: "potato", label: "Potatoes", sow: months(3, 4), harvest: months(8, 10) },
  { fruit: "sugarBeet", label: "Sugar Beet", sow: months(3, 4), harvest: months(10, 11) },
  { fruit: "redBeet", label: "Red Beet", sow: months(4, 6), harvest: months(8, 11) },
  { fruit: "carrot", label: "Carrots", sow: months(4, 7), harvest: months(8, 11) },
  { fruit: "parsnip", label: "Parsnips", sow: months(4, 6), harvest: months(8, 11) },
  { fruit: "onion", label: "Onions", sow: months(3, 4), harvest: months(8, 9) },
  { fruit: "pea", label: "Peas", sow: months(3, 4), harvest: months(7, 9) },
  { fruit: "greenBean", label: "Green Beans", sow: months(4, 6), harvest: months(8, 11) },
  { fruit: "spinach", label: "Spinach", sow: months(3, 5), harvest: YEAR },
  { fruit: "cotton", label: "Cotton", sow: months(2, 3), harvest: months(10, 11) },
  { fruit: "grass", label: "Grass", sow: months(3, 11), harvest: YEAR },
];

/** Names the game may send, keyed to calendar rows. */
const CALENDAR_ALIASES: Record<string, string> = {
  maize: "corn",
  potatoes: "potato",
  sugarbeet: "sugarBeet",
  sugarcane: "sugarCane",
  soybeans: "soybean",
  sunflowers: "sunflower",
  oats: "oat",
  greenbeans: "greenBean",
  redbeet: "redBeet",
  beetroot: "redBeet",
  parsnips: "parsnip",
  carrots: "carrot",
  onions: "onion",
  peas: "pea",
};

const CALENDAR_FRUITS = new Set(CROP_CALENDAR.map((crop) => crop.fruit));

export function calendarKey(fruitType: string | null | undefined): string | null {
  if (!fruitType) return null;
  const key = fruitType.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || key === "unknown" || key === "none") return null;
  const aliased = CALENDAR_ALIASES[key] ?? key;
  return CALENDAR_FRUITS.has(aliased) ? aliased : null;
}

export const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const FRUIT_COLORS: Record<string, string> = {
  wheat: "#ceab4f",
  barley: "#897246",
  canola: "#9cc251",
  oat: "#b36a2f",
  corn: "#e89a2d",
  sunflower: "#eacb22",
  soybean: "#81852e",
  sorghum: "#705042",
  rice: "#e6d7a8",
  longGrainRice: "#d8c48a",
  potato: "#8c634f",
  sugarBeet: "#d9a38f",
  sugarCane: "#c6d47a",
  redBeet: "#b6145b",
  carrot: "#e06635",
  parsnip: "#d7be9b",
  onion: "#e5d0b6",
  pea: "#2c8d62",
  greenBean: "#1bd9af",
  spinach: "#3d8f4a",
  cotton: "#f2e8e6",
  grass: "#3a622c",
  oilseedRadish: "#7d9a3a",
  grape: "#6b3a78",
  olive: "#6a7040",
  poplar: "#5c7a3a",
  banana: "#e6c84a",
  coffee: "#6b3e2e",
};

export function fruitColor(fruitType: string | null | undefined): string {
  const key = calendarKey(fruitType);
  if (key && FRUIT_COLORS[key]) return FRUIT_COLORS[key];
  return "#6b7c5c";
}

export function growthLabel(state: number | null, max: number | null): string {
  if (state == null) return "—";
  if (max != null && max > 0) return `${state}/${max}`;
  return String(state);
}
