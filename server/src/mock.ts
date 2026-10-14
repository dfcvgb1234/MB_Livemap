import type { AutoDriveGraph, CourseplayCourses, GameState, LivemapNotification } from "./types.js";

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

/** True while a production line should be blocked, then clear so the alert can arm again. */
function lineProblem(now: number, offsetMs: number) {
  const cycle = 14000;
  const phase = ((now + offsetMs) % cycle) / cycle;
  return phase >= 0.2 && phase < 0.75;
}

/** Climbs through the almost-full threshold, then drops so the alert can arm again. */
function cargoRatio(now: number, offsetMs: number) {
  const cycle = 12000;
  const phase = ((now + offsetMs) % cycle) / cycle;
  if (phase < 0.75) return 0.72 + (phase / 0.75) * 0.26;
  return 0.98 - ((phase - 0.75) / 0.25) * 0.38;
}

const MOCK_NOTIFICATIONS: Array<Omit<LivemapNotification, "id" | "ts">> = [
  {
    type: "notification",
    kind: "arrived",
    level: "info",
    text: "Driver of Lexion 8900 has reached Silo",
    vehicleId: "v-harvester-1",
    vehicleName: "Lexion 8900",
  },
  {
    type: "notification",
    kind: "stuck",
    level: "error",
    text: "Driver of MAN TGS got stuck",
    vehicleId: "v-truck-1",
    vehicleName: "MAN TGS",
  },
  {
    type: "notification",
    kind: "problem",
    level: "warn",
    text: "Driver of Fendt 942 can't calculate a path",
    vehicleId: "v-tractor-1",
    vehicleName: "Fendt 942",
  },
];

