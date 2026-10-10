import type {
  ClassificationCatalog,
  Measurement,
  MeasurementType,
  PageState,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import {
  hasValidMeasurementPoints,
  isValidPageCalibration,
  measurementResultsMm,
  measurementPathSpecs,
} from "../../utils/geometry";
import { effectivePageLabel } from "../../utils/pageLabels";
import { createMeasurementGroups } from "./measurementGrouping";

export type TotalQuantity =
  { kind: "absent" } | { kind: "value"; value: number } | { kind: "unavailable" };

export interface MeasurementTotalGroup {
  key: string;
  label: string;
  archived: boolean;
  measurementCount: number;
  excludedCount: number;
  length: TotalQuantity;
  perimeter: TotalQuantity;
  area: TotalQuantity;
  count: TotalQuantity;
}

export type MeasurementTotalsGrouping = "overall" | "page" | "type" | "classification";

export interface TakeoffSelection {
  includeProjectTotals?: boolean;
  breakdowns: readonly ("page" | "type")[];
  classificationDimensionIds: readonly string[];
}

interface LocatedMeasurement {
  page: PageState;
  measurement: Measurement;
}

export type TakeoffExclusionReason =
  "missing-scale" | "invalid-geometry" | "invalid-scale" | "nonfinite-result";

export interface TakeoffMeasurementSource {
  pageNumber: number;
  pageLabel: string;
  measurement: Measurement;
  exclusionReason: TakeoffExclusionReason | null;
}

interface CalculatedMeasurement {
  length: number | null;
  perimeter: number | null;
  area: number | null;
  count: number | null;
  excluded: boolean;
  exclusionReason: TakeoffExclusionReason | null;
}

const absent = (): TotalQuantity => ({ kind: "absent" });

function sumQuantity(values: readonly (number | null)[]): TotalQuantity {
  const applicable = values.filter((value): value is number => value !== null);
  if (applicable.length === 0) return absent();
  let total = 0;
  for (const value of applicable) {
    if (!Number.isFinite(value)) return { kind: "unavailable" };
    total += value;
    if (!Number.isFinite(total)) return { kind: "unavailable" };
  }
  return { kind: "value", value: total };
}

function calculateMeasurement(measurement: LocatedMeasurement): CalculatedMeasurement {
  if (measurement.measurement.type === "count") {
    const valid = hasValidMeasurementPoints("count", measurement.measurement.points);
    return {
      length: null,
      perimeter: null,
      area: null,
      count: valid ? measurement.measurement.points.length : null,
      excluded: !valid,
      exclusionReason: valid ? null : "invalid-geometry",
    };
  }
  const calibration = getMeasurementCalibration(measurement.page, measurement.measurement);
  if (!calibration)
    return {
      length: null,
      perimeter: null,
      area: null,
      count: null,
      excluded: true,
      exclusionReason: "missing-scale",
    };
  if (!hasValidMeasurementPoints(measurement.measurement.type, measurement.measurement.points)) {
    return {
      length: null,
      perimeter: null,
      area: null,
      count: null,
      excluded: true,
      exclusionReason: "invalid-geometry",
    };
  }
  try {
    const result = measurementResultsMm(measurement.measurement, calibration);
    const values = [result.lengthMm, result.perimeterMm, result.areaMm2];
    if (values.some((value) => value !== null && !Number.isFinite(value))) {
      return {
        length: null,
        perimeter: null,
        area: null,
      count: null,
        excluded: true,
        exclusionReason: "nonfinite-result",
      };
    }
    return {
      length: result.lengthMm,
      perimeter: result.perimeterMm,
      area: result.areaMm2,
      count: null,
      excluded: false,
      exclusionReason: null,
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        length: null,
        perimeter: null,
        area: null,
      count: null,
        excluded: true,
        exclusionReason: isValidPageCalibration(calibration) ? "nonfinite-result" : "invalid-scale",
      };
    }
    throw error;
  }
}

function aggregateGroup(
  key: string,
  label: string,
  measurements: readonly LocatedMeasurement[],
  calculationsByMeasurement: ReadonlyMap<Measurement, CalculatedMeasurement>,
  archived = false,
): { group: MeasurementTotalGroup; excludedCount: number } {
  const calculated = measurements.map(({ measurement }) =>
    calculationsByMeasurement.get(measurement)!,
  );
  return {
    group: {
      key,
      label,
      archived,
      measurementCount: measurements.length,
      excludedCount: calculated.filter((result) => result.excluded).length,
      length: sumQuantity(calculated.map((result) => result.length)),
      perimeter: sumQuantity(calculated.map((result) => result.perimeter)),
      area: sumQuantity(calculated.map((result) => result.area)),
      count: sumQuantity(calculated.map((result) => result.count)),
    },
    excludedCount: calculated.filter((result) => result.excluded).length,
  };
}

