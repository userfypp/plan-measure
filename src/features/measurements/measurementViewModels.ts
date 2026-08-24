import type { LinearUnit, Measurement, PageState } from "../../types/domain";
import { getActiveCalibration, getMeasurementCalibration } from "../../utils/calibration";
import { formatMeasurement } from "../../utils/format";
import { measurementPathSpecs } from "../../utils/geometry";

export interface MeasurementViewModel {
  id: string;
  name: string;
  typeLabel: string;
  valueLabel: string;
  calibrationSummary: string;
  hasCalibration: boolean;
}

export function createMeasurementViewModel(
  page: PageState,
  measurement: Measurement,
  displayUnit: LinearUnit,
  selected = false,
): MeasurementViewModel & { selected: boolean } {
  const calibration = getMeasurementCalibration(page, measurement);
  const calibrationMode = calibration?.mode === "xy" ? "X/Y correction" : "Uniform";

  return {
    id: measurement.id,
    name: measurement.name,
    typeLabel: measurementPathSpecs[measurement.type].label,
    valueLabel: calibration
      ? formatMeasurement(measurement, calibration, displayUnit)
      : "Scale unavailable",
    calibrationSummary: calibration
      ? `${calibration.name} · ${calibrationMode}`
      : "Scale unavailable",
    hasCalibration: calibration !== null,
    selected,
  };
}

export function createMeasurementViewModels(
  page: PageState,
  displayUnit: LinearUnit,
  selectedMeasurementId: string | null,
): Array<MeasurementViewModel & { selected: boolean }> {
  return page.measurements.map((measurement) =>
    createMeasurementViewModel(
      page,
      measurement,
      displayUnit,
      measurement.id === selectedMeasurementId,
    ),
  );
}

export function getMeasurementEmptyMessage(
  page: PageState,
): string {
  return getActiveCalibration(page)
    ? "Choose Line, Polyline, or Polygon to add a measurement."
    : page.calibrations.length > 0
      ? "Select an available scale to begin measuring."
      : "Add a scale to begin measuring.";
}
