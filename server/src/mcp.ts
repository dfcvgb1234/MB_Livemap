import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  BridgeUnavailable,
  loadSnapshot,
  postCommand,
  type FarmSnapshot,
  type ModFlags,
} from "./bridgeClient.js";
import { CROP_CALENDAR, calendarKey, monthName } from "./cropCalendar.js";
import type {
  AnimalHusbandry,
  AutoDriveMarker,
  AutoDriveMode,
  CourseplayCourse,
  CourseplayStart,
  Field,
  Production,
  ProductionFill,
  Vehicle,
  Weather,
  WeatherPoint,
  WhitelistAction,
} from "./types.js";

const LIST_FIELDS =
  "List fields with crop, growth, area, ownership, and fieldwork needs (fertilizer, spraying, weeds, plowing, lime, stones, rolling).";
const LIST_FIELDS_PF = `${LIST_FIELDS} Includes Precision Farming soil type, pH, and nitrogen.`;
const GET_FIELD = "Get one field, including its polygon. Pass a field id or a unique field name.";
const GET_FIELD_PF =
  "Get one field, including its polygon, Precision Farming soil type, pH, and nitrogen. Pass a field id or a unique field name.";
const LIST_VEHICLES = "List vehicles and implements with position, speed, engine, fills, damage, and attachments.";
const GET_VEHICLE = "Get one vehicle or implement. Pass a vehicle id or a unique vehicle name.";
const START_AD =
  "Start AutoDrive (autodrive.start). Modes are drive, pickup, deliver, load, unload, and fieldwork. pickup and load need a fill type and a second destination. unload needs a second destination. destination is a marker id or name from list_autodrive_destinations. fieldwork runs a saved Courseplay course: pass course (id or name from list_courseplay_courses), and optionally cpStart and cpLane. Returns an error if AutoDrive is not loaded.";

export type LivemapMcp = {
  server: McpServer;
  refreshTools: () => Promise<void>;
};

