import { describe, expect, it } from "vitest";
import { NO_DEFAULT_MEASUREMENT_FILTERS } from "./defaultMeasurementFilters";
import { NO_MEASUREMENT_FILTERS, initialMeasurementFilters } from "./measurementFilters";

describe("initialMeasurementFilters", () => {
  const app = { ...NO_DEFAULT_MEASUREMENT_FILTERS, page: "current", type: "polygon" };

  it("uses the project's filters when it sets its own, else the app's", () => {
    const project = { ...NO_DEFAULT_MEASUREMENT_FILTERS, visibility: "false" };
    expect(initialMeasurementFilters(project, app)).toEqual({
      ...NO_MEASUREMENT_FILTERS,
      visibility: "false",
    });
    expect(initialMeasurementFilters(null, app)).toEqual({
      ...NO_MEASUREMENT_FILTERS,
      page: "current",
      type: "polygon",
    });
  });

  it("drops a measurement type this version does not know", () => {
    expect(initialMeasurementFilters(null, { ...app, type: "circle" }).type).toBe("");
  });
});
