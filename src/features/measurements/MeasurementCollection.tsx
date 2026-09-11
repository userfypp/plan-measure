import { useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import { MeasurementGroup } from "./MeasurementGroup";
import { MeasurementRow } from "./MeasurementRow";
import type { MeasurementGroup as MeasurementGroupModel } from "./measurementGrouping";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementCollection.module.css";

export interface MeasurementCollectionProps {
  measurements: readonly (MeasurementViewModel & { selected: boolean })[];
  emptyMessage: string;
  onSelectMeasurement: (measurementId: string) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  groups?: readonly MeasurementGroupModel[];
  groupByDimensionId?: string | null;
  onSetMeasurementsVisibility?: (measurementIds: string[], visible: boolean) => void;
}

type MeasurementControl = "selection" | "visibility";
type RovingCell = { measurementId: string; control: MeasurementControl };

export function MeasurementCollection({
  measurements,
  emptyMessage,
  onSelectMeasurement,
  onToggleVisibility,
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
  const [rovingCell, setRovingCell] = useState<RovingCell | null>(() => {
    const initial = selectedMeasurementId ?? measurements[0]?.id;
    return initial ? { measurementId: initial, control: "selection" } : null;
  });
  const grouped = Boolean(groupByDimensionId && groups && onSetMeasurementsVisibility);
  const visibleMeasurementIds = grouped
    ? (groups ?? []).flatMap((group) =>
        collapsedGroupKeys.has(group.key) ? [] : group.measurementIds,
      )
    : measurements.map((measurement) => measurement.id);
  const visibleMeasurementIdSet = new Set(visibleMeasurementIds);
  const firstVisibleMeasurementId = visibleMeasurementIds.find((id) =>
    measurements.some((measurement) => measurement.id === id),
  );
  const effectiveRovingCell =
    rovingCell &&
    visibleMeasurementIdSet.has(rovingCell.measurementId) &&
    measurements.some((measurement) => measurement.id === rovingCell.measurementId)
      ? rovingCell
      : firstVisibleMeasurementId
        ? {
            measurementId:
              selectedMeasurementId && visibleMeasurementIdSet.has(selectedMeasurementId)
                ? selectedMeasurementId
                : firstVisibleMeasurementId,
            control: "selection" as const,
          }
        : null;

  function handleFocusCapture(event: FocusEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const measurementId = target?.dataset.measurementId;
    const control = target?.dataset.measurementControl as MeasurementControl | undefined;
    if (!measurementId || (control !== "selection" && control !== "visibility")) return;
    setRovingCell((current) =>
      current?.measurementId === measurementId && current.control === control
        ? current
        : { measurementId, control },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const measurementId = target?.dataset.measurementId;
    const control = target?.dataset.measurementControl as MeasurementControl | undefined;
    if (!measurementId || (control !== "selection" && control !== "visibility")) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-measurement-id][data-measurement-control]"),
    ).filter((element) => !element.closest("[hidden]"));
    const orderedIds = Array.from(new Set(controls.map((element) => element.dataset.measurementId).filter(Boolean))) as string[];
    const rowIndex = orderedIds.indexOf(measurementId);
    if (rowIndex < 0) return;

    let nextId = measurementId;
    let nextControl = control;
    if (event.key === "ArrowLeft") nextControl = "selection";
    else if (event.key === "ArrowRight") nextControl = "visibility";
    else if (event.key === "Home") nextId = orderedIds[0] ?? measurementId;
    else if (event.key === "End") nextId = orderedIds.at(-1) ?? measurementId;
    else {
      const delta = event.key === "ArrowUp" ? -1 : 1;
      nextId = orderedIds[Math.max(0, Math.min(orderedIds.length - 1, rowIndex + delta))] ?? measurementId;
    }

    const next = controls.find(
      (element) => element.dataset.measurementId === nextId && element.dataset.measurementControl === nextControl,
    );
    if (!next || next === target) return;
    event.preventDefault();
    setRovingCell({ measurementId: nextId, control: nextControl });
    next.focus({ preventScroll: true });
    next.scrollIntoView?.({ block: "nearest" });
  }

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
      <section
        className={styles.collection}
        aria-label="Measurement collection"
        onFocusCapture={handleFocusCapture}
        onKeyDown={handleKeyDown}
      >
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
              onToggleVisibility={onToggleVisibility}
              onSetMeasurementsVisibility={(measurementIds, visible) =>
                onSetMeasurementsVisibility(measurementIds, visible)
              }
              rovingCell={effectiveRovingCell}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.collection}
      aria-label="Measurement collection"
      onFocusCapture={handleFocusCapture}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.list} role="list" aria-label="Measurements on current page">
        {measurements.map((measurement) => (
          <MeasurementRow
            key={measurement.id}
            viewModel={measurement}
            onSelectMeasurement={onSelectMeasurement}
            onToggleVisibility={onToggleVisibility}
            selectionTabIndex={
              effectiveRovingCell?.measurementId === measurement.id &&
              effectiveRovingCell.control === "selection"
                ? 0
                : -1
            }
            visibilityTabIndex={
              effectiveRovingCell?.measurementId === measurement.id &&
              effectiveRovingCell.control === "visibility"
                ? 0
                : -1
            }
          />
        ))}
      </div>
    </section>
  );
}