/** Deterministic-ish mock farm state that gently animates for demos. */
export function createMockState(t = Date.now()): GameState {
  // Slow phase so map markers stay easy to tap during demos.
  const phase = (t / 8000) % 360;
  const rad = (phase * Math.PI) / 180;
  const mapSize = 2048;
  const mid = mapSize / 2;

  const vehicles = [
    {
      id: "v-tractor-1",
      name: "Fendt 942",
      type: "tractor",
      category: "vehicle" as const,
      x: Math.cos(rad) * 180,
      z: Math.sin(rad) * 140,
      heading: ((phase + 90) % 360) * (Math.PI / 180),
      speed: 12 + Math.sin(rad * 2) * 2,
      engineOn: true,
      occupied: true,
      attached: ["Seeder"],
      fills: [
        { name: "Diesel", fillLevel: 312, capacity: 400 },
        { name: "Seeder · Seeds", fillLevel: 800, capacity: 1500 },
      ],
      damage: 0.04,
      adCapable: true,
      adActive: false,
      cpCapable: true,
      cpActive: false,
      adFillTypes: [
        { id: "1", name: "Wheat" },
        { id: "2", name: "Barley" },
        { id: "3", name: "Corn" },
      ],
    },
    {
      id: "v-harvester-1",
      name: "Lexion 8900",
      type: "harvester",
      category: "vehicle" as const,
      x: -160 + Math.sin(rad * 0.4) * 20,
      z: 280,
      heading: Math.PI * 0.15,
      speed: 8,
      engineOn: true,
      attached: ["Header 12m"],
      fills: [
        { name: "Diesel", fillLevel: 540, capacity: 800 },
        { name: "Wheat", fillLevel: Math.round(14500 * cargoRatio(t, 0)), capacity: 14500 },
      ],
      damage: 0.11,
      adCapable: true,
      adActive: true,
      adDestination: "Silo",
      adMode: "drive" as const,
      cpCapable: true,
      cpActive: false,
    },
    {
      id: "v-truck-1",
      name: "MAN TGS",
      type: "truck",
      category: "vehicle" as const,
      x: 340,
      z: -90,
      heading: -Math.PI / 2,
      speed: 0,
      engineOn: false,
      attached: [],
      fills: [{ name: "Diesel", fillLevel: 120, capacity: 600 }],
      damage: 0,
      adCapable: true,
      adActive: false,
      cpCapable: true,
      cpActive: false,
      adFillTypes: [
        { id: "1", name: "Wheat" },
        { id: "3", name: "Corn" },
      ],
    },
    {
      id: "v-seeder-1",
      name: "Seeder",
      type: "sowingMachine",
      category: "implement" as const,
      x: Math.cos(rad) * 180 + 12,
      z: Math.sin(rad) * 140 - 8,
      heading: ((phase + 90) % 360) * (Math.PI / 180),
      speed: 12,
      engineOn: false,
      attached: [],
      fills: [{ name: "Seeds", fillLevel: 800, capacity: 1500 }],
      damage: 0.02,
    },
    {
      id: "v-trailer-1",
      name: "Cramminge 20",
      type: "trailer",
      category: "trailer" as const,
      x: 80,
      z: 40,
      heading: 0.4,
      speed: 0,
      engineOn: false,
      attached: [],
      fills: [{ name: "Wheat", fillLevel: Math.round(24000 * cargoRatio(t, 4000)), capacity: 24000 }],
      damage: 0.08,
    },
  ];

  const fields = Array.from({ length: 12 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const ox = 200 + col * 420 - mid;
    // +Z is the bottom of the map. Negate the old north-up row so field 1 stays on screen at the top.
    const oz = 260 + row * 480 - mid;
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

  const hourTypes = ["SUN", "PARTIALLY_CLOUDY", "CLOUDY", "RAIN", "CLOUDY", "SUN"];
  const condition = hourTypes[Math.floor((phase / 60) % hourTypes.length)];
  const temperatureC = Math.round(14 + Math.sin(rad) * 6);
  const hourly = [
    {
      label: "Now",
      type: condition,
      temperatureC,
      lowTemperatureC: null,
      highTemperatureC: null,
      windRotation: 0.8,
      windVelocity: 3,
    },
    ...Array.from({ length: 12 }, (_, index) => {
      const hour = (8 + index * 2) % 24;
      return {
        label: `${String(hour).padStart(2, "0")}:00`,
        type: hourTypes[(index + 1) % hourTypes.length],
        temperatureC: Math.round(temperatureC + Math.sin(index / 2) * 3),
        lowTemperatureC: null,
        highTemperatureC: null,
        windRotation: (index * 0.4) % (Math.PI * 2),
        windVelocity: 2 + (index % 4),
      };
    }),
  ];
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const daily = dayLabels.map((label, index) => ({
    label,
    type: hourTypes[index % hourTypes.length],
    temperatureC: null,
    lowTemperatureC: 6 + index,
    highTemperatureC: 14 + (index % 5),
    windRotation: (index * 0.7) % (Math.PI * 2),
    windVelocity: 2 + (index % 5),
  }));

  return {
    type: "state",
    ts: t,
    source: "mock",
    mapName: "Riverbend Mock",
    mapSize,
    calendar: {
      period: (Math.floor(t / 24000) % 12) + 1,
      day: (Math.floor(t / 8000) % 3) + 1,
      daysPerPeriod: 3,
    },
    vehicles,
    weather: {
      condition,
      temperatureC,
      hourly,
      daily,
    },
    fields,
    productions: [
      {
        id: "prod-dairy",
        name: "Dairy Plant",
        status: "active",
        lines: [
          { name: "Butter", status: "RUNNING" },
          { name: "Cheese", status: lineProblem(t, 0) ? "MISSING_INPUTS" : "RUNNING" },
        ],
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
        lines: [{ name: "Flour", status: lineProblem(t, 5000) ? "NO_OUTPUT_SPACE" : "RUNNING" }],
        inputs: [
          { name: "Wheat", fillLevel: 18000, capacity: 40000 },
          { name: "Barley", fillLevel: 9000, capacity: 20000 },
        ],
        outputs: [
          {
            name: "Flour",
            fillLevel: lineProblem(t, 5000) ? 15000 : 4500,
            capacity: 15000,
          },
        ],
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
        capacity: 80,
        health: 0.92,
        productivity: 88,
        herds: [{ name: "Holstein", count: 42 }],
        fills: [
          { name: "Hay (40%)", fillLevel: 4000, capacity: 12000 },
          { name: "Water", fillLevel: 1800, capacity: 3000 },
          { name: "Milk", fillLevel: 900, capacity: 2000 },
        ],
        palletBlocked: false,
        x: -400,
        z: -320,
      },
      {
        id: "anim-pigs",
        name: "Pig Barn",
        animalType: "pig",
        count: 86,
        health: 0.85,
        productivity: 0.79,
        x: 420,
        z: 160,
      },
      {
        id: "anim-chickens",
        name: "Chicken Coop",
        animalType: "chicken",
        count: 210,
        health: 0.95,
        productivity: 0.91,
        x: -120,
        z: 480,
      },
      {
        id: "anim-sheep",
        name: "Sheep Meadow",
        animalType: "sheep",
        count: null,
        health: null,
        productivity: null,
        x: 200,
        z: -480,
      },
    ],
  };
}

/** A small named network so the AutoDrive page can be checked without the game. */
export function createMockAutoDrive(): AutoDriveGraph {
  return {
    type: "autodrive",
    available: true,
    revision: 1,
    waypoints: [
      { id: 1, x: -200, z: -80, out: [2] },
      { id: 2, x: 0, z: -80, out: [1, 3, 4] },
      { id: 3, x: 200, z: -40, out: [2, 5] },
      { id: 4, x: 40, z: 160, out: [2, 6] },
      { id: 5, x: 360, z: 80, out: [3] },
      { id: 6, x: -80, z: 320, out: [4] },
    ],
    markers: [
      { id: 1, name: "Farm", x: -200, z: -80 },
      { id: 2, name: "Shop", x: 360, z: 80 },
      { id: 3, name: "Silo", x: -80, z: 320 },
    ],
  };
}

/** Saved courses so the Courseplay card can be checked without the game. */
export function createMockCourseplay(): CourseplayCourses {
  return {
    type: "courseplay",
    available: true,
    revision: 1,
    courses: [
      { id: "field-12-cultivate", name: "Cultivate", folder: "Field 12", vehicles: 5 },
      { id: "field-12-harvest", name: "Harvest", folder: "Field 12", vehicles: 2 },
      { id: "field-3-seed", name: "Seed", folder: "Field 3", vehicles: 1 },
    ],
  };
}

export function startMockInjector(
  onState: (state: GameState) => void,
  hz = 1,
  onNotification?: (note: LivemapNotification) => void,
): () => void {
  const interval = setInterval(() => {
    onState(createMockState(Date.now()));
  }, 1000 / hz);
  onState(createMockState(Date.now()));

  let step = 0;
  let noteInterval: ReturnType<typeof setInterval> | null = null;
  const emit = () => {
    const sample = MOCK_NOTIFICATIONS[step % MOCK_NOTIFICATIONS.length];
    step += 1;
    onNotification?.({
      ...sample,
      id: `mock-${Date.now()}-${step}`,
      ts: Date.now(),
    });
  };
  const firstNote = onNotification
    ? setTimeout(() => {
        emit();
        noteInterval = setInterval(emit, 9000);
      }, 3000)
    : null;

  return () => {
    clearInterval(interval);
    if (noteInterval) clearInterval(noteInterval);
    if (firstNote) clearTimeout(firstNote);
  };
}