export function createLivemapMcp(): LivemapMcp {
const server = new McpServer(
  { name: "mb-livemap", version: "0.1.0" },
  {
    instructions:
      "Read fields, vehicles, weather, the crop calendar, productions, and animals from the running MB Livemap bridge, and run its whitelisted vehicle commands. AutoDrive commands are list_autodrive_destinations, start_autodrive, and stop_autodrive. Courseplay commands are list_courseplay_courses, start_courseplay, and stop_courseplay. Start the bridge before calling these tools.",
  },
);

function toolJson(value: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function downResult(): CallToolResult {
  return toolJson({ error: "The livemap bridge is not running" }, true);
}

async function snapshotOrError(): Promise<FarmSnapshot | CallToolResult> {
  try {
    const snapshot = await loadSnapshot();
    if (!snapshot) return downResult();
    return snapshot;
  } catch (err) {
    if (err instanceof BridgeUnavailable) return downResult();
    return toolJson({ error: err instanceof Error ? err.message : "Could not read the bridge" }, true);
  }
}

function isSnapshot(value: FarmSnapshot | CallToolResult): value is FarmSnapshot {
  return "state" in value && "mods" in value;
}

type Choice<T> = { ok: true; item: T } | { ok: false; error: string; matches?: Array<{ id: string; name: string }> };

function pickOne<T>(
  query: string,
  items: T[],
  kind: string,
  idOf: (item: T) => string,
  labelOf: (item: T) => string,
): Choice<T> {
  const q = query.trim();
  if (q === "") return { ok: false, error: `${kind} is required` };
  const ql = q.toLowerCase();
  const byId = items.filter((item) => idOf(item).toLowerCase() === ql);
  if (byId.length === 1) return { ok: true, item: byId[0]! };
  const exact = items.filter((item) => labelOf(item).toLowerCase() === ql);
  const pool = exact.length > 0 ? exact : items.filter((item) => labelOf(item).toLowerCase().includes(ql));
  if (pool.length === 1) return { ok: true, item: pool[0]! };
  if (pool.length > 1) {
    return {
      ok: false,
      error: `More than one ${kind} matches "${q}". Choose one.`,
      matches: pool.map((item) => ({ id: idOf(item), name: labelOf(item) })),
    };
  }
  return { ok: false, error: `Unknown ${kind}: ${q}` };
}

function choiceResult(choice: Extract<Choice<unknown>, { ok: false }>) {
  return toolJson(choice.matches ? { error: choice.error, matches: choice.matches } : { error: choice.error }, true);
}

function fieldView(field: Field, precision: boolean, withPolygon: boolean) {
  const view: Record<string, unknown> = {
    id: field.id,
    name: field.name ?? null,
    fruitType: field.fruitType,
    growthState: field.growthState,
    growthMax: field.growthMax,
    cropState: field.cropState ?? null,
    areaHa: field.areaHa ?? null,
    owned: field.owned,
    x: field.x,
    z: field.z,
    needsRolling: field.needsRolling ?? null,
    needsFertilizer: field.needsFertilizer ?? null,
    fertilizerLevel: field.fertilizerLevel ?? null,
    fertilizerMax: field.fertilizerMax ?? null,
    needsSpraying: field.needsSpraying ?? null,
    weeds: field.weeds ?? null,
    needsPlowing: field.needsPlowing ?? null,
    needsLime: field.needsLime ?? null,
    needsStones: field.needsStones ?? null,
  };
  if (withPolygon) view.polygon = field.polygon;
  if (precision) {
    const sample = field.precisionFarming;
    view.precisionFarming = sample
      ? {
          soilType: sample.soilType,
          ph: sample.ph,
          phStatus: sample.phStatus,
          nitrogen: sample.nitrogen,
          nitrogenTarget: sample.nitrogenTarget,
        }
      : null;
  }
  return view;
}

function vehicleView(vehicle: Vehicle, mods: ModFlags) {
  const view: Record<string, unknown> = {
    id: vehicle.id,
    name: vehicle.name,
    type: vehicle.type,
    category: vehicle.category ?? null,
    x: vehicle.x,
    z: vehicle.z,
    heading: vehicle.heading,
    speed: vehicle.speed,
    engineOn: vehicle.engineOn,
    occupied: vehicle.occupied === true,
    attached: vehicle.attached,
    fills: vehicle.fills ?? [],
    damage: vehicle.damage ?? null,
  };
  if (vehicle.farmId != null) {
    view.farmId = vehicle.farmId;
    view.farmName = vehicle.farmName ?? null;
  }
  if (mods.autodrive) {
    view.adCapable = vehicle.adCapable === true;
    view.adActive = vehicle.adActive === true;
    view.adDestination = vehicle.adDestination ?? null;
    view.adSecondDestination = vehicle.adSecondDestination ?? null;
    view.adMode = vehicle.adMode ?? null;
    view.adFillTypes = vehicle.adFillTypes ?? [];
  }
  if (mods.courseplay) {
    view.cpCapable = vehicle.cpCapable === true;
    view.cpActive = vehicle.cpActive === true;
    view.cpCourse = vehicle.cpCourse ?? null;
  }
  return view;
}

function vehicleListDescription(mods: ModFlags) {
  const extra = [mods.autodrive ? "AutoDrive status" : "", mods.courseplay ? "Courseplay status" : ""].filter(
    (part) => part !== "",
  );
  if (extra.length === 0) return LIST_VEHICLES;
  return `${LIST_VEHICLES} Includes ${extra.join(" and ")}.`;
}

function vehicleGetDescription(mods: ModFlags) {
  const extra = [mods.autodrive ? "AutoDrive status" : "", mods.courseplay ? "Courseplay status" : ""].filter(
    (part) => part !== "",
  );
  if (extra.length === 0) return GET_VEHICLE;
  return `${GET_VEHICLE} Includes ${extra.join(" and ")}.`;
}

const vehicleId = z.string().describe("Vehicle id from list_vehicles, or a unique vehicle name");

const driveModes = ["drive", "pickup", "deliver", "load", "unload"] as const;
const allModes = [...driveModes, "fieldwork"] as const;

const adStartDrive = {
  vehicleId,
  mode: z.enum(driveModes).describe("drive, pickup, deliver, load, or unload"),
  destination: z.string().describe("Marker id or name from list_autodrive_destinations"),
  secondDestination: z
    .string()
    .optional()
    .describe("Second marker id or name. Required for pickup, load, and unload."),
  fillType: z.string().optional().describe("Fruit or fill type from the vehicle adFillTypes. Required for pickup and load."),
};

const adStartWide = {
  ...adStartDrive,
  mode: z.enum(allModes).describe("drive, pickup, deliver, load, unload, or fieldwork"),
  destination: z
    .string()
    .optional()
    .describe("Marker id or name from list_autodrive_destinations. Required unless mode is fieldwork."),
  course: z
    .string()
    .optional()
    .describe("Course id or name from list_courseplay_courses. Required when mode is fieldwork."),
  cpStart: z.enum(["first", "nearest", "last"]).optional().describe("Where fieldwork starts. Defaults to the first waypoint."),
  cpLane: z.number().optional().describe("Fieldwork lane. Negative is left, positive is right, 0 is the middle."),
};

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;

const listFields = server.registerTool(
  "list_fields",
  { description: LIST_FIELDS, annotations: readOnly },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    return toolJson({
      fields: snapshot.state.fields.map((field) => fieldView(field, snapshot.mods.precisionFarming, false)),
    });
  },
);

const getField = server.registerTool(
  "get_field",
  {
    description: GET_FIELD,
    annotations: readOnly,
    inputSchema: { field: z.string().describe("Field id or unique field name") },
  },
  async ({ field }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    const choice = pickOne(field, snapshot.state.fields, "field", (item) => item.id, (item) => item.name ?? item.id);
    if (!choice.ok) return choiceResult(choice);
    return toolJson(fieldView(choice.item, snapshot.mods.precisionFarming, true));
  },
);

const listVehicles = server.registerTool(
  "list_vehicles",
  { description: LIST_VEHICLES, annotations: readOnly },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    return toolJson({
      vehicles: snapshot.state.vehicles.map((vehicle) => vehicleView(vehicle, snapshot.mods)),
    });
  },
);

