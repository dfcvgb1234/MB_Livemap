/**
 * Same northern-hemisphere seasons as web/src/lib/crop-calendar.ts.
 * Plantation and DLC crops that are not on the map are left out.
 */

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

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function calendarKey(fruitType: string | null | undefined): string | null {
  if (!fruitType) return null;
  const key = fruitType.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || key === "unknown" || key === "none") return null;
  const aliased = CALENDAR_ALIASES[key] ?? key;
  return CALENDAR_FRUITS.has(aliased) ? aliased : null;
}

export function monthName(month: number) {
  return MONTH_NAMES[month - 1] ?? String(month);
}
