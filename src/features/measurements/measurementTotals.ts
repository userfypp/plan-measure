import type {
  ClassificationCatalog,
  Measurement,
  MeasurementType,
  PageState,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { hasValidMeasurementPoints, measurementResultsMm } from "../../utils/geometry";
import { effectivePageLabel } from "../../utils/pageLabels";
import { createMeasurementGroups } from "./measurementGrouping";

export type TotalQuantity =
  { kind: "absent" } | { kind: "value"; value: number } | { kind: "unavailable" };

export interface MeasurementTotalGroup {
  key: string;
  label: string;
  archived: boolean;
  measurementCount: number;
  length: TotalQuantity;
  perimeter: TotalQuantity;
  area: TotalQuantity;
}

export type MeasurementTotalsGrouping = "overall" | "page" | "type" | "classification";

interface LocatedMeasurement {
  page: PageState;
  measurement: Measurement;
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

function calculateMeasurement(measurement: LocatedMeasurement): {
  length: number | null;
  perimeter: number | null;
  area: number | null;
  excluded: boolean;
} {
  const calibration = getMeasurementCalibration(measurement.page, measurement.measurement);
  if (!calibration) return { length: null, perimeter: null, area: null, excluded: true };
  if (!hasValidMeasurementPoints(measurement.measurement.type, measurement.measurement.points)) {
    return { length: null, perimeter: null, area: null, excluded: true };
  }
  try {
    const result = measurementResultsMm(measurement.measurement, calibration);
    const values = [result.lengthMm, result.perimeterMm, result.areaMm2];
    if (values.some((value) => value !== null && !Number.isFinite(value))) {
      return { length: null, perimeter: null, area: null, excluded: true };
    }
    return {
      length: result.lengthMm,
      perimeter: result.perimeterMm,
      area: result.areaMm2,
      excluded: false,
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return { length: null, perimeter: null, area: null, excluded: true };
    }
    throw error;
  }
}

function aggregateGroup(
  key: string,
  label: string,
  measurements: readonly LocatedMeasurement[],
  archived = false,
): { group: MeasurementTotalGroup; excludedCount: number } {
  const calculated = measurements.map(calculateMeasurement);
  return {
    group: {
      key,
      label,
      archived,
      measurementCount: measurements.length,
      length: sumQuantity(calculated.map((result) => result.length)),
      perimeter: sumQuantity(calculated.map((result) => result.perimeter)),
      area: sumQuantity(calculated.map((result) => result.area)),
    },
    excludedCount: calculated.filter((result) => result.excluded).length,
  };
}

export interface MeasurementTotalsResult {
  groups: MeasurementTotalGroup[];
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
    const types: readonly MeasurementType[] = ["line", "polyline", "polygon"];
    for (const type of types) {
      const measurements = allMeasurements.filter(({ measurement }) => measurement.type === type);
      if (!measurements.length) continue;
      groupInputs.push({
        key: `type:${type}`,
        label: type === "polyline" ? "Polyline" : type === "polygon" ? "Polygon" : "Line",
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
    aggregateGroup(input.key, input.label, input.measurements, input.archived),
  );
  return {
    groups: groups.map((entry) => entry.group),
    measurementCount: allMeasurements.length,
    // Count exclusions once across the project, even when grouping duplicates presentation.
    excludedCount: allMeasurements.map(calculateMeasurement).filter((result) => result.excluded)
      .length,
  };
}