const getVehicle = server.registerTool(
  "get_vehicle",
  {
    description: GET_VEHICLE,
    annotations: readOnly,
    inputSchema: { vehicleId },
  },
  async ({ vehicleId: query }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    const choice = pickVehicle(snapshot, query);
    if (!choice.ok) return choiceResult(choice);
    return toolJson(vehicleView(choice.item, snapshot.mods));
  },
);

server.registerTool(
  "livemap_status",
  {
    description: "Bridge connection, map, in-game date, and which of AutoDrive, Courseplay, and Precision Farming are active.",
    annotations: readOnly,
  },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    return toolJson({
      bridge: true,
      modConnected: snapshot.health.modConnected,
      mockActive: snapshot.health.mockActive,
      lastStateTs: snapshot.health.lastStateTs,
      mapName: snapshot.state.mapName,
      mapSize: snapshot.state.mapSize,
      calendar: snapshot.state.calendar,
      mods: snapshot.mods,
    });
  },
);

function weatherPoint(point: WeatherPoint) {
  return {
    label: point.label,
    type: point.type,
    temperatureC: point.temperatureC,
    lowTemperatureC: point.lowTemperatureC,
    highTemperatureC: point.highTemperatureC,
    windRotation: point.windRotation,
    windVelocity: point.windVelocity,
  };
}

function weatherView(weather: Weather) {
  return {
    condition: weather.condition,
    temperatureC: weather.temperatureC,
    hourly: weather.hourly?.map(weatherPoint) ?? null,
    daily: weather.daily?.map(weatherPoint) ?? null,
  };
}

function fillView(fill: ProductionFill) {
  return { name: fill.name, fillLevel: fill.fillLevel, capacity: fill.capacity };
}

function productionView(production: Production) {
  return {
    id: production.id,
    name: production.name,
    status: production.status,
    lines: (production.lines ?? []).map((line) => ({ name: line.name, status: line.status })),
    inputs: production.inputs.map(fillView),
    outputs: production.outputs.map(fillView),
  };
}

function animalView(animal: AnimalHusbandry) {
  return {
    id: animal.id,
    name: animal.name,
    animalType: animal.animalType,
    count: animal.count,
    capacity: animal.capacity ?? null,
    health: animal.health,
    productivity: animal.productivity,
    herds: animal.herds ?? [],
    fills: (animal.fills ?? []).map(fillView),
    palletBlocked: animal.palletBlocked ?? null,
    x: animal.x,
    z: animal.z,
  };
}

