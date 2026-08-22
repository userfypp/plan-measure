import type { Measurement, PageCalibration, PageState } from "../types/domain";

export function findPageCalibration(
  page: Pick<PageState, "calibrations">,
  calibrationId: string | null,
): PageCalibration | null {
  if (!calibrationId) return null;
  return page.calibrations.find((calibration) => calibration.id === calibrationId) ?? null;
}

export function getActiveCalibration(page: PageState): PageCalibration | null {
  return findPageCalibration(page, page.activeCalibrationId);
}

export function getMeasurementCalibration(
  page: Pick<PageState, "calibrations">,
  measurement: Pick<Measurement, "calibrationId">,
): PageCalibration | null {
  return findPageCalibration(page, measurement.calibrationId);
}
