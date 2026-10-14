import { AutoDrivePage } from "@/components/autodrive-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string | string[] }>;
}) {
  const params = await searchParams;
  const vehicle = params.vehicle;
  const initialVehicleId = Array.isArray(vehicle) ? (vehicle[0] ?? null) : (vehicle ?? null);
  return <AutoDrivePage initialVehicleId={initialVehicleId} />;
}