server.registerTool(
  "get_weather",
  {
    description:
      "Current weather, hourly forecast, and daily forecast. Temperatures are Celsius. windRotation is radians and windVelocity is meters per second.",
    annotations: readOnly,
  },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    return toolJson(weatherView(snapshot.state.weather));
  },
);

server.registerTool(
  "get_crop_calendar",
  {
    description:
      "In-game date and the sowing and harvest months for each crop. onMap is true when that crop is growing on a field. plantNow and harvestNow are the crops in season this month.",
    annotations: readOnly,
  },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    const calendar = snapshot.state.calendar;
    const month = calendar != null && calendar.period >= 1 && calendar.period <= 12 ? Math.round(calendar.period) : null;
    const onMap = new Set(
      snapshot.state.fields
        .map((field) => calendarKey(field.fruitType))
        .filter((key): key is string => key != null),
    );
    const crops = CROP_CALENDAR.map((crop) => ({
      fruit: crop.fruit,
      label: crop.label,
      sowMonths: crop.sow.map(monthName),
      harvestMonths: crop.harvest.map(monthName),
      onMap: onMap.has(crop.fruit),
      plantNow: month != null && crop.sow.includes(month),
      harvestNow: month != null && crop.harvest.includes(month),
    }));
    return toolJson({
      date:
        calendar == null || month == null
          ? null
          : {
              month,
              monthName: monthName(month),
              day: calendar.day,
              daysPerPeriod: calendar.daysPerPeriod,
            },
      plantNow: crops.filter((crop) => crop.plantNow).map((crop) => crop.label),
      harvestNow: crops.filter((crop) => crop.harvestNow).map((crop) => crop.label),
      crops,
    });
  },
);

server.registerTool(
  "list_productions",
  {
    description: "List production points with line status and input and output fill levels.",
    annotations: readOnly,
  },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    return toolJson({ productions: snapshot.state.productions.map(productionView) });
  },
);

server.registerTool(
  "get_production",
  {
    description: "Get one production point. Pass its id or a unique name.",
    annotations: readOnly,
    inputSchema: { production: z.string().describe("Production id or unique name") },
  },
  async ({ production }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    const choice = pickOne(
      production,
      snapshot.state.productions,
      "production",
      (item) => item.id,
      (item) => item.name,
    );
    if (!choice.ok) return choiceResult(choice);
    return toolJson(productionView(choice.item));
  },
);

server.registerTool(
  "list_animals",
  {
    description: "List animal pens with count, health, productivity, herds, and fill levels.",
    annotations: readOnly,
  },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    return toolJson({ animals: snapshot.state.animals.map(animalView) });
  },
);

server.registerTool(
  "get_animal",
  {
    description: "Get one animal pen. Pass its id or a unique name.",
    annotations: readOnly,
    inputSchema: { animal: z.string().describe("Animal pen id or unique name") },
  },
  async ({ animal }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    const choice = pickOne(animal, snapshot.state.animals, "animal pen", (item) => item.id, (item) => item.name);
    if (!choice.ok) return choiceResult(choice);
    return toolJson(animalView(choice.item));
  },
);

function pickVehicle(snapshot: FarmSnapshot, query: string) {
  return pickOne(query, snapshot.state.vehicles, "vehicle", (vehicle) => vehicle.id, (vehicle) => vehicle.name);
}

async function runVehicleAction(action: WhitelistAction, query: string, extra?: Omit<Parameters<typeof postCommand>[0], "action" | "vehicleId">) {
  const snapshot = await snapshotOrError();
  if (!isSnapshot(snapshot)) return snapshot;
  const choice = pickVehicle(snapshot, query);
  if (!choice.ok) return choiceResult(choice);
  try {
    const result = await postCommand({ action, vehicleId: choice.item.id, ...extra });
    return toolJson(result, !result.ok);
  } catch (err) {
    if (err instanceof BridgeUnavailable) return downResult();
    return toolJson({ error: err instanceof Error ? err.message : "Command failed" }, true);
  }
}

server.registerTool(
  "start_engine",
  { description: "Start a vehicle engine.", inputSchema: { vehicleId } },
  async ({ vehicleId: query }) => runVehicleAction("engine.start", query),
);

