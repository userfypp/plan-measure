import type { CurrentSession } from "../types/domain";
import {
  createMeasurementTotals,
  type MeasurementTotalGroup,
  type TakeoffSelection,
} from "../features/measurements/measurementTotals";

export interface TakeoffSummary {
  linearUnit: "mm";
  areaUnit: "mm²";
  allPages: true;
  includesHidden: true;
  projectTotals: MeasurementTotalGroup;
  breakdowns: {
    type: "page" | "type" | "classification";
    dimension: { id: string; name: string; archived: boolean } | null;
    groups: MeasurementTotalGroup[];
  }[];
}

export function buildTakeoffSummary(
  session: CurrentSession,
  selection: TakeoffSelection,
  pageLabels: readonly string[] | null = null,
): TakeoffSummary {
  const options = {
    pages: session.pages,
    catalog: session.classificationCatalog,
    pageLabelOverrides: session.pageLabelOverrides,
    sourcePageLabels: pageLabels,
    classificationDimensionId: null,
  };
  const dimensions = new Set(selection.classificationDimensionIds);
  for (const id of dimensions) {
    if (!session.classificationCatalog.dimensions.some((dimension) => dimension.id === id)) {
      throw new Error("Choose available classification dimensions before exporting the summary.");
    }
  }
  const overall = createMeasurementTotals({ ...options, grouping: "overall" });
  const projectTotals = overall.groups[0] ?? {
    key: "overall",
    label: "Project totals",
    archived: false,
    measurementCount: 0,
    excludedCount: 0,
    length: { kind: "absent" as const },
    perimeter: { kind: "absent" as const },
    area: { kind: "absent" as const },
  };
  const breakdowns: TakeoffSummary["breakdowns"] = [];
  for (const type of ["page", "type"] as const) {
    if (selection.breakdowns.includes(type))
      breakdowns.push({
        type,
        dimension: null,
        groups: createMeasurementTotals({ ...options, grouping: type }).groups,
      });
  }
  for (const dimension of session.classificationCatalog.dimensions) {
    if (dimensions.has(dimension.id))
      breakdowns.push({
        type: "classification",
        dimension: { id: dimension.id, name: dimension.name, archived: dimension.archived },
        groups: createMeasurementTotals({
          ...options,
          grouping: "classification",
          classificationDimensionId: dimension.id,
        }).groups,
      });
  }
  return {
    linearUnit: "mm",
    areaUnit: "mm²",
    allPages: true,
    includesHidden: true,
    projectTotals,
    breakdowns,
  };
}
