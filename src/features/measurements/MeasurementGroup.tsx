import { useId } from "react";
import { IconButton } from "../../components/ui";
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
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  onSetMeasurementsVisibility: (measurementIds: string[], visible: boolean) => void;
  rovingCell?: { measurementId: string; control: "selection" | "visibility" } | null;
}

const visibilityStateLabel = {
  visible: "all visible",
  hidden: "all hidden",
  mixed: "mixed visibility",
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

function GroupVisibilityIcon({ state }: { state: "visible" | "hidden" | "mixed" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M2.5 12s3.25-5.25 9.5-5.25S21.5 12 21.5 12 18.25 17.25 12 17.25 2.5 12 2.5 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {state === "mixed" ? (
        <path d="M9.5 12h5" strokeLinecap="round" />
      ) : (
        <circle cx="12" cy="12" r="2.5" />
      )}
      {state === "hidden" && <path d="m4 4 16 16" strokeLinecap="round" />}
    </svg>
  );
}

export function MeasurementGroup({
  group,
  measurements,
  collapsed,
  onToggleCollapsed,
  onSelectMeasurement,
  onToggleVisibility,
  onSetMeasurementsVisibility,
  rovingCell,
}: MeasurementGroupProps) {
  const generatedId = useId();
  const listId = `${generatedId}-measurements`;
  const actionIsHide = group.visibility === "visible";
  const actionLabel = actionIsHide ? "Hide" : "Show";
  const visibilityState = visibilityStateLabel[group.visibility];
  const bulkActionLabel =
    group.key.endsWith(":unclassified")
      ? `${actionLabel} all unclassified measurements; currently ${visibilityState}`
      : `${actionLabel} all measurements in ${group.label}; currently ${visibilityState}`;

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
        <h3 className={styles.title} title={group.label}>
          {group.label}
          {group.archived ? " (archived)" : ""}
        </h3>
        <span className={styles.count} aria-label={`${group.measurementIds.length} measurements`}>
          {group.measurementIds.length}
        </span>
        <IconButton
          icon={<GroupVisibilityIcon state={group.visibility} />}
          className={styles.visibilityControl}
          data-group-visibility={group.visibility}
          aria-label={bulkActionLabel}
          tooltip={`${visibilityState} · ${actionLabel} all`}
          onClick={() => onSetMeasurementsVisibility(group.measurementIds, !actionIsHide)}
        />
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
            onToggleVisibility={onToggleVisibility}
            selectionTabIndex={
              rovingCell?.measurementId === measurement.id && rovingCell.control === "selection" ? 0 : -1
            }
            visibilityTabIndex={
              rovingCell?.measurementId === measurement.id && rovingCell.control === "visibility" ? 0 : -1
            }
          />
        ))}
      </div>
    </section>
  );
}