server.registerTool(
  "stop_engine",
  { description: "Stop a vehicle engine.", inputSchema: { vehicleId } },
  async ({ vehicleId: query }) => runVehicleAction("engine.stop", query),
);

server.registerTool(
  "attach_implement",
  {
    description: "Attach an implement or trailer to a vehicle. targetId is that implement's id from list_vehicles.",
    inputSchema: {
      vehicleId,
      targetId: z.string().describe("Implement or trailer id from list_vehicles, or a unique name"),
    },
  },
  async ({ vehicleId: query, targetId }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    const vehicle = pickVehicle(snapshot, query);
    if (!vehicle.ok) return choiceResult(vehicle);
    const target = pickVehicle(snapshot, targetId);
    if (!target.ok) return choiceResult(target);
    try {
      const result = await postCommand({
        action: "attach",
        vehicleId: vehicle.item.id,
        targetId: target.item.id,
      });
      return toolJson(result, !result.ok);
    } catch (err) {
      if (err instanceof BridgeUnavailable) return downResult();
      return toolJson({ error: err instanceof Error ? err.message : "Command failed" }, true);
    }
  },
);

server.registerTool(
  "detach_implement",
  { description: "Detach the first implement from a vehicle.", inputSchema: { vehicleId } },
  async ({ vehicleId: query }) => runVehicleAction("detach", query),
);

function markerLabel(marker: AutoDriveMarker) {
  return marker.name;
}

function courseLabel(course: CourseplayCourse) {
  return `${course.folder} / ${course.name}`;
}

server.registerTool(
  "list_autodrive_destinations",
  {
    description: "List AutoDrive destinations (marker id, name, and position). Returns an error if AutoDrive is not loaded.",
    annotations: readOnly,
  },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    if (!snapshot.mods.autodrive) return toolJson({ error: "AutoDrive is not available" }, true);
    return toolJson({
      destinations: snapshot.autodrive.markers.map((marker) => ({
        id: marker.id,
        name: marker.name,
        x: marker.x,
        z: marker.z,
      })),
    });
  },
);

const NEEDS_SECOND = new Set<AutoDriveMode>(["pickup", "load", "unload"]);
const NEEDS_FILL = new Set<AutoDriveMode>(["pickup", "load"]);

server.registerTool(
  "start_autodrive",
  { description: START_AD, inputSchema: adStartWide },
  async ({ vehicleId: query, mode, destination, secondDestination, fillType, course, cpStart, cpLane }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    if (!snapshot.mods.autodrive) return toolJson({ error: "AutoDrive is not available" }, true);
    const vehicle = pickVehicle(snapshot, query);
    if (!vehicle.ok) return choiceResult(vehicle);

    if (mode === "fieldwork") {
      if (!snapshot.mods.courseplay) return toolJson({ error: "Courseplay is not available" }, true);
      if (!course) return toolJson({ error: "fieldwork requires a course" }, true);
      const chosen = pickOne(course, snapshot.courseplay.courses, "course", (item) => item.id, courseLabel);
      if (!chosen.ok) return choiceResult(chosen);
      return runVehicleAction("autodrive.start", vehicle.item.id, {
        mode: "fieldwork",
        targetId: chosen.item.id,
        ...(cpStart ? { cpStart: cpStart as CourseplayStart } : {}),
        ...(cpLane != null ? { cpLane } : {}),
      });
    }

    if (!destination) return toolJson({ error: "destination is required" }, true);
    const marker = pickOne(destination, snapshot.autodrive.markers, "destination", (item) => String(item.id), markerLabel);
    if (!marker.ok) return choiceResult(marker);
    let secondId: string | undefined;
    if (secondDestination) {
      const second = pickOne(
        secondDestination,
        snapshot.autodrive.markers,
        "destination",
        (item) => String(item.id),
        markerLabel,
      );
      if (!second.ok) return choiceResult(second);
      secondId = String(second.item.id);
    } else if (NEEDS_SECOND.has(mode)) {
      return toolJson({ error: "secondDestination is required for this mode" }, true);
    }
    if (NEEDS_FILL.has(mode) && !fillType) return toolJson({ error: "fillType is required for this mode" }, true);
    return runVehicleAction("autodrive.start", vehicle.item.id, {
      mode,
      targetId: String(marker.item.id),
      ...(secondId ? { secondTargetId: secondId } : {}),
      ...(fillType ? { fillType } : {}),
    });
  },
);

