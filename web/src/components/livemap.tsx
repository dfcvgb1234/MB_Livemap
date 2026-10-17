"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AutoDriveGraph, Field, GameState, Vehicle } from "@/lib/types";
import { fruitColor } from "@/lib/crop-calendar";
import { machineColor } from "@/lib/machine-colors";
import type { MapImageFit } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useSettings } from "@/components/settings-provider";

type Props = {
  state: GameState | null;
  onSelectVehicle: (vehicle: Vehicle) => void;
  selectedId?: string | null;
  /** When set and available, routes stay drawn. The main livemap omits this. */
  autoDrive?: AutoDriveGraph | null;
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
}: {
  field: Field;
  frame: MapFrame;
}) {
  if (field.x == null || field.z == null) return null;
  const pos = worldToPct(field.x, field.z, frame);
  return (
    <div
      className="pointer-events-none absolute size-4 rounded-sm opacity-70 ml-[-0.5rem] mt-[-0.5rem]"
      style={{
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        background: fieldFill(field),
      }}
      title={`Field ${field.id}`}
    />
  );
}

function FieldPolygon({
  field,
  frame,
}: {
  field: Field;
  frame: MapFrame;
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
      fillOpacity={0.55}
      stroke={color}
      strokeOpacity={0.9}
      strokeWidth={0.25}
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

function EquipmentList({
  vehicles,
  selectedId,
  onSelect,
  colorFor,
  layers,
}: {
  vehicles: Vehicle[];
  selectedId?: string | null;
  onSelect: (vehicle: Vehicle) => void;
  colorFor: (vehicle: Vehicle) => string;
  layers?: Record<EquipmentCategory, boolean>;
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
                      <span className="truncate">{item.name}</span>
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

function MapChrome({
  showMap,
  showFields,
  showVehicles,
  showImplements,
  showTrailers,
  listOpen,
  vehicles,
  selectedId,
  onMap,
  onFields,
  onVehicles,
  onImplements,
  onTrailers,
  onList,
  onReset,
  onSelect,
  colorFor,
}: {
  showMap: boolean;
  showFields: boolean;
  showVehicles: boolean;
  showImplements: boolean;
  showTrailers: boolean;
  listOpen: boolean;
  vehicles: Vehicle[];
  selectedId?: string | null;
  onMap: (next: boolean) => void;
  onFields: (next: boolean) => void;
  onVehicles: (next: boolean) => void;
  onImplements: (next: boolean) => void;
  onTrailers: (next: boolean) => void;
  onList: () => void;
  onReset: () => void;
  onSelect: (vehicle: Vehicle) => void;
  colorFor: (vehicle: Vehicle) => string;
}) {
  const layerOn: Record<EquipmentCategory, boolean> = {
    vehicle: showVehicles,
    implement: showImplements,
    trailer: showTrailers,
  };
  return (
    <>
      <div
        className="absolute top-3 left-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap gap-2">
          <LayerToggle label="Map" checked={showMap} onChange={onMap} />
          <LayerToggle label="Fields" checked={showFields} onChange={onFields} />
          <LayerToggle label="Vehicles" checked={showVehicles} onChange={onVehicles} />
          <LayerToggle label="Implements" checked={showImplements} onChange={onImplements} />
          <LayerToggle label="Trailers" checked={showTrailers} onChange={onTrailers} />
          <button
            type="button"
            className={`${toolClass} cursor-pointer max-[1535px]:landscape:hidden`}
            aria-expanded={listOpen}
            onClick={onList}
          >
            List
          </button>
          <button type="button" className={`${toolClass} cursor-pointer`} onClick={onReset}>
            Reset view
          </button>
        </div>
        {listOpen ? (
          <div className="max-h-[min(420px,58vh)] w-[min(280px,calc(100vw-2rem))] overflow-auto rounded-2xl border border-white/10 bg-[#221e18]/95 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.28)] max-[1535px]:landscape:hidden">
            <EquipmentList
              vehicles={vehicles}
              selectedId={selectedId}
              onSelect={onSelect}
              colorFor={colorFor}
              layers={layerOn}
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
  selectedId,
  onSelect,
}: {
  children: React.ReactNode;
  vehicles: Vehicle[];
  selectedId?: string | null;
  onSelect: (vehicle: Vehicle) => void;
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
        className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#221e18] p-3 max-[1535px]:portrait:hidden min-[1536px]:hidden"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <EquipmentList
          vehicles={vehicles}
          selectedId={selectedId}
          onSelect={onSelect}
          colorFor={colorFor}
        />
      </div>
    </section>
  );
}

export function Livemap({ state, onSelectVehicle, selectedId, autoDrive }: Props) {
  const { settings, mapImageUrl } = useSettings();
  const colorFor = (vehicle: Vehicle) => machineColor(vehicle, settings.colors);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [showMap, setShowMap] = useState(true);
  const [showFields, setShowFields] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showImplements, setShowImplements] = useState(true);
  const [showTrailers, setShowTrailers] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [bounds, setBounds] = useState({ w: 0, h: 0 });
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
  const showRoutes = autoDrive?.available === true;

  const frame = useMemo(() => {
    const routes = showRoutes
      ? [...(autoDrive?.waypoints ?? []), ...(autoDrive?.markers ?? [])]
      : [];
    return mapFrame(mapSize, fields, routes);
  }, [mapSize, fields, showRoutes, autoDrive]);

  const hasPolygons = useMemo(
    () => fields.some((f) => f.polygon && f.polygon.length >= 3),
    [fields],
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

  const selectPressedVehicle = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-vehicle-id]");
    const id = button?.getAttribute("data-vehicle-id");
    if (id == null || id === "") return;
    const vehicle = vehicles.find((item) => item.id === id);
    if (vehicle != null) onSelectVehicle(vehicle);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
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
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    const viewport = viewportRef.current;
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
      selectPressedVehicle(pressed);
    }
    pressTargetRef.current = null;
    const viewport = viewportRef.current;
    const active = document.activeElement;
    if (viewport != null && active instanceof HTMLElement && viewport.contains(active)) {
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
      showFields={showFields}
      showVehicles={showVehicles}
      showImplements={showImplements}
      showTrailers={showTrailers}
      listOpen={listOpen}
      vehicles={vehicles}
      selectedId={selectedId}
      onMap={setShowMap}
      onFields={setShowFields}
      onVehicles={setShowVehicles}
      onImplements={setShowImplements}
      onTrailers={setShowTrailers}
      onList={() => setListOpen((open) => !open)}
      onReset={resetView}
      onSelect={onSelectVehicle}
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
      className="relative h-full w-full touch-none overflow-hidden bg-[#100e0b] [contain:layout]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
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
        className="absolute inset-0 z-[1] origin-top-left"
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

        {showFields && hasPolygons ? (
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {fields.map((f) => (
              <FieldPolygon key={f.id} field={f} frame={frame} />
            ))}
          </svg>
        ) : null}
        {showFields && !hasPolygons
          ? fields.map((f) => (
              <FieldMarker key={f.id} field={f} frame={frame} />
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
      </div>

      {bounds.w > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {showFields
            ? fields.map((field) => {
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
              })
            : null}
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
              </AnchoredLabel>
            );
          })}
        </div>
      ) : null}

      {mapChrome}
    </div>
  );
}
