import { useId } from "react";
import { Badge, Button } from "../../components/ui";
import type { MeasurementGroup as MeasurementGroupModel } from "./measurementGrouping";
import { MeasurementRow } from "./MeasurementRow";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementGroup.module.css";

export interface MeasurementGroupProps {
  group: MeasurementGroupModel;
  measurements: readonly (MeasurementViewModel & { selected: boolean })[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectMeasurement: (measurementId: string) => void;
  onRenameMeasurement: (measurementId: string, name: string) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  onDeleteMeasurement: (measurementId: string) => void;
  onSetMeasurementsVisibility: (measurementIds: string[], visible: boolean) => void;
}

const visibilityVariant = {
  visible: "success",
  hidden: "neutral",
  mixed: "warning",
} as const;

const visibilityLabel = {
  visible: "Visible",
  hidden: "Hidden",
  mixed: "Mixed",
} as const;

function ChevronIcon() {
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function MeasurementGroup({
  group,
  measurements,
  collapsed,
  onToggleCollapsed,
  onSelectMeasurement,
  onRenameMeasurement,
  onToggleVisibility,
  onDeleteMeasurement,
  onSetMeasurementsVisibility,
}: MeasurementGroupProps) {
  const generatedId = useId();
  const listId = `${generatedId}-measurements`;
  const actionIsHide = group.visibility === "visible";
  const actionLabel = actionIsHide ? "Hide" : "Show";
  const bulkActionLabel =
    group.key.endsWith(":unclassified")
      ? `${actionLabel} all unclassified measurements`
      : `${actionLabel} all measurements in ${group.label}`;

  return (
    <section className={styles.group} aria-label={`${group.label} measurement group`}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={!collapsed}
          aria-controls={listId}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.label} group`}
          onClick={onToggleCollapsed}
        >
          <ChevronIcon />
        </button>
        <div className={styles.title}>
          <h3>
            {group.label}
            {group.archived ? " (archived)" : ""}
          </h3>
          <span className={styles.count} aria-label={`${group.measurementIds.length} measurements`}>
            {group.measurementIds.length}
          </span>
        </div>
        <div className={styles.actions}>
          <Badge variant={visibilityVariant[group.visibility]}>
            {visibilityLabel[group.visibility]}
          </Badge>
          <Button
            variant="secondary"
            size="compact"
            aria-label={bulkActionLabel}
            onClick={() => onSetMeasurementsVisibility(group.measurementIds, !actionIsHide)}
          >
            {actionIsHide ? "Hide" : "Show"}
          </Button>
        </div>
      </header>
      <div
        id={listId}
        className={styles.list}
        role="list"
        aria-label={`${group.label} measurements`}
        hidden={collapsed}
      >
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
