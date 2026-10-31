import type { Measurement } from "../../types/domain";
import { isMeasurementType } from "../../utils/geometry";
import {
  pickDefaultMeasurementFilters,
  type DefaultMeasurementFilters,
} from "./defaultMeasurementFilters";

export type MeasurementFilterKey =
  "page" | "type" | "scale" | "classification" | "visibility" | "selection";

/** One value per filter; an empty string leaves that filter off. */
export type MeasurementFilters = Readonly<Record<MeasurementFilterKey, string>>;

export const NO_MEASUREMENT_FILTERS: MeasurementFilters = {
  page: "",
  type: "",
  scale: "",
  classification: "",
  visibility: "",
  selection: "",
};

export {
  CURRENT_PAGE_FILTER,
  NO_DEFAULT_MEASUREMENT_FILTERS,
  UNCLASSIFIED_FILTER,
  type DefaultMeasurementFilters,
} from "./defaultMeasurementFilters";

/** The filters a measurement list starts with: the project's own when it has them, else the app's. */
export function initialMeasurementFilters(
  project: DefaultMeasurementFilters | null | undefined,
  app: DefaultMeasurementFilters,
): MeasurementFilters {
  const defaults = pickDefaultMeasurementFilters(project ?? app);
  return {
    ...NO_MEASUREMENT_FILTERS,
    ...defaults,
    type: isMeasurementType(defaults.type) ? defaults.type : "",
  };
}

export interface FilterableMeasurement {
  pageNumber: number;
  pageLabel: string;
  type: Measurement["type"];
  visible: boolean;
  selected: boolean;
  calibrationId: string | null;
  classificationValueIds: readonly string[];
}

/** "active" for the active scale of the page on screen, "other" for any other scale, "" for none. */
export function measurementScaleFilterValue(
  measurement: Pick<FilterableMeasurement, "pageNumber" | "calibrationId">,
  currentPageNumber: number,
  activeCalibrationId: string | null,
) {
  if (measurement.calibrationId === null) return "";
  return measurement.pageNumber === currentPageNumber &&
    measurement.calibrationId === activeCalibrationId
    ? "active"
    : "other";
}
