import type { GameState } from "./types.js";

const FRUITS = [
  "wheat",
  "barley",
  "canola",
  "corn",
  "potato",
  "sugarBeet",
  "grass",
  "soybean",
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Deterministic-ish mock farm state that gently animates for demos. */
export function createMockState(t = Date.now()): GameState {
  const phase = (t / 1000) % 360;
  const rad = (phase * Math.PI) / 180;
  const mapSize = 2048;
  const mid = mapSize / 2;

  const vehicles = [
    {
      id: "v-tractor-1",
      name: "Fendt 942",
      type: "tractor",
      x: mid + Math.cos(rad) * 220,
      z: mid + Math.sin(rad) * 180,
      heading: ((phase + 90) % 360) * (Math.PI / 180),
      speed: 18 + Math.sin(rad * 2) * 4,
      engineOn: true,
      attached: ["Seeder"],
    },
    {
      id: "v-harvester-1",
      name: "Lexion 8900",
      type: "harvester",
      x: mid - 160 + Math.sin(rad * 0.7) * 40,
      z: mid + 280,
      heading: Math.PI * 0.15,
      speed: 8,
      engineOn: true,
      attached: ["Header 12m"],
    },
    {
      id: "v-truck-1",
      name: "MAN TGS",
      type: "truck",
      x: mid + 340,
      z: mid - 90 + Math.cos(rad * 1.3) * 30,
      heading: -Math.PI / 2,
      speed: 0,
      engineOn: false,
      attached: [],
    },
  ];

  const fields = Array.from({ length: 12 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const ox = 200 + col * 420;
    const oz = 260 + row * 480;
    const w = 280;
    const h = 320;
    const fruit = FRUITS[i % FRUITS.length];
    const growthMax = 8;
    const growthState = clamp(Math.floor(((phase / 40 + i * 1.7) % growthMax) + 1), 1, growthMax);
    return {
      id: `field-${i + 1}`,
      fruitType: fruit,
      growthState,
      growthMax,
      owned: i < 9,
      x: ox + w / 2,
      z: oz + h / 2,
      polygon: [
        { x: ox, z: oz },
        { x: ox + w, z: oz },
        { x: ox + w, z: oz + h },
        { x: ox, z: oz + h },
      ],
    };
  });

  const conditions = ["sunny", "partlyCloudy", "cloudy", "rain", "fog"];
  const condition = conditions[Math.floor((phase / 60) % conditions.length)];

  return {
    type: "state",
    ts: t,
    source: "mock",
    mapName: "Riverbend Mock",
    mapSize,
    vehicles,
    weather: {
      condition,
      temperatureC: Math.round(14 + Math.sin(rad) * 6),
      forecast: [
        { day: "Today", condition, tempMinC: 10, tempMaxC: 18 },
        { day: "Tue", condition: "partlyCloudy", tempMinC: 9, tempMaxC: 16 },
        { day: "Wed", condition: "rain", tempMinC: 8, tempMaxC: 13 },
        { day: "Thu", condition: "cloudy", tempMinC: 7, tempMaxC: 14 },
        { day: "Fri", condition: "sunny", tempMinC: 11, tempMaxC: 19 },
      ],
    },
    fields,
    productions: [
      {
        id: "prod-dairy",
        name: "Dairy Plant",
        status: "active",
        inputs: [
          { name: "Milk", fillLevel: 6200, capacity: 10000 },
          { name: "Diesel", fillLevel: 800, capacity: 2000 },
        ],
        outputs: [
          { name: "Butter", fillLevel: 1400, capacity: 5000 },
          { name: "Cheese", fillLevel: 2200, capacity: 5000 },
        ],
      },
      {
        id: "prod-grain",
        name: "Grain Mill",
        status: "active",
        inputs: [
          { name: "Wheat", fillLevel: 18000, capacity: 40000 },
          { name: "Barley", fillLevel: 9000, capacity: 20000 },
        ],
        outputs: [{ name: "Flour", fillLevel: 4500, capacity: 15000 }],
      },
      {
        id: "prod-biogas",
        name: "Biogas Plant",
        status: "idle",
        inputs: [
          { name: "Silage", fillLevel: 1200, capacity: 50000 },
          { name: "Manure", fillLevel: 8000, capacity: 30000 },
        ],
        outputs: [
          { name: "Digestate", fillLevel: 4000, capacity: 20000 },
          { name: "Electric Charge", fillLevel: null, capacity: null },
        ],
      },
    ],
    animals: [
      {
        id: "anim-cows",
        name: "Cow Pasture",
        animalType: "cow",
        count: 42,
        health: 0.92,
        productivity: 0.88,
        x: mid - 400,
        z: mid - 320,
      },
      {
        id: "anim-pigs",
        name: "Pig Barn",
        animalType: "pig",
        count: 86,
        health: 0.85,
        productivity: 0.79,
        x: mid + 420,
        z: mid + 160,
      },
      {
        id: "anim-chickens",
        name: "Chicken Coop",
        animalType: "chicken",
        count: 210,
        health: 0.95,
        productivity: 0.91,
        x: mid - 120,
        z: mid + 480,
      },
      {
        id: "anim-sheep",
        name: "Sheep Meadow",
        animalType: "sheep",
        count: null,
        health: null,
        productivity: null,
        x: mid + 200,
        z: mid - 480,
      },
    ],
  };
}

export function startMockInjector(
  onState: (state: GameState) => void,
  hz = 2,
): () => void {
  const interval = setInterval(() => {
    onState(createMockState(Date.now()));
  }, 1000 / hz);
  onState(createMockState(Date.now()));
  return () => clearInterval(interval);
}
