import type {
  ClassificationCatalog,
  ClassificationValuePrice,
  ClassificationValueRates,
  LinearUnit,
  Measurement,
  MeasurementType,
  PageState,
} from "../../types/domain";
import { getMeasurementCalibration, isCloudMeasured } from "../../utils/calibration";
import {
  hasValidMeasurementPoints,
  isValidPageCalibration,
  measurementResultsMm,
  measurementPathSpecs,
  MEASUREMENT_TYPES,
} from "../../utils/geometry";
import { isValidPrice, ratesByValueId } from "../../utils/classificationRates";
import {
  fromCubicMillimetres,
  fromMillimetres,
  fromSquareMillimetres,
  fromSquareMillimetresToAcres,
} from "../../utils/units";
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
  /** Area derived from the length or perimeter of values with a factor (height). */
  derivedArea: TotalQuantity;
  /** Volume derived from the area of values with a factor (thickness). */
  derivedVolume: TotalQuantity;
  /** Cost in units of the project currency: prices times quantities, not rounded. */
  cost: TotalQuantity;
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

/** Adds quantities; any unavailable makes the sum unavailable and all absent leaves it absent. */
function combineQuantities(quantities: readonly TotalQuantity[]): TotalQuantity {
  if (quantities.some((quantity) => quantity.kind === "unavailable"))
    return { kind: "unavailable" };
  const applicable = quantities.flatMap((quantity) =>
    quantity.kind === "value" ? [quantity.value] : [],
  );
  return sumQuantity(applicable);
}

/**
 * The calculated measurements of a group per classification value with rates, in catalog order.
 * Each value's base is summed once, before any factor or price is applied.
 */
function groupByRatedValue(
  measurements: readonly Measurement[],
  calculated: readonly CalculatedMeasurement[],
  rates: readonly ClassificationValueRates[],
): { rates: ClassificationValueRates; results: CalculatedMeasurement[] }[] {
  const byValue = ratesByValueId(rates);
  const resultsByValue = new Map<string, CalculatedMeasurement[]>();
  measurements.forEach((measurement, index) => {
    for (const valueId of measurement.classificationValueIds) {
      if (!byValue.has(valueId)) continue;
      const results = resultsByValue.get(valueId) ?? [];
      results.push(calculated[index]!);
      resultsByValue.set(valueId, results);
    }
  });
  return rates.flatMap((entry) => {
    const results = resultsByValue.get(entry.valueId);
    return results ? [{ rates: entry, results }] : [];
  });
}

/** Converts mm, mm² or mm³ (or a count) into the unit a price is quoted in. */
function toPriceUnit(value: number, unit: ClassificationValuePrice["unit"]): number {
  if (unit === "each") return value;
  if (unit === "ac") return fromSquareMillimetresToAcres(value);
  const power = unit.endsWith("²") ? 2 : unit.endsWith("³") ? 3 : 1;
  const linear = (power === 1 ? unit : unit.slice(0, -1)) as LinearUnit;
  return (
    power === 1 ? fromMillimetres : power === 2 ? fromSquareMillimetres : fromCubicMillimetres
  )(value, linear);
}

/** Amount times the quantity in the price's unit; a price that cannot be applied is unavailable. */
function priceCost(
  rates: ClassificationValueRates,
  results: readonly CalculatedMeasurement[],
  derived: TotalQuantity,
): TotalQuantity {
  const { price } = rates;
  if (!price) return absent();
  if (!isValidPrice(price, rates.derivation)) return { kind: "unavailable" };
  const { basis } = price;
  const base = basis === "derived" ? derived : sumQuantity(results.map((result) => result[basis]));
  if (base.kind !== "value") return base;
  const cost = price.amount * toPriceUnit(base.value, price.unit);
  return Number.isFinite(cost) ? { kind: "value", value: cost } : { kind: "unavailable" };
}

function deriveQuantities(
  rated: readonly { rates: ClassificationValueRates; results: readonly CalculatedMeasurement[] }[],
): Pick<MeasurementTotalGroup, "derivedArea" | "derivedVolume" | "cost"> {
  const areas: TotalQuantity[] = [];
  const volumes: TotalQuantity[] = [];
  const costs: TotalQuantity[] = [];
  for (const { rates, results } of rated) {
    let derived = absent();
    if (rates.derivation) {
      const { source, factorMm } = rates.derivation;
      const base = sumQuantity(results.map((result) => result[source]));
      derived =
        base.kind !== "value"
          ? base
          : Number.isFinite(factorMm * base.value)
            ? { kind: "value", value: factorMm * base.value }
            : { kind: "unavailable" };
      (source === "area" ? volumes : areas).push(derived);
    }
    costs.push(priceCost(rates, results, derived));
  }
  return {
    derivedArea: combineQuantities(areas),
    derivedVolume: combineQuantities(volumes),
    cost: combineQuantities(costs),
  };
}

function calculateMeasurement(
  measurement: LocatedMeasurement,
  measureClouds: boolean,
): CalculatedMeasurement {
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
  if (
    measurement.measurement.type === "cloud" &&
    !isCloudMeasured(measurement.measurement, calibration, measureClouds)
  ) {
    // Markup, not a problem: it contributes no quantity and is not reported as excluded.
    return {
      length: null,
      perimeter: null,
      area: null,
      count: null,
      excluded: false,
      exclusionReason: null,
    };
  }
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
  rates: readonly ClassificationValueRates[],
  archived = false,
): MeasurementTotalGroup {
  const calculated = measurements.map(({ measurement }) =>
    calculationsByMeasurement.get(measurement)!,
  );
  const rated = rates.length
    ? groupByRatedValue(
        measurements.map(({ measurement }) => measurement),
        calculated,
        rates,
      )
    : [];
  return {
    key,
    label,
    archived,
    measurementCount: measurements.length,
    excludedCount: calculated.filter((result) => result.excluded).length,
    length: sumQuantity(calculated.map((result) => result.length)),
    perimeter: sumQuantity(calculated.map((result) => result.perimeter)),
    area: sumQuantity(calculated.map((result) => result.area)),
    count: sumQuantity(calculated.map((result) => result.count)),
    ...deriveQuantities(rated),
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
  measureClouds = false,
  rates = [],
}: {
  pages: Readonly<Record<number, PageState>>;
  catalog: ClassificationCatalog;
  grouping: MeasurementTotalsGrouping;
  classificationDimensionId: string | null;
  pageLabelOverrides: Readonly<Record<number, string>>;
  sourcePageLabels: readonly string[] | null;
  /** Whether revision clouds contribute perimeter and area (a project setting). */
  measureClouds?: boolean;
  /** Derivation factors and unit prices per classification value, in catalog order. */
  rates?: readonly ClassificationValueRates[];
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
      calculateMeasurement({ page, measurement }, measureClouds),
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
    const types: readonly MeasurementType[] = MEASUREMENT_TYPES;
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
      rates,
      input.archived,
    ),
  );
  return {
    groups,
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
