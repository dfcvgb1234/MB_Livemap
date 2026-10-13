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

function pct(n: number | null) {
  if (n == null) return null;
  const v = n <= 1 ? n * 100 : n;
  return Math.round(v);
}

export default function AnimalsPage() {
  const { state, connection } = useLivemapContext();
  const animals = state?.animals ?? [];

  if (connection === "connecting" && !state) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16 text-stone-600">
        Loading animals…
      </div>
    );
  }

  if (connection === "disconnected" && !state) {
    return (
      <div className="mx-4 mt-4 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
        <h1 className="text-xl font-semibold text-stone-900">Animals offline</h1>
        <p className="mt-2 text-stone-600">
          Start the bridge (`npm run mock` in server/) to load husbandries.
        </p>
      </div>
    );
  }

  if (animals.length === 0) {
    return (
      <div className="mx-4 mt-4 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
        <h1 className="text-xl font-semibold text-stone-900">No animals</h1>
        <p className="mt-2 text-stone-600">
          No husbandries reported yet. Build animal pens in-game or enable mock
          mode.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 sm:px-0">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-stone-900">
          Animals
        </h1>
        <p className="text-sm text-stone-600">
          Husbandry counts, health, and productivity when the game exposes them
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {animals.map((a) => {
          const health = pct(a.health);
          const prod = pct(a.productivity);
          return (
            <Card key={a.id} className="border-stone-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg text-stone-900">{a.name}</CardTitle>
                  <Badge variant="outline" className="capitalize">
                    {a.animalType ?? "unknown"}
                  </Badge>
                </div>
                <CardDescription>
                  {a.count != null ? `${a.count} animals` : "Count unsupported"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Metric label="Health" value={health} />
                <Metric label="Productivity" value={prod} />
                {(a.x != null || a.z != null) && (
                  <p className="text-xs text-stone-500">
                    Map {Math.round(a.x ?? 0)}, {Math.round(a.z ?? 0)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-stone-600">{label}</span>
        <span className="font-medium text-stone-900">
          {value != null ? `${value}%` : "Unsupported"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-teal-600"
          style={{
            width: `${value ?? 0}%`,
            opacity: value == null ? 0.2 : 1,
          }}
        />
      </div>
    </div>
  );
}
