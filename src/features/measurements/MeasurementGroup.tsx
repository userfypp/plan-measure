import { useId, type ReactNode } from "react";
import { IconButton } from "../../components/ui";
import type { MeasurementGroup as MeasurementGroupModel } from "./measurementGrouping";
import { MeasurementRow } from "./MeasurementRow";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementGroup.module.css";

export interface MeasurementGroupProps {
  group: MeasurementGroupModel;
  depth?: number;
  measurements: readonly (MeasurementViewModel & { selected: boolean })[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectMeasurement: (measurementId: string) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  onSetMeasurementsVisibility: (measurementIds: string[], visible: boolean) => void;
  rovingCell?: { measurementId: string; control: "selection" | "visibility" } | null;
  children?: ReactNode;
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

function hasSameMeasurementScope(parentIds: string[], childIds: string[]) {
  if (parentIds.length !== childIds.length) return false;
  const parentIdSet = new Set(parentIds);
  const childIdSet = new Set(childIds);
  return (
    parentIdSet.size === parentIds.length &&
    childIdSet.size === childIds.length &&
    childIds.every((measurementId) => parentIdSet.has(measurementId))
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
  children,
  depth = 0,
}: MeasurementGroupProps) {
  const generatedId = useId();
  const listId = `${generatedId}-measurements`;
  const actionIsHide = group.visibility === "visible";
  const actionLabel = actionIsHide ? "Hide" : "Show";
  const visibilityState = visibilityStateLabel[group.visibility];
  const groupName = `${group.dimensionLabel} · ${group.label}`;
  const bulkActionLabel = `${actionLabel} all measurements in ${groupName}; currently ${visibilityState}`;
  const onlyChild = group.children?.length === 1 ? group.children[0] : undefined;
  const hasSameScopeChild =
    onlyChild !== undefined && hasSameMeasurementScope(group.measurementIds, onlyChild.measurementIds);
  const showAggregateMetadata = !hasSameScopeChild || collapsed;
  const headerClassName = [
    styles.header,
    depth === 0 ? styles.rootHeader : depth === 1 ? styles.childHeader : styles.deepHeader,
    showAggregateMetadata ? "" : styles.headerWithoutMeta,
  ]
    .filter(Boolean)
    .join(" ");
  const fullGroupLabel = `${groupName}${group.archived ? " (archived)" : ""}`;

  return (
    <section className={styles.group} aria-label={`${groupName} measurement group`}>
      <header className={headerClassName} data-group-depth={depth}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={!collapsed}
          aria-controls={listId}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${groupName} group`}
          onClick={onToggleCollapsed}
        >
          <ChevronIcon />
        </button>
        <h3 className={styles.title} aria-label={fullGroupLabel} title={fullGroupLabel}>
          <span className={styles.dimensionName}>{group.dimensionLabel}</span>
          <span className={styles.groupValue}>
            {group.label}
            {group.archived ? " (archived)" : ""}
          </span>
        </h3>
        {showAggregateMetadata && (
          <>
            <span
              className={styles.count}
              aria-label={`${group.measurementIds.length} measurements`}
            >
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
          </>
        )}
      </header>
      <div
        id={listId}
        className={styles.list}
        role="list"
        aria-label={`${groupName} measurements`}
        hidden={collapsed}
      >
        {children
          ? <div className={styles.childGroups}>{children}</div>
          : measurements.map((measurement) => (
              <MeasurementRow
                key={measurement.id}
                viewModel={measurement}
                onSelectMeasurement={onSelectMeasurement}
                onToggleVisibility={onToggleVisibility}
                selectionTabIndex={
                  rovingCell?.measurementId === measurement.id && rovingCell.control === "selection"
                    ? 0
                    : -1
                }
                visibilityTabIndex={
                  rovingCell?.measurementId === measurement.id && rovingCell.control === "visibility"
                    ? 0
                    : -1
                }
              />
            ))}
      </div>
    </section>
  );
}
