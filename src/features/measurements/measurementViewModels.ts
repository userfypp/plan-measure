import type {
  AreaDisplay,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
} from "../../types/domain";
import { getActiveCalibration, getMeasurementCalibration } from "../../utils/calibration";
import { formatMeasurement } from "../../utils/format";
import { measurementPathSpecs } from "../../utils/geometry";

export interface MeasurementViewModel {
  id: string;
  type: Measurement["type"];
  name: string;
  typeLabel: string;
  valueLabel: string;
  calibrationSummary: string;
  hasCalibration: boolean;
  visible: boolean;
  pageLabel?: string;
}

export function createMeasurementViewModel(
  page: PageState,
  measurement: Measurement,
  displayUnit: MeasurementDisplayUnit,
  selected = false,
  measurementDecimalPlaces: MeasurementDecimalPlaces = 2,
  areaDisplay: AreaDisplay = "auto",
): MeasurementViewModel & { selected: boolean } {
  const calibration = getMeasurementCalibration(page, measurement);
  const calibrationMode = calibration?.mode === "xy" ? "X/Y correction" : "Uniform";

  return {
    id: measurement.id,
    type: measurement.type,
    name: measurement.name,
    typeLabel: measurementPathSpecs[measurement.type].label,
    valueLabel: calibration
      ? formatMeasurement(
          measurement,
          calibration,
          displayUnit,
          measurementDecimalPlaces,
          areaDisplay,
        )
      : "Scale unavailable",
    calibrationSummary: calibration
      ? `${calibration.name} · ${calibrationMode}`
      : "Scale unavailable",
    hasCalibration: calibration !== null,
    visible: measurement.visible,
    selected,
  };
}

export function shouldRenderMeasurement(
  measurement: Measurement,
  showMeasurements: boolean,
): boolean {
  return showMeasurements && measurement.visible;
}

export function createMeasurementViewModels(
  page: PageState,
  displayUnit: MeasurementDisplayUnit,
  selectedMeasurementId: string | null,
  measurementDecimalPlaces: MeasurementDecimalPlaces = 2,
  areaDisplay: AreaDisplay = "auto",
): Array<MeasurementViewModel & { selected: boolean }> {
  return page.measurements.map((measurement) =>
    createMeasurementViewModel(
      page,
      measurement,
      displayUnit,
      measurement.id === selectedMeasurementId,
      measurementDecimalPlaces,
      areaDisplay,
    ),
  );
}

export function getMeasurementEmptyMessage(page: PageState): string {
  return getActiveCalibration(page)
    ? "Choose Line, Polyline, or Polygon to add a measurement."
    : page.calibrations.length > 0
      ? "Select an available scale to begin measuring."
      : "Add a scale to begin measuring.";
}