export interface MeasurementTotalsResult {
  groups: MeasurementTotalGroup[];
  sourcesByGroup: ReadonlyMap<string, readonly TakeoffMeasurementSource[]>;
  excludedMeasurements: readonly TakeoffMeasurementSource[];
  measurementCount: number;
  excludedCount: number;
}

export function createMeasurementTotals({
  pages,
  catalog,
  grouping,
  classificationDimensionId,
  pageLabelOverrides,
  sourcePageLabels,
}: {
  pages: Readonly<Record<number, PageState>>;
  catalog: ClassificationCatalog;
  grouping: MeasurementTotalsGrouping;
  classificationDimensionId: string | null;
  pageLabelOverrides: Readonly<Record<number, string>>;
  sourcePageLabels: readonly string[] | null;
}): MeasurementTotalsResult {
  const orderedPages = Object.values(pages).sort(
    (left, right) => left.pageNumber - right.pageNumber,
  );
  const allMeasurements = orderedPages.flatMap((page) =>
    page.measurements.map((measurement) => ({ page, measurement })),
  );
  const calculationsByMeasurement = new Map<Measurement, CalculatedMeasurement>(
    allMeasurements.map(({ page, measurement }) => [
      measurement,
      calculateMeasurement({ page, measurement }),
    ]),
  );
  const sourcesByMeasurement = new Map(
    allMeasurements.map(
      ({ page, measurement }) =>
        [
          measurement,
          {
            pageNumber: page.pageNumber,
            pageLabel:
              effectivePageLabel(page.pageNumber, pageLabelOverrides, sourcePageLabels) ||
              `Page ${page.pageNumber}`,
            measurement,
            exclusionReason: calculationsByMeasurement.get(measurement)!.exclusionReason,
          },
        ] as const,
    ),
  );
  const groupInputs: Array<{
    key: string;
    label: string;
    archived?: boolean;
    measurements: LocatedMeasurement[];
  }> = [];

  if (grouping === "page") {
    for (const page of orderedPages) {
      if (!page.measurements.length) continue;
      groupInputs.push({
        key: `page:${page.pageNumber}`,
        label:
          effectivePageLabel(page.pageNumber, pageLabelOverrides, sourcePageLabels) ||
          `Page ${page.pageNumber}`,
        measurements: page.measurements.map((measurement) => ({ page, measurement })),
      });
    }
  } else if (grouping === "type") {
    const types: readonly MeasurementType[] = ["line", "polyline", "polygon", "count"];
    for (const type of types) {
      const measurements = allMeasurements.filter(({ measurement }) => measurement.type === type);
      if (!measurements.length) continue;
      groupInputs.push({
        key: `type:${type}`,
        label: measurementPathSpecs[type].label,
        measurements,
      });
    }
  } else if (grouping === "classification" && classificationDimensionId) {
    const grouped = createMeasurementGroups(
      allMeasurements.map(({ measurement }) => measurement),
      catalog,
      classificationDimensionId,
    );
    const locationsById = new Map(allMeasurements.map((entry) => [entry.measurement.id, entry]));
    for (const group of grouped) {
      groupInputs.push({
        key: group.key,
        label: group.label,
        archived: group.archived,
        measurements: group.measurementIds.flatMap((id) => {
          const entry = locationsById.get(id);
          return entry ? [entry] : [];
        }),
      });
    }
  } else if (grouping === "overall") {
    groupInputs.push({ key: "overall", label: "All measurements", measurements: allMeasurements });
  }

  const groups = groupInputs.map((input) =>
    aggregateGroup(
      input.key,
      input.label,
      input.measurements,
      calculationsByMeasurement,
      input.archived,
    ),
  );
  return {
    groups: groups.map((entry) => entry.group),
    sourcesByGroup: new Map(
      groupInputs.map((input) => [
        input.key,
        input.measurements.map(({ measurement }) => sourcesByMeasurement.get(measurement)!),
      ]),
    ),
    excludedMeasurements: [...sourcesByMeasurement.values()].filter(
      (source) => source.exclusionReason !== null,
    ),
    measurementCount: allMeasurements.length,
    // Count exclusions once across the project, even when grouping duplicates presentation.
    excludedCount: [...calculationsByMeasurement.values()].filter((result) => result.excluded)
      .length,
  };
}
