import type { Measurement } from "../../types/domain";

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

/** Page filter that follows the page on screen. */
export const CURRENT_PAGE_FILTER = "current";
/** Classification filter for measurements without any value; generated value ids never start with ":". */
export const UNCLASSIFIED_FILTER = ":unclassified";

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
