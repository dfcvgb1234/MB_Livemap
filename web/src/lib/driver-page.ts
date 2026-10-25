/** Header label for the driver page. Null when neither mod is loaded. */
export function driverPageLabel(autoDriveAvailable: boolean, courseplayAvailable: boolean) {
  if (autoDriveAvailable && courseplayAvailable) return "AutoDrive / CoursePlay";
  if (autoDriveAvailable) return "AutoDrive";
  if (courseplayAvailable) return "CoursePlay";
  return null;
}
