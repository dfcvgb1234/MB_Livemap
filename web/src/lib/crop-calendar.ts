/** Approximate Northern-hemisphere crop calendar for common FS fruits (v1 static). */

export type CropSeason = {
  fruit: string;
  label: string;
  sow: number[]; // months 1-12
  harvest: number[];
};

export const CROP_CALENDAR: CropSeason[] = [
  { fruit: "wheat", label: "Wheat", sow: [9, 10], harvest: [7, 8] },
  { fruit: "barley", label: "Barley", sow: [9, 10], harvest: [6, 7] },
  { fruit: "canola", label: "Canola", sow: [8, 9], harvest: [7] },
  { fruit: "corn", label: "Corn", sow: [4, 5], harvest: [9, 10] },
  { fruit: "potato", label: "Potato", sow: [4, 5], harvest: [8, 9] },
  { fruit: "sugarBeet", label: "Sugar Beet", sow: [3, 4], harvest: [9, 10] },
  { fruit: "soybean", label: "Soybean", sow: [4, 5], harvest: [9, 10] },
  { fruit: "sunflower", label: "Sunflower", sow: [4, 5], harvest: [9, 10] },
  { fruit: "oat", label: "Oat", sow: [3, 4], harvest: [7, 8] },
  { fruit: "grass", label: "Grass", sow: [3, 4, 8], harvest: [5, 6, 7, 8, 9] },
];

export const MONTHS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];

export function fruitColor(fruit: string | null): string {
  switch (fruit) {
    case "wheat":
      return "#d4a84b";
    case "barley":
      return "#c4b06a";
    case "canola":
      return "#e8d44d";
    case "corn":
      return "#e0a020";
    case "potato":
      return "#a67c52";
    case "sugarBeet":
      return "#8b9a6b";
    case "soybean":
      return "#6b8f3c";
    case "grass":
      return "#4a8f4a";
    case "sunflower":
      return "#f0c040";
    case "oat":
      return "#c9b896";
    default:
      return "#6b7c5c";
  }
}

export function growthLabel(state: number | null, max: number | null): string {
  if (state == null) return "Unknown";
  if (max == null || max <= 0) return `Stage ${state}`;
  const pct = Math.round((state / max) * 100);
  if (pct >= 90) return "Ready";
  if (pct >= 60) return "Growing";
  if (pct >= 30) return "Early";
  return "Sprouting";
}
