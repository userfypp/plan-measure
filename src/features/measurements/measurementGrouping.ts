import type { ClassificationCatalog, Measurement } from "../../types/domain";

export type MeasurementGroupVisibility = "visible" | "hidden" | "mixed";

export interface MeasurementGroupSegment {
  dimensionLabel: string;
  label: string;
  archived: boolean;
  unassigned: boolean;
}

export interface MeasurementGroup {
  key: string;
  dimensionLabel: string;
  label: string;
  archived: boolean;
  unassigned: boolean;
  /** The chain `compactMeasurementGroups` merged, head included. */
  segments?: MeasurementGroupSegment[];
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

// Classification IDs from imported projects can contain the ":" and "/" that build group keys, so
// two different groups could share a key. Encoding the IDs keeps every key unique.
function keyPart(id: string) {
  return encodeURIComponent(id);
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

  const groups: MeasurementGroup[] = dimension.values.flatMap((value) => {
    const groupedMeasurements = measurementsByValueId.get(value.id);
    if (!groupedMeasurements?.length) return [];
    return [
      {
        key: `dimension:${keyPart(dimension.id)}:value:${keyPart(value.id)}`,
        dimensionLabel: dimension.name,
        label: value.name,
        archived: dimension.archived || value.archived,
        unassigned: false,
        measurementIds: groupedMeasurements.map((measurement) => measurement.id),
        visibility: getVisibility(groupedMeasurements),
      },
    ];
  });

  if (unclassified.length) {
    groups.push({
      key: `dimension:${keyPart(dimension.id)}:unclassified`,
      dimensionLabel: dimension.name,
      label: "Unclassified",
      archived: false,
      unassigned: true,
      measurementIds: unclassified.map((measurement) => measurement.id),
      visibility: getVisibility(unclassified),
    });
  }

  if (remainingIds.length === 0) return groups;

  const measurementsById = new Map(
    measurements.map((measurement) => [measurement.id, measurement]),
  );
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

function hasSameMeasurementScope(parentIds: readonly string[], childIds: readonly string[]) {
  if (parentIds.length !== childIds.length) return false;
  const parentIdSet = new Set(parentIds);
  const childIdSet = new Set(childIds);
  return (
    parentIdSet.size === parentIds.length &&
    childIdSet.size === childIds.length &&
    childIds.every((measurementId) => parentIdSet.has(measurementId))
  );
}

function toSegment(group: MeasurementGroup): MeasurementGroupSegment {
  return {
    dimensionLabel: group.dimensionLabel,
    label: group.label,
    archived: group.archived,
    unassigned: group.unassigned,
  };
}

/**
 * Fuses a group with its only child when both cover exactly the same measurements, so chains such
 * as Unclassified > Unclassified > Unclassified render as one header. The head keeps its identity;
 * `segments` records the whole chain and `children` come from the tail. Does not mutate the input.
 */
export function compactMeasurementGroups(groups: readonly MeasurementGroup[]): MeasurementGroup[] {
  return groups.map((group) => {
    const segments = [toSegment(group)];
    let tail = group;
    while (
      tail.children?.length === 1 &&
      hasSameMeasurementScope(tail.measurementIds, tail.children[0]!.measurementIds)
    ) {
      tail = tail.children[0]!;
      segments.push(toSegment(tail));
    }
    const children = tail.children ? compactMeasurementGroups(tail.children) : undefined;
    if (segments.length === 1 && children === undefined) return group;
    return {
      ...group,
      ...(segments.length > 1 ? { segments } : {}),
      children,
    };
  });
}
