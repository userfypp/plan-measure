import type { ClassificationCatalog, Measurement } from "../../types/domain";

export type MeasurementGroupVisibility = "visible" | "hidden" | "mixed";

export interface MeasurementGroup {
  key: string;
  label: string;
  archived: boolean;
  measurementIds: string[];
  visibility: MeasurementGroupVisibility;
}

function getVisibility(measurements: readonly Measurement[]): MeasurementGroupVisibility {
  const allVisible = measurements.every((measurement) => measurement.visible);
  if (allVisible) return "visible";
  const allHidden = measurements.every((measurement) => !measurement.visible);
  return allHidden ? "hidden" : "mixed";
}

/**
 * Groups measurements by one catalog dimension while retaining catalog and page ordering.
 */
export function createMeasurementGroups(
  measurements: readonly Measurement[],
  catalog: ClassificationCatalog,
  dimensionId: string,
): MeasurementGroup[] {
  const dimension = catalog.dimensions.find((candidate) => candidate.id === dimensionId);
  if (!dimension) return [];

  const measurementsByValueId = new Map<string, Measurement[]>();
  const valueIds = new Set(dimension.values.map((value) => value.id));
  const unclassified: Measurement[] = [];

  for (const measurement of measurements) {
    const assignedValueId = measurement.classificationValueIds.find((valueId) =>
      valueIds.has(valueId),
    );
    if (!assignedValueId) {
      unclassified.push(measurement);
      continue;
    }
    const groupedMeasurements = measurementsByValueId.get(assignedValueId) ?? [];
    groupedMeasurements.push(measurement);
    measurementsByValueId.set(assignedValueId, groupedMeasurements);
  }

  const groups = dimension.values.flatMap((value) => {
    const groupedMeasurements = measurementsByValueId.get(value.id);
    if (!groupedMeasurements?.length) return [];
    return [
      {
        key: `dimension:${dimension.id}:value:${value.id}`,
        label: value.name,
        archived: dimension.archived || value.archived,
        measurementIds: groupedMeasurements.map((measurement) => measurement.id),
        visibility: getVisibility(groupedMeasurements),
      },
    ];
  });

  if (unclassified.length) {
    groups.push({
      key: `dimension:${dimension.id}:unclassified`,
      label: "Unclassified",
      archived: false,
      measurementIds: unclassified.map((measurement) => measurement.id),
      visibility: getVisibility(unclassified),
    });
  }

  return groups;
}
