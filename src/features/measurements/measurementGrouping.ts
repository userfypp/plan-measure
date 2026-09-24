import type { ClassificationCatalog, Measurement } from "../../types/domain";

export type MeasurementGroupVisibility = "visible" | "hidden" | "mixed";

export interface MeasurementGroup {
  key: string;
  dimensionLabel: string;
  label: string;
  archived: boolean;
  measurementIds: string[];
  visibility: MeasurementGroupVisibility;
  children?: MeasurementGroup[];
}

function getVisibility(measurements: readonly Measurement[]): MeasurementGroupVisibility {
  const allVisible = measurements.every((measurement) => measurement.visible);
  if (allVisible) return "visible";
  const allHidden = measurements.every((measurement) => !measurement.visible);
  return allHidden ? "hidden" : "mixed";
}

function prefixGroupKey(group: MeasurementGroup, parentKey: string): MeasurementGroup {
  const key = `${parentKey}/${group.key}`;
  return {
    ...group,
    key,
    children: group.children?.map((child) => prefixGroupKey(child, parentKey)),
  };
}

/**
 * Groups measurements by catalog dimensions in the supplied order.
 */
export function createMeasurementGroups(
  measurements: readonly Measurement[],
  catalog: ClassificationCatalog,
  dimensionIds: string | readonly string[],
): MeasurementGroup[] {
  const ids = typeof dimensionIds === "string" ? [dimensionIds] : dimensionIds;
  const [dimensionId, ...remainingIds] = ids;
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
        dimensionLabel: dimension.name,
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
      dimensionLabel: dimension.name,
      label: "None assigned",
      archived: false,
      measurementIds: unclassified.map((measurement) => measurement.id),
      visibility: getVisibility(unclassified),
    });
  }

  if (remainingIds.length === 0) return groups;

  const measurementsById = new Map(measurements.map((measurement) => [measurement.id, measurement]));
  return groups.map((group) => ({
    ...group,
    children: createMeasurementGroups(
      group.measurementIds.flatMap((id) => {
        const measurement = measurementsById.get(id);
        return measurement ? [measurement] : [];
      }),
      catalog,
      remainingIds,
    ).map((child) => prefixGroupKey(child, group.key)),
  }));
}
