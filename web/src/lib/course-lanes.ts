export type CourseLane = {
  value: number;
  label: string;
};

/** Lanes Courseplay generates for a multi-vehicle course, from left to right. */
export function courseLanes(vehicles: number | null | undefined): CourseLane[] {
  const count = vehicles ?? 1;
  if (count <= 1) return [];
  const lanes: CourseLane[] = [];
  if (count > 3) lanes.push({ value: -2, label: "Left 2" });
  if (count > 1) lanes.push({ value: -1, label: "Left 1" });
  if (count % 2 === 1) lanes.push({ value: 0, label: "Middle" });
  if (count > 1) lanes.push({ value: 1, label: "Right 1" });
  if (count > 3) lanes.push({ value: 2, label: "Right 2" });
  return lanes;
}

export function defaultCourseLane(lanes: CourseLane[]): number {
  return lanes.find((lane) => lane.value === 0)?.value ?? lanes[0]?.value ?? 0;
}
