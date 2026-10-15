export type Vehicle = {
  id: string;
  name: string;
  type: string | null;
  /** Map layer. Missing values are drivable vehicles from older mod builds. */
  category?: "vehicle" | "implement" | "trailer";
  x: number;
  z: number;
  heading: number;
  speed: number;
  engineOn: boolean;
  /** True while a player is entered in the vehicle. */
  occupied?: boolean;
  attached: string[];
  /** HUD tanks: fuel, DEF, cargo, and the same from attached tools. */
  fills?: ProductionFill[];
  /** Wear from 0 (fresh) to 1 (destroyed), when the game reports it. */
  damage?: number | null;
  /** Present when the vehicle has an AutoDrive specialization. */
  adCapable?: boolean;
  adActive?: boolean;
  adDestination?: string | null;
  adSecondDestination?: string | null;
  adMode?: AutoDriveMode | null;
  adFillTypes?: AutoDriveFillType[];
  /** Present when the vehicle has a Courseplay specialization. */
  cpCapable?: boolean;
  cpActive?: boolean;
  cpCourse?: string | null;
};

export type WeatherPoint = {
  label: string;
  type: string | null;
  temperatureC: number | null;
  lowTemperatureC: number | null;
  highTemperatureC: number | null;
  windRotation: number | null;
  windVelocity: number | null;
};

export type Weather = {
  condition: string | null;
  temperatureC: number | null;
  hourly: WeatherPoint[] | null;
  daily: WeatherPoint[] | null;
};

export type Field = {
  id: string;
  /** Number shown on the in-game map, when the mod can read it. */
  name?: string | null;
  fruitType: string | null;
  /** CSS color from the game's fruit map color, when the mod sends one. */
  fruitColor?: string | null;
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

export type ProductionLine = {
  name: string;
  status: string | null;
};

export type Production = {
  id: string;
  name: string;
  status: string | null;
  lines?: ProductionLine[];
  inputs: ProductionFill[];
  outputs: ProductionFill[];
};

export type AnimalHerd = {
  name: string;
  count: number;
};

export type AnimalHusbandry = {
  id: string;
  name: string;
  animalType: string | null;
  count: number | null;
  capacity?: number | null;
  health: number | null;
  productivity: number | null;
  herds?: AnimalHerd[];
  fills?: ProductionFill[];
  palletBlocked?: boolean | null;
  x: number | null;
  z: number | null;
};

export type GameCalendar = {
  /** Calendar month: 1 = January … 12 = December. */
  period: number;
  /** Day within that month, starting at 1. */
  day: number;
  daysPerPeriod: number;
};

export type GameState = {
  type: "state";
  ts: number;
  source: "mod" | "mock";
  mapName: string | null;
  mapSize: number | null;
  /** In-game date. Null until the mod sends one. */
  calendar: GameCalendar | null;
  vehicles: Vehicle[];
  weather: Weather;
  fields: Field[];
  productions: Production[];
  animals: AnimalHusbandry[];
};

export type AutoDriveWaypoint = {
  id: number;
  x: number;
  z: number;
  out: number[];
};

export type AutoDriveFillType = {
  id: string;
  name: string;
};

export type AutoDriveMode = "drive" | "pickup" | "deliver" | "load" | "unload" | "fieldwork";

export type CourseplayStart = "first" | "nearest" | "last";

export type CourseplayCourse = {
  /** Full path of the saved course. This is the id used to start it. */
  id: string;
  name: string;
  folder: string;
  /** Vehicles this course was generated for, from 1 to 5. */
  vehicles?: number;
};

export type CourseplayCourses = {
  type: "courseplay";
  available: boolean;
  revision?: number;
  courses?: CourseplayCourse[];
};

export type AutoDriveMarker = {
  /** AutoDrive marker index. This is the destination id used to start a drive. */
  id: number;
  name: string;
  x: number;
  z: number;
};

export type AutoDriveGraph = {
  type: "autodrive";
  available: boolean;
  revision?: number;
  waypoints?: AutoDriveWaypoint[];
  markers?: AutoDriveMarker[];
};

export type WhitelistAction =
  | "engine.start"
  | "engine.stop"
  | "attach"
  | "detach"
  | "autodrive.start"
  | "autodrive.stop"
  | "courseplay.start"
  | "courseplay.stop";

export type CommandMessage = {
  type: "command";
  id: string;
  action: WhitelistAction;
  vehicleId: string;
  targetId?: string;
  /** AutoDrive job. Defaults to drive when omitted. */
  mode?: AutoDriveMode;
  secondTargetId?: string;
  /** Fill-type index for pickup and load. */
  fillType?: string;
  /** Courseplay start point. Defaults to the first waypoint. */
  cpStart?: CourseplayStart;
  /** Courseplay lane. Negative is left, positive is right, 0 is the middle. */
  cpLane?: number;
};

export type CommandResult = {
  type: "commandResult";
  id: string;
  ok: boolean;
  error?: string;
};

export type NotificationKind = "arrived" | "stuck" | "problem" | "info" | "finished";

export type NotificationLevel = "info" | "warn" | "error";

export type LivemapNotification = {
  type: "notification";
  id: string;
  kind: NotificationKind;
  level: NotificationLevel;
  text: string;
  vehicleId?: string;
  vehicleName?: string;
  ts: number;
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
