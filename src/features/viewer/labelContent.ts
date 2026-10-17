import type {
  AreaDisplay,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
} from "../../types/domain";
import type { LabelContent } from "../../utils/appPreferences";
import { formatMeasurement } from "../../utils/format";

/** On-screen label text; exports never use name/classification prefixes. */
export function composeLabelText(
  value: string,
  name: string | undefined,
  content: LabelContent,
  classification?: string,
): string {
  const trimmed = name?.trim();
  const parts: string[] = [];
  // Without a value (an unmeasured cloud) the name is the label whatever the preference says.
  if ((content === "name-value" || !value) && trimmed) parts.push(trimmed);
  if (classification) parts.push(classification);
  if (value) parts.push(value);
  return parts.join(" · ");
}

/**
 * On-screen label for a measurement: null when it has none (a scaled type without a scale), the
 * name for an unmeasured cloud, otherwise the formatted value composed with the name and
 * classification the preferences ask for. `calibration` is the measuring scale, which is null for
 * an unmeasured cloud (see `getMeasuringCalibration`).
 */
export function measurementLabelText(
  measurement: Pick<Measurement, "type" | "points" | "name">,
  calibration: PageCalibration | null,
  displayUnit: MeasurementDisplayUnit,
  decimalPlaces: MeasurementDecimalPlaces,
  areaDisplay: AreaDisplay,
  labelContent: LabelContent,
  classificationLabel?: string,
): string | null {
  if (!calibration && measurement.type !== "count" && measurement.type !== "cloud") return null;
  const text = composeLabelText(
    formatMeasurement(measurement, calibration, displayUnit, decimalPlaces, areaDisplay),
    measurement.name,
    labelContent,
    classificationLabel,
  );
  return text || null;
}
