import { useEffect, useState } from "react";
import { MeasurementGroup } from "./MeasurementGroup";
import { MeasurementRow } from "./MeasurementRow";
import type { MeasurementGroup as MeasurementGroupModel } from "./measurementGrouping";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementCollection.module.css";

export interface MeasurementCollectionProps {
  measurements: readonly (MeasurementViewModel & { selected: boolean })[];
  emptyMessage: string;
  onSelectMeasurement: (measurementId: string) => void;
  onRenameMeasurement: (measurementId: string, name: string) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  onDeleteMeasurement: (measurementId: string) => void;
  groups?: readonly MeasurementGroupModel[];
  groupByDimensionId?: string | null;
  onSetMeasurementsVisibility?: (measurementIds: string[], visible: boolean) => void;
}

export function MeasurementCollection({
  measurements,
  emptyMessage,
  onSelectMeasurement,
  onRenameMeasurement,
  onToggleVisibility,
  onDeleteMeasurement,
  groups,
  groupByDimensionId = null,
  onSetMeasurementsVisibility,
}: MeasurementCollectionProps) {
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const selectedMeasurementId =
    measurements.find((measurement) => measurement.selected)?.id ?? null;
  const selectedGroupKey = groups?.find((group) =>
    selectedMeasurementId ? group.measurementIds.includes(selectedMeasurementId) : false,
  )?.key;

  useEffect(() => {
    if (!selectedGroupKey) return;
    const frame = window.requestAnimationFrame(() => {
      setCollapsedGroupKeys((current) => {
        if (!current.has(selectedGroupKey)) return current;
        const next = new Set(current);
        next.delete(selectedGroupKey);
        return next;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedMeasurementId, selectedGroupKey]);

  function toggleGroup(key: string) {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (measurements.length === 0) {
    return (
      <section className={styles.collection} aria-label="Measurement collection">
        <p className={styles.empty}>{emptyMessage}</p>
      </section>
    );
  }

  if (groupByDimensionId && groups && onSetMeasurementsVisibility) {
    const measurementsById = new Map(
      measurements.map((measurement) => [measurement.id, measurement]),
    );
    return (
      <section className={styles.collection} aria-label="Measurement collection">
        <div className={styles.groups} aria-label="Measurements grouped by classification">
          {groups.map((group) => (
            <MeasurementGroup
              key={group.key}
              group={group}
              measurements={group.measurementIds.flatMap((id) => {
                const measurement = measurementsById.get(id);
                return measurement ? [measurement] : [];
              })}
              collapsed={collapsedGroupKeys.has(group.key)}
              onToggleCollapsed={() => toggleGroup(group.key)}
              onSelectMeasurement={onSelectMeasurement}
              onRenameMeasurement={onRenameMeasurement}
              onToggleVisibility={onToggleVisibility}
              onDeleteMeasurement={onDeleteMeasurement}
              onSetMeasurementsVisibility={(measurementIds, visible) =>
                onSetMeasurementsVisibility(measurementIds, visible)
              }
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.collection} aria-label="Measurement collection">
      <div className={styles.list} role="list" aria-label="Measurements on current page">
        {measurements.map((measurement) => (
          <MeasurementRow
            key={measurement.id}
            viewModel={measurement}
            onSelectMeasurement={onSelectMeasurement}
            onRenameMeasurement={onRenameMeasurement}
            onToggleVisibility={onToggleVisibility}
            onDeleteMeasurement={onDeleteMeasurement}
          />
        ))}
      </div>
    </section>
  );
}
