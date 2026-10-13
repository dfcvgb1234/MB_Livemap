"use client";

import { useLivemapContext } from "@/components/livemap-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProductionFill } from "@/lib/types";

function FillBar({ fill }: { fill: ProductionFill }) {
  const pct =
    fill.fillLevel != null && fill.capacity != null && fill.capacity > 0
      ? Math.min(100, Math.round((fill.fillLevel / fill.capacity) * 100))
      : null;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-stone-800">{fill.name}</span>
        <span className="text-stone-500">
          {fill.fillLevel != null && fill.capacity != null
            ? `${Math.round(fill.fillLevel)} / ${Math.round(fill.capacity)}`
            : "Unsupported"}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-lime-600 transition-all"
          style={{ width: `${pct ?? 0}%`, opacity: pct == null ? 0.25 : 1 }}
        />
      </div>
    </div>
  );
}

export default function ProductionsPage() {
  const { state, connection } = useLivemapContext();
  const productions = state?.productions ?? [];

  if (connection === "connecting" && !state) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16 text-stone-600">
        Loading productions…
      </div>
    );
  }

  if (connection === "disconnected" && !state) {
    return (
      <div className="mx-4 mt-4 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
        <h1 className="text-xl font-semibold text-stone-900">Productions offline</h1>
        <p className="mt-2 text-stone-600">
          Start the bridge (`npm run mock` in server/) to load production points.
        </p>
      </div>
    );
  }

  if (productions.length === 0) {
    return (
      <div className="mx-4 mt-4 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
        <h1 className="text-xl font-semibold text-stone-900">No productions</h1>
        <p className="mt-2 text-stone-600">
          No production points reported yet. Place factories in-game or enable
          mock mode.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 sm:px-0">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-stone-900">
          Productions
        </h1>
        <p className="text-sm text-stone-600">
          Input / output fill levels for owned production points
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {productions.map((p) => (
          <Card key={p.id} className="border-stone-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg text-stone-900">{p.name}</CardTitle>
                <Badge
                  variant={p.status === "active" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {p.status ?? "unknown"}
                </Badge>
              </div>
              <CardDescription>ID {p.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Inputs
                </h3>
                <div className="space-y-3">
                  {p.inputs.length === 0 ? (
                    <p className="text-sm text-stone-500">No input data</p>
                  ) : (
                    p.inputs.map((f) => <FillBar key={f.name} fill={f} />)
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Outputs
                </h3>
                <div className="space-y-3">
                  {p.outputs.length === 0 ? (
                    <p className="text-sm text-stone-500">No output data</p>
                  ) : (
                    p.outputs.map((f) => <FillBar key={f.name} fill={f} />)
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
