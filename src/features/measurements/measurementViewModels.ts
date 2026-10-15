import type {
  AreaDisplay,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
  PageState,
} from "../../types/domain";
import { getAppPreferences } from "../../utils/appPreferences";
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

interface CachedValueLabel {
  type: Measurement["type"];
  points: Measurement["points"];
  calibration: PageCalibration | null;
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
  areaDisplay: AreaDisplay;
  thousandsSeparator: string;
  decimalSeparator: string;
  label: string;
}

/**
 * Formatted values by measurement. The list rebuilds every view model when any measurement or the
 * selection changes; measurements are immutable, so unchanged ones reuse their value while its
 * geometry, scale and number format are the same objects and settings.
 */
export type MeasurementValueLabelCache = WeakMap<Measurement, CachedValueLabel>;

function measurementValueLabel(
  measurement: Measurement,
  calibration: PageCalibration | null,
  displayUnit: MeasurementDisplayUnit,
  decimalPlaces: MeasurementDecimalPlaces,
  areaDisplay: AreaDisplay,
  cache: MeasurementValueLabelCache | undefined,
): string {
  if (!calibration && measurement.type !== "count") return "Scale unavailable";
  if (!cache) {
    return formatMeasurement(measurement, calibration, displayUnit, decimalPlaces, areaDisplay);
  }
  const { thousandsSeparator, decimalSeparator } = getAppPreferences();
  const cached = cache.get(measurement);
  if (
    cached &&
    cached.type === measurement.type &&
    cached.points === measurement.points &&
    cached.calibration === calibration &&
    cached.displayUnit === displayUnit &&
    cached.decimalPlaces === decimalPlaces &&
    cached.areaDisplay === areaDisplay &&
    cached.thousandsSeparator === thousandsSeparator &&
    cached.decimalSeparator === decimalSeparator
  ) {
    return cached.label;
  }
  const label = formatMeasurement(
    measurement,
    calibration,
    displayUnit,
    decimalPlaces,
    areaDisplay,
  );
  cache.set(measurement, {
    type: measurement.type,
    points: measurement.points,
    calibration,
    displayUnit,
    decimalPlaces,
    areaDisplay,
    thousandsSeparator,
    decimalSeparator,
    label,
  });
  return label;
}

export function createMeasurementViewModel(
  page: PageState,
  measurement: Measurement,
  displayUnit: MeasurementDisplayUnit,
  selected = false,
  measurementDecimalPlaces: MeasurementDecimalPlaces = 2,
  areaDisplay: AreaDisplay = "auto",
  valueLabels?: MeasurementValueLabelCache,
): MeasurementViewModel & { selected: boolean } {
  const calibration = getMeasurementCalibration(page, measurement);
  const calibrationMode = calibration?.mode === "xy" ? "X/Y correction" : "Uniform";

  return {
    id: measurement.id,
    type: measurement.type,
    name: measurement.name,
    typeLabel: measurementPathSpecs[measurement.type].label,
    valueLabel: measurementValueLabel(
      measurement,
      calibration,
      displayUnit,
      measurementDecimalPlaces,
      areaDisplay,
      valueLabels,
    ),
    calibrationSummary: measurement.type === "count" ? "No scale required" : calibration
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

export function getMeasurementEmptyMessage(page: PageState): string {
  return getActiveCalibration(page)
    ? "Choose Line, Polyline, Polygon, or Count to add a measurement."
    : page.calibrations.length > 0
      ? "Choose Count, or select an available scale to begin measuring."
      : "Choose Count, or add a scale to begin measuring.";
}
