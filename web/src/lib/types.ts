export type Vehicle = {
  id: string;
  name: string;
  type: string | null;
  x: number;
  z: number;
  heading: number;
  speed: number;
  engineOn: boolean;
  attached: string[];
};

export type Weather = {
  condition: string | null;
  temperatureC: number | null;
  forecast: Array<{
    day: string;
    condition: string | null;
    tempMinC: number | null;
    tempMaxC: number | null;
  }> | null;
};

export type Field = {
  id: string;
  fruitType: string | null;
  growthState: number | null;
  growthMax: number | null;
  owned: boolean | null;
  x: number | null;
  z: number | null;
  polygon: Array<{ x: number; z: number }> | null;
};

export type ProductionFill = {
  name: string;
  fillLevel: number | null;
  capacity: number | null;
};

export type Production = {
  id: string;
  name: string;
  status: string | null;
  inputs: ProductionFill[];
  outputs: ProductionFill[];
};

export type AnimalHusbandry = {
  id: string;
  name: string;
  animalType: string | null;
  count: number | null;
  health: number | null;
  productivity: number | null;
  x: number | null;
  z: number | null;
};

export type GameState = {
  type: "state";
  ts: number;
  source: "mod" | "mock";
  mapName: string | null;
  mapSize: number | null;
  vehicles: Vehicle[];
  weather: Weather;
  fields: Field[];
  productions: Production[];
  animals: AnimalHusbandry[];
};

export type WhitelistAction =
  | "engine.start"
  | "engine.stop"
  | "attach"
  | "detach";

export type CommandMessage = {
  type: "command";
  id: string;
  action: WhitelistAction;
  vehicleId: string;
  targetId?: string;
};

export type CommandResult = {
  type: "commandResult";
  id: string;
  ok: boolean;
  error?: string;
};

export type StatusMessage = {
  type: "status";
  modConnected: boolean;
  mockActive: boolean;
  lastStateTs: number | null;
};

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";
