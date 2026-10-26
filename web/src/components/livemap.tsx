"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { XIcon } from "lucide-react";
import type { AutoDriveGraph, CommandResult, FarmInfo, Field, GameState, MapPlayer, Vehicle } from "@/lib/types";
import { fruitColor } from "@/lib/crop-calendar";
import { machineColor } from "@/lib/machine-colors";
import type { MapImageFit } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useLivemapContext } from "@/components/livemap-provider";
import { useSettings } from "@/components/settings-provider";

type Props = {
  state: GameState | null;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSelectPlayer?: (player: MapPlayer) => void;
  onSelectField?: (field: Field, point: { x: number; z: number }) => void;
  selectedId?: string | null;
  selectedPlayerId?: string | null;
  selectedFieldId?: string | null;
  /** When set and available, routes stay drawn. The main livemap omits this. */
  autoDrive?: AutoDriveGraph | null;
  /** Returns the command id, or an empty string when the bridge is not connected. */
  onScan?: (x: number, z: number) => string;
  scanResult?: CommandResult | null;
};

type ScanAnchor = {
  x: number;
  z: number;
  onField: boolean;
  phase: "ready" | "scanning" | "error";
  commandId: string | null;
  error: string | null;
};

type View = {
  x: number;
  y: number;
  scale: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;
/** Vehicle names stay hidden until the map is zoomed past this. */
const VEHICLE_LABEL_SCALE = 2;
const PAN_THRESHOLD_PX = 8;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type MapFrame = {
  minX: number;
  minZ: number;
  span: number;
};

/**
 * FS25 terrain is centered on the origin.
 * The in-game map draws +Z toward the bottom, so a top-left field stays top-left.
 * The frame grows past mapSize when a field sits outside the reported terrain, and
 * keeps a margin so the outer fields are not clipped at minimum zoom.
 * Vehicles are drawn on top of that frame. Folding them into the frame would
 * resize the picture every time a machine moved.
 */
function mapFrame(
  mapSize: number,
  fields: Field[],
  routes: Array<{ x: number; z: number }> = [],
): MapFrame {
  const half = mapSize / 2;
  let extent = half;
  const consider = (x: number | null | undefined, z: number | null | undefined) => {
    if (x == null || z == null || !Number.isFinite(x) || !Number.isFinite(z)) return;
    extent = Math.max(extent, Math.abs(x), Math.abs(z));
  };
  for (const field of fields) {
    consider(field.x, field.z);
    for (const point of field.polygon ?? []) consider(point.x, point.z);
  }
  for (const point of routes) consider(point.x, point.z);
  const span = extent * 2 * 1.06;
  return { minX: -span / 2, minZ: -span / 2, span };
}

/**
 * PDA images paint the playable terrain in the center half.
 * The olive border and wheat marks sit outside that square.
 * A full-bleed image uses the whole picture as terrain.
 */
function mapImageBox(mapSize: number, frame: MapFrame, fit: MapImageFit) {
  const inset = fit === "full" ? 0 : 0.25;
  const half = mapSize / 2;
  const inner = 1 - inset * 2;
  const terrain = (mapSize / frame.span) * 100;
  const size = terrain / inner;
  return {
    left: ((-half - frame.minX) / frame.span) * 100 - inset * size,
    top: ((-half - frame.minZ) / frame.span) * 100 - inset * size,
    size,
  };
}

function worldToPct(x: number, z: number, frame: MapFrame): { left: number; top: number } {
  return {
    left: ((x - frame.minX) / frame.span) * 100,
    top: ((z - frame.minZ) / frame.span) * 100,
  };
}

function worldFromClient(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: View,
  frame: MapFrame,
  width: number,
  height: number,
) {
  const localX = (clientX - rect.left - view.x) / view.scale;
  const localY = (clientY - rect.top - view.y) / view.scale;
  return {
    x: frame.minX + (localX / width) * frame.span,
    z: frame.minZ + (localY / height) * frame.span,
  };
}

function pointInRing(x: number, z: number, polygon: Array<{ x: number; z: number }>) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (current == null || prior == null) continue;
    if (current.z > z !== prior.z > z) {
      const span = prior.z - current.z;
      if (span !== 0 && x < ((prior.x - current.x) * (z - current.z)) / span + current.x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function screenOf(
  pct: { left: number; top: number },
  width: number,
  height: number,
  view: View,
): { x: number; y: number } {
  return {
    x: view.x + (pct.left / 100) * width * view.scale,
    y: view.y + (pct.top / 100) * height * view.scale,
  };
}

function AnchoredLabel({
  x,
  y,
  above = false,
  className,
  children,
}: {
  x: number;
  y: number;
  above?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return (
    <div
      className={cn(
        "absolute flex size-0",
        above ? "items-end justify-center" : "items-center justify-center",
      )}
      style={{ left: Math.round(x), top: Math.round(y) }}
    >
      <span className={className}>{children}</span>
    </div>
  );
}

/** Paints the map image at device resolution so zoom does not stretch a small bitmap. */
function MapPicture({
  url,
  view,
  width,
  height,
  box,
}: {
  url: string;
  view: View;
  width: number;
  height: number;
  box: { left: number; top: number; size: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);

  useEffect(() => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      imageRef.current = image;
      setReadyUrl(url);
    };
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [url]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || image.naturalWidth === 0 || readyUrl !== url || width <= 0 || height <= 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.max(1, Math.round(width * dpr));
    const pxH = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dw = (box.size / 100) * width * view.scale;
    const dh = (box.size / 100) * height * view.scale;
    const magnified = dw * dpr > image.naturalWidth || dh * dpr > image.naturalHeight;
    ctx.imageSmoothingEnabled = !magnified;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(
      image,
      view.x + (box.left / 100) * width * view.scale,
      view.y + (box.top / 100) * height * view.scale,
      dw,
      dh,
    );
  }, [url, readyUrl, view, width, height, box]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden />;
}

function clampView(view: View, width: number, height: number): View {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const minX = width * (1 - scale);
  const minY = height * (1 - scale);
  return {
    x: clamp(view.x, minX, 0),
    y: clamp(view.y, minY, 0),
    scale,
  };
}

function zoomAt(
  view: View,
  nextScale: number,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): View {
  const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const mapX = (anchorX - view.x) / view.scale;
  const mapY = (anchorY - view.y) / view.scale;
  return clampView(
    {
      x: anchorX - mapX * scale,
      y: anchorY - mapY * scale,
      scale,
    },
    width,
    height,
  );
}

type EquipmentCategory = "vehicle" | "implement" | "trailer";

function equipmentCategory(vehicle: Vehicle): EquipmentCategory {
  if (vehicle.category === "implement" || vehicle.category === "trailer") return vehicle.category;
  return "vehicle";
}

function EquipmentGlyph({
  category,
  rotation = 0,
}: {
  category: EquipmentCategory;
  rotation?: number;
}) {
  const turn = category === "implement" ? null : `rotate(${rotation} 12 12)`;
  if (category === "implement") {
    return (
      <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
        <path fill="currentColor" d="M12 3 L21 12 L12 21 L3 12 Z" />
      </svg>
    );
  }
  if (category === "trailer") {
    return (
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <g transform={turn ?? undefined}>
          <path fill="currentColor" d="M7 5 H17 V19 H7 Z" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <g transform={turn ?? undefined}>
        <path fill="currentColor" d="M12 3 L18 19 L12 15 L6 19 Z" />
      </g>
    </svg>
  );
}

function fieldFill(field: Field): string {
  if (field.fruitColor) return field.fruitColor;
  return fruitColor(field.fruitType);
}

function fieldNumber(id: string): string {
  return id.replace(/^field[-_]?/i, "");
}

function fieldAnchor(field: Field, frame: MapFrame): { left: number; top: number } | null {
  // posX/posZ is a point inside the polygon. A vertex average can fall outside a concave field.
  if (field.x != null && field.z != null) {
    return worldToPct(field.x, field.z, frame);
  }
  if (!field.polygon || field.polygon.length === 0) return null;
  let sx = 0;
  let sz = 0;
  for (const point of field.polygon) {
    sx += point.x;
    sz += point.z;
  }
  return worldToPct(sx / field.polygon.length, sz / field.polygon.length, frame);
}

function FieldMarker({
  field,
  frame,
  selected,
}: {
  field: Field;
  frame: MapFrame;
  selected: boolean;
}) {
  if (field.x == null || field.z == null) return null;
  const pos = worldToPct(field.x, field.z, frame);
  const number = field.name && field.name.length > 0 ? field.name : fieldNumber(field.id);
  return (
    <div
      data-field-id={field.id}
      className={cn(
        "absolute size-4 cursor-pointer rounded-sm ml-[-0.5rem] mt-[-0.5rem]",
        selected ? "opacity-100 ring-2 ring-[#f3efe4]" : "opacity-70",
      )}
      style={{
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        background: fieldFill(field),
      }}
      title={`Field ${number}`}
    />
  );
}

function FieldPolygon({
  field,
  frame,
  selected,
}: {
  field: Field;
  frame: MapFrame;
  selected: boolean;
}) {
  if (!field.polygon || field.polygon.length < 3) return null;
  const color = fieldFill(field);
  const points = field.polygon
    .map((p) => {
      const pos = worldToPct(p.x, p.z, frame);
      return `${pos.left},${pos.top}`;
    })
    .join(" ");
  return (
    <polygon
      points={points}
      fill={color}
      fillOpacity={selected ? 0.75 : 0.55}
      stroke={selected ? "#f3efe4" : color}
      strokeOpacity={selected ? 1 : 0.9}
      strokeWidth={selected ? 0.55 : 0.25}
      style={{ pointerEvents: "none" }}
    />
  );
}

function AutoDriveRoutes({
  graph,
  frame,
}: {
  graph: AutoDriveGraph;
  frame: MapFrame;
}) {
  const waypoints = graph.waypoints ?? [];
  const markers = graph.markers ?? [];
  const { minX, minZ, span } = frame;
  const drawn = useMemo(() => {
    const stable = { minX, minZ, span };
    const byId = new Map(waypoints.map((wp) => [wp.id, wp]));
    const lines: string[] = [];
    for (const wp of waypoints) {
      const pos = worldToPct(wp.x, wp.z, stable);
      for (const nextId of wp.out) {
        const next = byId.get(nextId);
        if (!next) continue;
        const end = worldToPct(next.x, next.z, stable);
        lines.push(`M ${pos.left} ${pos.top} L ${end.left} ${end.top}`);
      }
    }
    return lines.join(" ");
  }, [waypoints, minX, minZ, span]);

  if (waypoints.length === 0 && markers.length === 0) return null;

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={drawn} fill="none" stroke="#e2b657" strokeOpacity={0.9} strokeWidth={0.28} />
        {markers.map((marker) => {
          const pos = worldToPct(marker.x, marker.z, frame);
          return <circle key={marker.id} cx={pos.left} cy={pos.top} r={0.45} fill="#e2b657" />;
        })}
      </svg>
    </>
  );
}

const FIELD_MODES = ["yours", "all", "none"] as const;
type FieldMode = (typeof FIELD_MODES)[number];
const FIELD_MODE_LABEL: Record<FieldMode, string> = {
  yours: "Your fields",
  all: "All Fields",
  none: "None",
};

function nextFieldMode(mode: FieldMode): FieldMode {
  const index = FIELD_MODES.indexOf(mode);
  return FIELD_MODES[(index + 1) % FIELD_MODES.length] ?? "yours";
}

/** Player-owned land, plus boundaries scanned from this livemap. */
function isYourField(field: Field, localFarmId: number | null | undefined) {
  if (field.id.startsWith("scan:")) return true;
  if (typeof field.farmId === "number" && typeof localFarmId === "number") {
    return field.farmId === localFarmId;
  }
  return field.owned === true;
}

function fieldAtWorld(fields: Field[], x: number, z: number) {
  for (let index = fields.length - 1; index >= 0; index -= 1) {
    const field = fields[index];
    const polygon = field?.polygon;
    if (polygon != null && polygon.length >= 3 && pointInRing(x, z, polygon)) return field;
  }
  return undefined;
}

const toolClass =
  "flex items-center gap-2 rounded-full border border-white/10 bg-[#221e18]/92 px-2.5 py-1.5 text-[13px] text-[#f3efe4] shadow-[0_16px_40px_rgba(0,0,0,0.28)] [@media(pointer:coarse)]:px-3.5 [@media(pointer:coarse)]:py-2.5 [@media(pointer:coarse)]:text-[15px]";

function LayerToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={toolClass}>
      <input
        type="checkbox"
        className="accent-[#e2b657]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

const LIST_CATEGORIES: EquipmentCategory[] = ["vehicle", "implement", "trailer"];
const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  vehicle: "Vehicles",
  implement: "Implements",
  trailer: "Trailers",
};

function playerColor(farms: FarmInfo[], player: MapPlayer) {
  if (player.farmId == null) return "#7eb6ff";
  return farms.find((farm) => farm.id === player.farmId)?.color || "#7eb6ff";
}

function PlayerGlyph({ rotation = 0 }: { rotation?: number }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <g transform={`rotate(${rotation} 12 12)`}>
        <circle cx="12" cy="8" r="3" fill="currentColor" />
        <path fill="currentColor" d="M12 12 L17 21 L12 18 L7 21 Z" />
      </g>
    </svg>
  );
}

function EquipmentList({
  vehicles,
  selectedId,
  onSelect,
  colorFor,
  layers,
  showFarm,
}: {
  vehicles: Vehicle[];
  selectedId?: string | null;
  onSelect: (vehicle: Vehicle) => void;
  colorFor: (vehicle: Vehicle) => string;
  layers?: Record<EquipmentCategory, boolean>;
  showFarm?: boolean;
}) {
  const visible = LIST_CATEGORIES.filter((category) => layers == null || layers[category]);
  if (visible.length === 0) {
    return <p className="px-2 py-1 text-[13px] text-[#b7b1a4]">Turn a category on to list it.</p>;
  }
  return (
    <>
      {visible.map((category) => {
        const items = vehicles
          .filter((item) => equipmentCategory(item) === category)
          .sort((a, b) => a.name.localeCompare(b.name));
        return (
          <section key={category} className="mb-2 last:mb-0">
            <h3 className="px-2 py-1 text-[11px] font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">
              {CATEGORY_LABEL[category]} · {items.length}
            </h3>
            {items.length === 0 ? (
              <p className="px-2 pb-1 text-[13px] text-[#b7b1a4]">None</p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[15px] hover:bg-white/[0.06]",
                        selectedId === item.id && "bg-white/[0.08]",
                      )}
                      onClick={() => onSelect(item)}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: colorFor(item) }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{item.name}</span>
                        {showFarm && item.farmName ? (
                          <span className="block truncate text-[12px] text-[#b7b1a4]">{item.farmName}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

function PlayerList({
  players,
  farms,
  selectedId,
  onSelect,
}: {
  players: MapPlayer[];
  farms: FarmInfo[];
  selectedId?: string | null;
  onSelect: (player: MapPlayer) => void;
}) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="mb-2 last:mb-0">
      <h3 className="px-2 py-1 text-[11px] font-semibold tracking-[0.04em] text-[#b7b1a4] uppercase">
        Players · {sorted.length}
      </h3>
      {sorted.length === 0 ? (
        <p className="px-2 pb-1 text-[13px] text-[#b7b1a4]">None</p>
      ) : (
        <ul>
          {sorted.map((player) => {
            const farm = player.farmId == null ? undefined : farms.find((item) => item.id === player.farmId);
            return (
              <li key={player.id}>
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[15px] hover:bg-white/[0.06]",
                    selectedId === player.id && "bg-white/[0.08]",
                  )}
                  onClick={() => onSelect(player)}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: farm?.color || "#7eb6ff" }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{player.name}</span>
                    {farm ? (
                      <span className="block truncate text-[12px] text-[#b7b1a4]">{farm.name}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FarmList({
  farms,
  localFarmId,
  enabledFarmIds,
  onToggle,
}: {
  farms: FarmInfo[];
  localFarmId?: number | null;
  enabledFarmIds: number[] | null;
  onToggle: (farmId: number, enabled: boolean) => void;
}) {
  if (farms.length === 0) {
    return <p className="px-2 py-1 text-[13px] text-[#b7b1a4]">No farms yet.</p>;
  }
  return (
    <ul>
      {farms.map((farm) => {
        const own = farm.id === localFarmId;
        const checked = own || enabledFarmIds?.includes(farm.id) === true;
        return (
          <li key={farm.id}>
            <label className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-[15px]">
              <input
                type="checkbox"
                className="accent-[#e2b657]"
                checked={checked}
                disabled={own}
                onChange={(event) => onToggle(farm.id, event.target.checked)}
              />
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: farm.color || "#e2b657" }}
              />
              <span className="truncate">
                {farm.name}
                {own ? " · yours" : ""}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function MapChrome({
  showMap,
  fieldMode,
  showVehicles,
  showImplements,
  showTrailers,
  showPlayers,
  multiplayer,
  listOpen,
  farmsOpen,
  vehicles,
  players,
  farms,
  localFarmId,
  enabledFarmIds,
  selectedId,
  selectedPlayerId,
  showFarmNames,
  onMap,
  onFieldMode,
  onVehicles,
  onImplements,
  onTrailers,
  onPlayers,
  onList,
  onFarms,
  onToggleFarm,
  onReset,
  onSelect,
  onSelectPlayer,
  colorFor,
}: {
  showMap: boolean;
  fieldMode: FieldMode;
  showVehicles: boolean;
  showImplements: boolean;
  showTrailers: boolean;
  showPlayers: boolean;
  multiplayer: boolean;
  listOpen: boolean;
  farmsOpen: boolean;
  vehicles: Vehicle[];
  players: MapPlayer[];
  farms: FarmInfo[];
  localFarmId?: number | null;
  enabledFarmIds: number[] | null;
  selectedId?: string | null;
  selectedPlayerId?: string | null;
  showFarmNames: boolean;
  onMap: (next: boolean) => void;
  onFieldMode: () => void;
  onVehicles: (next: boolean) => void;
  onImplements: (next: boolean) => void;
  onTrailers: (next: boolean) => void;
  onPlayers: (next: boolean) => void;
  onList: () => void;
  onFarms: () => void;
  onToggleFarm: (farmId: number, enabled: boolean) => void;
  onReset: () => void;
  onSelect: (vehicle: Vehicle) => void;
  onSelectPlayer: (player: MapPlayer) => void;
  colorFor: (vehicle: Vehicle) => string;
}) {
  const layerOn: Record<EquipmentCategory, boolean> = {
    vehicle: showVehicles,
    implement: showImplements,
    trailer: showTrailers,
  };
  return (
    <>
      <div className="pointer-events-none absolute top-3 right-3 left-3 z-40 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div
            className="pointer-events-auto flex min-w-0 flex-wrap gap-2"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <LayerToggle label="Map" checked={showMap} onChange={onMap} />
            <button
              type="button"
              className={`${toolClass} cursor-pointer`}
              aria-label={`Fields: ${FIELD_MODE_LABEL[fieldMode]}`}
              onClick={onFieldMode}
            >
              {FIELD_MODE_LABEL[fieldMode]}
            </button>
            <LayerToggle label="Vehicles" checked={showVehicles} onChange={onVehicles} />
            <LayerToggle label="Implements" checked={showImplements} onChange={onImplements} />
            <LayerToggle label="Trailers" checked={showTrailers} onChange={onTrailers} />
            {multiplayer ? <LayerToggle label="Players" checked={showPlayers} onChange={onPlayers} /> : null}
            {multiplayer ? (
              <button
                type="button"
                className={`${toolClass} cursor-pointer`}
                aria-expanded={farmsOpen}
                onClick={onFarms}
              >
                Farms
              </button>
            ) : null}
            <button type="button" className={`${toolClass} cursor-pointer`} onClick={onReset}>
              Reset view
            </button>
          </div>
          <button
            type="button"
            className={`${toolClass} pointer-events-auto shrink-0 cursor-pointer max-[1535px]:landscape:hidden`}
            aria-expanded={listOpen}
            onClick={onList}
            onPointerDown={(event) => event.stopPropagation()}
          >
            List
          </button>
        </div>
        {listOpen ? (
          <div
            data-map-scroll=""
            className="pointer-events-auto ml-auto max-h-[min(420px,58vh)] w-[min(280px,calc(100vw-2rem))] overflow-auto overscroll-contain rounded-2xl border border-white/10 bg-[#221e18]/95 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.28)] max-[1535px]:landscape:hidden"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <EquipmentList
              vehicles={vehicles}
              selectedId={selectedId}
              onSelect={onSelect}
              colorFor={colorFor}
              layers={layerOn}
              showFarm={showFarmNames}
            />
            {multiplayer ? (
              <PlayerList
                players={players}
                farms={farms}
                selectedId={selectedPlayerId}
                onSelect={onSelectPlayer}
              />
            ) : null}
          </div>
        ) : null}
        {farmsOpen ? (
          <div
            data-map-scroll=""
            className="pointer-events-auto max-h-[min(420px,58vh)] w-[min(280px,calc(100vw-2rem))] overflow-auto overscroll-contain rounded-2xl border border-white/10 bg-[#221e18]/95 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <FarmList
              farms={farms}
              localFarmId={localFarmId}
              enabledFarmIds={enabledFarmIds}
              onToggle={onToggleFarm}
            />
          </div>
        ) : null}
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 z-20 text-xs text-[#b7b1a4] [@media(pointer:coarse)]:text-[13px]">
        Pinch or scroll to zoom. Drag to move.
      </p>
    </>
  );
}

/** Tablet: square map with the vehicle list in the leftover width. Desktop: the map fills its column. */
export function MapSlot({
  children,
  vehicles,
  players = [],
  farms = [],
  selectedId,
  selectedPlayerId,
  onSelect,
  onSelectPlayer,
  showFarm = false,
}: {
  children: React.ReactNode;
  vehicles: Vehicle[];
  players?: MapPlayer[];
  farms?: FarmInfo[];
  selectedId?: string | null;
  selectedPlayerId?: string | null;
  onSelect: (vehicle: Vehicle) => void;
  onSelectPlayer?: (player: MapPlayer) => void;
  showFarm?: boolean;
}) {
  const { settings } = useSettings();
  const colorFor = (vehicle: Vehicle) => machineColor(vehicle, settings.colors);
  return (
    <section className="flex h-[min(100cqh,100cqw)] w-full shrink-0 items-stretch bg-[#100e0b] [container-type:size] min-[1536px]:block min-[1536px]:h-full min-[1536px]:min-h-0">
      <div className="h-[min(100cqh,100cqw)] w-[min(100cqh,100cqw)] shrink-0 bg-[#100e0b] [contain:layout] min-[1536px]:h-full min-[1536px]:w-full">
        {children}
      </div>
      <div aria-hidden className="hidden w-10 shrink-0 touch-pan-y max-[1535px]:landscape:block" />
      <div
        data-map-scroll=""
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[#221e18] p-3 max-[1535px]:portrait:hidden min-[1536px]:hidden"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <EquipmentList
          vehicles={vehicles}
          selectedId={selectedId}
          onSelect={onSelect}
          colorFor={colorFor}
          showFarm={showFarm}
        />
        {onSelectPlayer ? (
          <PlayerList
            players={players}
            farms={farms}
            selectedId={selectedPlayerId}
            onSelect={onSelectPlayer}
          />
        ) : null}
      </div>
    </section>
  );
}

export function Livemap({
  state,
  onSelectVehicle,
  onSelectPlayer,
  onSelectField,
  selectedId,
  selectedPlayerId,
  selectedFieldId,
  autoDrive,
  onScan,
  scanResult,
}: Props) {
  const { settings, mapImageUrl } = useSettings();
  const colorFor = (vehicle: Vehicle) => machineColor(vehicle, settings.colors);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [showMap, setShowMap] = useState(true);
  const [fieldMode, setFieldMode] = useState<FieldMode>("yours");
  const [showVehicles, setShowVehicles] = useState(true);
  const [showImplements, setShowImplements] = useState(true);
  const [showTrailers, setShowTrailers] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [farmsOpen, setFarmsOpen] = useState(false);
  const { enabledFarmIds, setFarmEnabled } = useLivemapContext();
  const [bounds, setBounds] = useState({ w: 0, h: 0 });
  const [scan, setScan] = useState<ScanAnchor | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const suppressClickRef = useRef(false);
  const pressTargetRef = useRef<EventTarget | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    mode: "pan" | "pinch";
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    startScale: number;
    startDist: number;
    moved: boolean;
  } | null>(null);

  viewRef.current = view;

  const mapSize = state?.mapSize && state.mapSize > 0 ? state.mapSize : 2048;
  const vehicles = state?.vehicles ?? [];
  const fields = state?.fields ?? [];
  const multiplayer = state?.multiplayer === true;
  const farms = state?.farms ?? [];
  const players = state?.players ?? [];
  const showFarmNames = multiplayer && farms.length > 1;
  const showRoutes = autoDrive?.available === true;

  const frame = useMemo(() => {
    const routes = showRoutes
      ? [...(autoDrive?.waypoints ?? []), ...(autoDrive?.markers ?? [])]
      : [];
    return mapFrame(mapSize, fields, routes);
  }, [mapSize, fields, showRoutes, autoDrive]);

  const drawnFields = useMemo(() => {
    if (fieldMode === "none") return [];
    if (fieldMode === "all") return fields;
    return fields.filter((field) => isYourField(field, state?.localFarmId));
  }, [fieldMode, fields, state?.localFarmId]);

  const hasPolygons = useMemo(
    () => drawnFields.some((f) => f.polygon && f.polygon.length >= 3),
    [drawnFields],
  );
  const imageBox = useMemo(
    () => mapImageBox(mapSize, frame, settings.mapImageFit),
    [mapSize, frame, settings.mapImageFit],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport == null) return;

    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      setBounds((current) =>
        current.w === rect.width && current.h === rect.height ? current : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);

    const onWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null;
      if (target?.closest("[data-map-scroll]")) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((current) =>
        zoomAt(
          current,
          current.scale * factor,
          event.clientX - rect.left,
          event.clientY - rect.top,
          rect.width,
          rect.height,
        ),
      );
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [state == null]);

  const resetView = () => setView({ x: 0, y: 0, scale: 1 });

  const beginGesture = (mode: "pan" | "pinch") => {
    const points = [...pointersRef.current.values()];
    const current = viewRef.current;
    if (mode === "pinch" && points.length >= 2) {
      const [a, b] = points;
      gestureRef.current = {
        mode,
        startX: (a.x + b.x) / 2,
        startY: (a.y + b.y) / 2,
        originX: current.x,
        originY: current.y,
        startScale: current.scale,
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        moved: false,
      };
      return;
    }
    const point = points[0];
    if (point == null) return;
    gestureRef.current = {
      mode: "pan",
      startX: point.x,
      startY: point.y,
      originX: current.x,
      originY: current.y,
      startScale: current.scale,
      startDist: 1,
      moved: false,
    };
  };

  useEffect(() => {
    if (!scanResult) return;
    setScan((current) => {
      if (!current?.commandId || current.commandId !== scanResult.id) return current;
      if (scanResult.ok) return null;
      return {
        ...current,
        phase: "error",
        error: scanResult.error ?? "Field scan failed",
      };
    });
  }, [scanResult]);

  const selectPressedTarget = (target: EventTarget | null, clientX: number, clientY: number) => {
    if (!(target instanceof Element)) return;
    const vehicleButton = target.closest("[data-vehicle-id]");
    const playerButton = target.closest("[data-player-id]");
    const playerHit =
      playerButton != null && (vehicleButton == null || !vehicleButton.contains(playerButton));
    if (playerHit) {
      const id = playerButton.getAttribute("data-player-id");
      const player = id == null || id === "" ? undefined : players.find((item) => item.id === id);
      if (player != null) onSelectPlayer?.(player);
      return;
    }
    const vehicleId = vehicleButton?.getAttribute("data-vehicle-id");
    if (vehicleId != null && vehicleId !== "") {
      const vehicle = vehicles.find((item) => item.id === vehicleId);
      if (vehicle != null) onSelectVehicle(vehicle);
      return;
    }
    const fieldId =
      target instanceof Element ? target.closest("[data-field-id]")?.getAttribute("data-field-id") : null;
    const domField =
      fieldId == null || fieldId === "" ? undefined : drawnFields.find((item) => item.id === fieldId);
    const viewport = viewportRef.current;
    const world =
      viewport == null || bounds.w <= 0 || bounds.h <= 0
        ? null
        : worldFromClient(clientX, clientY, viewport.getBoundingClientRect(), viewRef.current, frame, bounds.w, bounds.h);
    const field =
      domField ??
      (world != null && Number.isFinite(world.x) && Number.isFinite(world.z)
        ? fieldAtWorld(drawnFields, world.x, world.z)
        : undefined);
    if (field == null) return;
    onSelectField?.(field, {
      x: world != null && Number.isFinite(world.x) ? world.x : (field.x ?? 0),
      z: world != null && Number.isFinite(world.z) ? world.z : (field.z ?? 0),
    });
  };

  const placeScan = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!onScan || viewport == null || bounds.w <= 0 || bounds.h <= 0) return;
    const world = worldFromClient(
      clientX,
      clientY,
      viewport.getBoundingClientRect(),
      viewRef.current,
      frame,
      bounds.w,
      bounds.h,
    );
    if (!Number.isFinite(world.x) || !Number.isFinite(world.z)) return;
    const onField = fields.some(
      (field) => field.polygon != null && field.polygon.length >= 3 && pointInRing(world.x, world.z, field.polygon),
    );
    setScan({
      x: world.x,
      z: world.z,
      onField,
      phase: "ready",
      commandId: null,
      error: null,
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("[data-scan-button], [data-map-scroll]")) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    // Chrome drops the rest of the gesture when a drag starts on an SVG shape or a text selection.
    event.preventDefault();
    pressTargetRef.current = event.target;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      viewportRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone, or this event was not a real press.
    }
    beginGesture(pointersRef.current.size >= 2 ? "pinch" : "pan");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (viewport != null && bounds.w > 0 && bounds.h > 0 && gestureRef.current?.moved !== true) {
      const world = worldFromClient(
        event.clientX,
        event.clientY,
        viewport.getBoundingClientRect(),
        viewRef.current,
        frame,
        bounds.w,
        bounds.h,
      );
      const over =
        Number.isFinite(world.x) && Number.isFinite(world.z)
          ? fieldAtWorld(drawnFields, world.x, world.z)
          : undefined;
      viewport.style.cursor = over != null ? "pointer" : "";
    }
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (gesture == null || viewport == null) return;

    const rect = viewport.getBoundingClientRect();
    const points = [...pointersRef.current.values()];

    if (gesture.mode === "pinch" && points.length >= 2) {
      const [a, b] = points;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      const startMidX = gesture.startX - rect.left;
      const startMidY = gesture.startY - rect.top;
      if (Math.abs(dist - gesture.startDist) > PAN_THRESHOLD_PX) {
        gesture.moved = true;
      }
      const scale = gesture.startScale * (dist / gesture.startDist);
      const zoomed = zoomAt(
        { x: gesture.originX, y: gesture.originY, scale: gesture.startScale },
        scale,
        startMidX,
        startMidY,
        rect.width,
        rect.height,
      );
      setView(
        clampView(
          {
            x: zoomed.x + (midX - startMidX),
            y: zoomed.y + (midY - startMidY),
            scale: zoomed.scale,
          },
          rect.width,
          rect.height,
        ),
      );
      return;
    }

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
    gesture.moved = true;
    setView(
      clampView(
        {
          x: gesture.originX + dx,
          y: gesture.originY + dy,
          scale: viewRef.current.scale,
        },
        rect.width,
        rect.height,
      ),
    );
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const gesture = gestureRef.current;
    const pressed = pressTargetRef.current;
    pointersRef.current.delete(event.pointerId);
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId);
    }
    if (gesture?.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    } else if (pointersRef.current.size === 0) {
      // Pointer capture sends the click to the map, so select from the original press.
      const hitMachine =
        pressed instanceof Element &&
        (pressed.closest("[data-vehicle-id]") != null || pressed.closest("[data-player-id]") != null);
      if (hitMachine) {
        setScan(null);
      } else {
        placeScan(event.clientX, event.clientY);
      }
      selectPressedTarget(pressed, event.clientX, event.clientY);
    }
    pressTargetRef.current = null;
    const viewport = viewportRef.current;
    const active = document.activeElement;
    if (
      viewport != null &&
      (active instanceof HTMLElement || active instanceof SVGElement) &&
      viewport.contains(active)
    ) {
      active.blur();
    }
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      return;
    }
    beginGesture(pointersRef.current.size >= 2 ? "pinch" : "pan");
  };

  const mapChrome = (
    <MapChrome
      showMap={showMap}
      fieldMode={fieldMode}
      showVehicles={showVehicles}
      showImplements={showImplements}
      showTrailers={showTrailers}
      showPlayers={showPlayers}
      multiplayer={multiplayer}
      listOpen={listOpen}
      farmsOpen={farmsOpen}
      vehicles={vehicles}
      players={players}
      farms={farms}
      localFarmId={state?.localFarmId}
      enabledFarmIds={enabledFarmIds}
      selectedId={selectedId}
      selectedPlayerId={selectedPlayerId}
      showFarmNames={showFarmNames}
      onMap={setShowMap}
      onFieldMode={() => setFieldMode((mode) => nextFieldMode(mode))}
      onVehicles={setShowVehicles}
      onImplements={setShowImplements}
      onTrailers={setShowTrailers}
      onPlayers={setShowPlayers}
      onList={() => {
        setListOpen((open) => !open);
        setFarmsOpen(false);
      }}
      onFarms={() => {
        setFarmsOpen((open) => !open);
        setListOpen(false);
      }}
      onToggleFarm={setFarmEnabled}
      onReset={resetView}
      onSelect={onSelectVehicle}
      onSelectPlayer={onSelectPlayer ?? (() => {})}
      colorFor={colorFor}
    />
  );

  if (!state) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#100e0b]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative z-10 max-w-sm px-6 text-center">
          <p className="text-lg font-semibold text-[#f3efe4]">Waiting for map data</p>
          <p className="mt-2 text-sm text-[#b7b1a4]">
            Connect the bridge with mock mode or load FS25 with the livemap mod.
          </p>
        </div>
        {mapChrome}
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full touch-none overflow-hidden bg-[#100e0b] select-none [contain:layout]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDragStart={(event) => event.preventDefault()}
      onPointerLeave={() => {
        if (viewportRef.current != null) viewportRef.current.style.cursor = "";
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, #4a6b3e 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, #2f4a38 0%, transparent 45%), linear-gradient(160deg, #243222 0%, #1a2618 40%, #152018 100%)",
        }}
      />
      {showMap && bounds.w > 0 && mapImageUrl ? (
        <MapPicture
          url={mapImageUrl}
          view={view}
          width={bounds.w}
          height={bounds.h}
          box={imageBox}
        />
      ) : null}
      <div
        className="absolute inset-0 z-[1] origin-top-left touch-none"
        style={
          view.x !== 0 || view.y !== 0 || view.scale !== 1
            ? {
                transform: `translate3d(${Math.round(view.x)}px, ${Math.round(view.y)}px, 0) scale(${view.scale})`,
              }
            : undefined
        }
      >
        {showMap ? null : (
          <div className="absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:64px_64px]" />
        )}

        {hasPolygons ? (
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full touch-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {drawnFields.map((f) => (
              <FieldPolygon key={f.id} field={f} frame={frame} selected={selectedFieldId === f.id} />
            ))}
          </svg>
        ) : null}
        {!hasPolygons
          ? drawnFields.map((f) => (
              <FieldMarker key={f.id} field={f} frame={frame} selected={selectedFieldId === f.id} />
            ))
          : null}

        {showRoutes && autoDrive ? <AutoDriveRoutes graph={autoDrive} frame={frame} /> : null}

        {vehicles.map((v) => {
          const category = equipmentCategory(v);
          if (category === "vehicle" && !showVehicles) return null;
          if (category === "implement" && !showImplements) return null;
          if (category === "trailer" && !showTrailers) return null;
          const pos = worldToPct(v.x, v.z, frame);
          // Giants yaw points +Z at 0. On this map +Z is down, so north is 180°.
          // Reflect that so north stays up and east stays right.
          const deg = 180 - (v.heading * 180) / Math.PI;
          const active = selectedId === v.id || hovered === v.id;
          return (
            <button
              key={v.id}
              type="button"
              className={cn(
                "absolute z-30 ml-[-1.75rem] mt-[-1.75rem] flex size-14 touch-manipulation items-center justify-center rounded-full focus:outline-none",
                "cursor-pointer select-none",
                active && "bg-white/10",
              )}
              data-vehicle-id={v.id}
              tabIndex={-1}
              style={{
                left: `${pos.left}%`,
                top: `${pos.top}%`,
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onSelectVehicle(v);
              }}
              onMouseEnter={() => setHovered(v.id)}
              onMouseLeave={() => setHovered(null)}
              aria-label={
                category === "vehicle"
                  ? `${v.name}, ${v.engineOn ? "engine on" : "engine off"}`
                  : `${v.name}, ${CATEGORY_LABEL[category].slice(0, -1).toLowerCase()}`
              }
            >
              <span
                className="pointer-events-none flex size-4 items-center justify-center"
                style={{ color: colorFor(v) }}
              >
                <EquipmentGlyph category={category} rotation={Math.round(deg)} />
              </span>
            </button>
          );
        })}
        {multiplayer && showPlayers
          ? players.map((player) => {
              const pos = worldToPct(player.x, player.z, frame);
              const deg = 180 - (player.heading * 180) / Math.PI;
              const active = selectedPlayerId === player.id;
              return (
                <button
                  key={player.id}
                  type="button"
                  data-player-id={player.id}
                  tabIndex={-1}
                  className={cn(
                    "absolute z-40 ml-[-1.75rem] mt-[-1.75rem] flex size-14 touch-manipulation items-center justify-center rounded-full focus:outline-none",
                    "cursor-pointer select-none",
                    active && "bg-white/10",
                  )}
                  style={{ left: `${pos.left}%`, top: `${pos.top}%`, color: playerColor(farms, player) }}
                  aria-label={player.name}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    onSelectPlayer?.(player);
                  }}
                >
                  <span className="pointer-events-none flex size-4 items-center justify-center">
                    <PlayerGlyph rotation={Math.round(deg)} />
                  </span>
                  <span className="pointer-events-none absolute top-[calc(50%+12px)] left-1/2 max-w-[8rem] -translate-x-1/2 truncate text-[11px] font-semibold whitespace-nowrap text-[#f3efe4] [text-shadow:0_1px_2px_rgba(16,14,11,0.95),0_0_3px_rgba(16,14,11,0.9)] [@media(pointer:coarse)]:text-[13px]">
                    {player.name}
                  </span>
                </button>
              );
            })
          : null}
      </div>

      {bounds.w > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {drawnFields.map((field) => {
            const pos = fieldAnchor(field, frame);
            if (pos == null) return null;
            const point = screenOf(pos, bounds.w, bounds.h, view);
            const crop = field.fruitType ?? "Empty";
            const number = field.name && field.name.length > 0 ? field.name : fieldNumber(field.id);
            return (
              <AnchoredLabel
                key={`label-${field.id}`}
                x={point.x}
                y={point.y}
                className="shrink-0 whitespace-nowrap rounded bg-stone-950/75 px-1 py-0.5 text-[10px] font-medium text-stone-50 [@media(pointer:coarse)]:text-[13px]"
              >
                {number} · {crop}
              </AnchoredLabel>
            );
          })}
          {showRoutes
            ? (autoDrive?.markers ?? []).map((marker) => {
                const point = screenOf(worldToPct(marker.x, marker.z, frame), bounds.w, bounds.h, view);
                return (
                  <AnchoredLabel
                    key={`ad-${marker.id}`}
                    x={point.x}
                    y={point.y - 6}
                    above
                    className="mb-1 shrink-0 whitespace-nowrap rounded bg-[#e2b657] px-1.5 py-0.5 text-[10px] font-semibold text-[#2a2112] [@media(pointer:coarse)]:text-[13px]"
                  >
                    {marker.name}
                  </AnchoredLabel>
                );
              })
            : null}
          {vehicles.map((vehicle) => {
            const category = equipmentCategory(vehicle);
            if (category === "vehicle" && !showVehicles) return null;
            if (category === "implement" && !showImplements) return null;
            if (category === "trailer" && !showTrailers) return null;
            if (view.scale < VEHICLE_LABEL_SCALE && selectedId !== vehicle.id) return null;
            const point = screenOf(worldToPct(vehicle.x, vehicle.z, frame), bounds.w, bounds.h, view);
            return (
              <AnchoredLabel
                key={`name-${vehicle.id}`}
                x={point.x}
                y={point.y + 28 * view.scale + 4}
                className="max-w-[8rem] truncate text-[10px] font-medium text-[#f3efe4] [text-shadow:0_1px_2px_rgba(16,14,11,0.95),0_0_3px_rgba(16,14,11,0.9)] [@media(pointer:coarse)]:text-[13px]"
              >
                {vehicle.name}
                {showFarmNames && vehicle.farmName ? ` · ${vehicle.farmName}` : ""}
              </AnchoredLabel>
            );
          })}
          {scan && onScan ? (
            <div
              className="pointer-events-auto absolute"
              style={{
                left: screenOf(worldToPct(scan.x, scan.z, frame), bounds.w, bounds.h, view).x,
                top: screenOf(worldToPct(scan.x, scan.z, frame), bounds.w, bounds.h, view).y,
              }}
            >
              <button
                type="button"
                data-scan-button=""
                aria-label="Close"
                className="absolute top-0 left-0 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#221e18]/92 text-[#f3efe4] shadow-[0_8px_20px_rgba(0,0,0,0.35)] [@media(pointer:coarse)]:size-7"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setScan(null);
                }}
              >
                <XIcon className="size-3 [@media(pointer:coarse)]:size-4" />
              </button>
              <button
                type="button"
                data-scan-button=""
                disabled={scan.phase === "scanning"}
                className={`${toolClass} max-w-64 -translate-x-1/2 -translate-y-[calc(100%+18px)] cursor-pointer text-center whitespace-normal disabled:cursor-default disabled:opacity-80`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (scan.phase === "scanning") return;
                  const id = onScan(scan.x, scan.z);
                  if (id === "") {
                    setScan({ ...scan, phase: "error", commandId: null, error: "Not connected to bridge" });
                    return;
                  }
                  setScan({ ...scan, phase: "scanning", commandId: id, error: null });
                }}
              >
                {scan.phase === "scanning"
                  ? "Scanning…"
                  : scan.phase === "error"
                    ? scan.error ?? "Field scan failed"
                    : scan.onField
                      ? "Scan fieldboundary"
                      : "Scan for field"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mapChrome}
    </div>
  );
}