server.registerTool(
  "stop_autodrive",
  { description: "Stop AutoDrive (autodrive.stop) on a vehicle. Returns an error if AutoDrive is not loaded.", inputSchema: { vehicleId } },
  async ({ vehicleId: query }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    if (!snapshot.mods.autodrive) return toolJson({ error: "AutoDrive is not available" }, true);
    return runVehicleAction("autodrive.stop", query);
  },
);

server.registerTool(
  "list_courseplay_courses",
  {
    description:
      "List saved Courseplay courses (id, name, folder, and how many vehicles the course was generated for). Returns an error if Courseplay is not loaded.",
    annotations: readOnly,
  },
  async () => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    if (!snapshot.mods.courseplay) return toolJson({ error: "Courseplay is not available" }, true);
    return toolJson({
      courses: snapshot.courseplay.courses.map((course) => ({
        id: course.id,
        name: course.name,
        folder: course.folder,
        vehicles: course.vehicles ?? 1,
      })),
    });
  },
);

server.registerTool(
  "start_courseplay",
  {
    description: "Start a saved Courseplay course on a vehicle (courseplay.start). Returns an error if Courseplay is not loaded.",
    inputSchema: {
      vehicleId,
      course: z.string().describe("Course id or name from list_courseplay_courses"),
      start: z.enum(["first", "nearest", "last"]).optional().describe("Where to start. Defaults to the first waypoint."),
      lane: z.number().optional().describe("Lane. Negative is left, positive is right, 0 is the middle."),
    },
  },
  async ({ vehicleId: query, course, start, lane }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    if (!snapshot.mods.courseplay) return toolJson({ error: "Courseplay is not available" }, true);
    const vehicle = pickVehicle(snapshot, query);
    if (!vehicle.ok) return choiceResult(vehicle);
    const chosen = pickOne(course, snapshot.courseplay.courses, "course", (item) => item.id, courseLabel);
    if (!chosen.ok) return choiceResult(chosen);
    return runVehicleAction("courseplay.start", vehicle.item.id, {
      targetId: chosen.item.id,
      ...(start ? { cpStart: start } : {}),
      ...(lane != null ? { cpLane: lane } : {}),
    });
  },
);

server.registerTool(
  "stop_courseplay",
  { description: "Stop Courseplay (courseplay.stop) on a vehicle. Returns an error if Courseplay is not loaded.", inputSchema: { vehicleId } },
  async ({ vehicleId: query }) => {
    const snapshot = await snapshotOrError();
    if (!isSnapshot(snapshot)) return snapshot;
    if (!snapshot.mods.courseplay) return toolJson({ error: "Courseplay is not available" }, true);
    return runVehicleAction("courseplay.stop", query);
  },
);

function setDescription(tool: RegisteredTool, description: string) {
  if (tool.description === description) return;
  tool.update({ description });
}

function syncTools(mods: ModFlags) {
  setDescription(listFields, mods.precisionFarming ? LIST_FIELDS_PF : LIST_FIELDS);
  setDescription(getField, mods.precisionFarming ? GET_FIELD_PF : GET_FIELD);
  setDescription(listVehicles, vehicleListDescription(mods));
  setDescription(getVehicle, vehicleGetDescription(mods));
}

let modKey = "";

async function refreshTools() {
  let snapshot: FarmSnapshot | null = null;
  try {
    snapshot = await loadSnapshot();
  } catch (err) {
    console.error("[mcp]", err instanceof Error ? err.message : err);
    return;
  }
  const mods = snapshot?.mods ?? { autodrive: false, courseplay: false, precisionFarming: false };
  const key = `${mods.autodrive}:${mods.courseplay}:${mods.precisionFarming}`;
  if (key === modKey) return;
  modKey = key;
  syncTools(mods);
}

  return { server, refreshTools };
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("/src/mcp.ts") || entry.endsWith("/src/mcp.js")) {
  const mcp = createLivemapMcp();
  await mcp.refreshTools();
  const timer = setInterval(() => {
    void mcp.refreshTools();
  }, 2000);
  timer.unref();
  await mcp.server.connect(new StdioServerTransport());
}
