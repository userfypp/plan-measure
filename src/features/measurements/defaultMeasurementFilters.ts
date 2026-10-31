import type { MeasurementFilters } from "./measurementFilters";

// Kept apart from `measurementFilters.ts` so the preferences loaded at startup do not pull in geometry.

/** The filters a measurement list can start with; a selection is never a default. */
export type DefaultMeasurementFilters = Pick<
  MeasurementFilters,
  "page" | "type" | "scale" | "classification" | "visibility"
>;

export const NO_DEFAULT_MEASUREMENT_FILTERS: DefaultMeasurementFilters = {
  page: "",
  type: "",
  scale: "",
  classification: "",
  visibility: "",
};

/** Page filter that follows the page on screen. */
export const CURRENT_PAGE_FILTER = "current";
/** Classification filter for measurements without any value; generated value ids never start with ":". */
export const UNCLASSIFIED_FILTER = ":unclassified";

/**
 * Whether `value` is a complete set of default filters. The app-wide default can only be
 * "unclassified" for classification: a value id only exists inside one project.
 */
export function isDefaultMeasurementFilters(
  value: unknown,
  scope: "app" | "project",
  isType: (type: string) => boolean = () => true,
): value is DefaultMeasurementFilters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { page, type, scale, classification, visibility } = value as Record<string, unknown>;
  return (
    (page === "" || page === CURRENT_PAGE_FILTER) &&
    typeof type === "string" &&
    (type === "" || isType(type)) &&
    (scale === "" || scale === "active" || scale === "other") &&
    (scope === "project"
      ? typeof classification === "string"
      : classification === "" || classification === UNCLASSIFIED_FILTER) &&
    (visibility === "" || visibility === "true" || visibility === "false")
  );
}

/** Only the default filters of `filters`, dropping anything else it carries. */
export function pickDefaultMeasurementFilters({
  page,
  type,
  scale,
  classification,
  visibility,
}: DefaultMeasurementFilters): DefaultMeasurementFilters {
  return { page, type, scale, classification, visibility };
}
