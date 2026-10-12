import { Fragment, useId, type CSSProperties, type ReactNode, type RefCallback } from "react";
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
  onSelectMeasurement: (measurementId: string, additive?: boolean) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  onSetMeasurementsVisibility: (measurementIds: string[], visible: boolean) => void;
  rovingCell?: { measurementId: string; control: "selection" | "visibility" } | null;
  children?: ReactNode;
  rowsContent?: ReactNode;
  headerRef?: RefCallback<HTMLElement>;
  headerKey?: string;
  headerPlaceholderHeight?: number;
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
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7.5 4.17 5.83 5.83 -5.83 5.83" />
    </svg>
  );
}

function GroupVisibilityIcon({ state }: { state: "visible" | "hidden" | "mixed" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        d="M2.08 10s2.71 -4.38 7.92 -4.38S17.92 10 17.92 10 15.21 14.38 10 14.38 2.08 10 2.08 10Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {state === "mixed" ? (
        <path d="M7.92 10h4.17" strokeLinecap="round" />
      ) : (
        <circle cx="10" cy="10" r="2.08" />
      )}
      {state === "hidden" && <path d="m3.33 3.33 13.33 13.33" strokeLinecap="round" />}
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
  children,
  rowsContent,
  headerRef,
  headerKey,
  headerPlaceholderHeight,
  depth = 0,
}: MeasurementGroupProps) {
  const generatedId = useId();
  const listId = `${generatedId}-measurements`;
  const actionIsHide = group.visibility === "visible";
  const actionLabel = actionIsHide ? "Hide" : "Show";
  const visibilityState = visibilityStateLabel[group.visibility];
  const segments = group.segments ?? [
    {
      dimensionLabel: group.dimensionLabel,
      label: group.label,
      archived: group.archived,
      unassigned: group.unassigned,
    },
  ];
  const groupName = segments
    .map((segment) => `${segment.dimensionLabel} · ${segment.label}`)
    .join(", ");
  const bulkActionLabel = `${actionLabel} all measurements in ${groupName}; currently ${visibilityState}`;
  const fullGroupLabel = segments
    .map(
      (segment) =>
        `${segment.dimensionLabel} · ${segment.label}${segment.archived ? " (archived)" : ""}`,
    )
    .join(", ");
  const sharedValue =
    segments.length > 1 &&
    segments.every(
      (segment) =>
        segment.label === segments[0]!.label && segment.archived === segments[0]!.archived,
    );

  function renderValue(segment: (typeof segments)[number], unassigned: boolean) {
    return (
      <span className={`${styles.groupValue} ${unassigned ? styles.unassignedValue : ""}`}>
        {segment.label}
        {segment.archived ? " (archived)" : ""}
      </span>
    );
  }

  /** Assigned levels read "Dimension: Value"; a run of unassigned levels folds into one "No A · B". */
  const titleItems: Array<{ unassigned: boolean; segments: typeof segments }> = [];
  for (const segment of segments) {
    const last = titleItems[titleItems.length - 1];
    if (segment.unassigned && last?.unassigned) last.segments.push(segment);
    else titleItems.push({ unassigned: segment.unassigned, segments: [segment] });
  }

  return (
    <section
      className={styles.group}
      style={{ "--tree-depth": depth } as CSSProperties}
      aria-label={`${groupName} measurement group`}
    >
      {headerPlaceholderHeight !== undefined ? (
        <div aria-hidden="true" style={{ height: headerPlaceholderHeight }} />
      ) : (
        <header
          ref={headerRef}
          data-virtual-key={headerKey}
          className={styles.header}
          data-group-depth={depth}
        >
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
            {(sharedValue && !segments[0]!.unassigned) ||
            (segments.length === 1 && segments[0]!.unassigned) ? (
              <>
                <span className={styles.dimensionName}>
                  {segments.map((segment) => segment.dimensionLabel).join(" · ")}
                </span>
                {renderValue(segments[0]!, segments[0]!.unassigned)}
              </>
            ) : (
              titleItems.map((item, index) => (
                <Fragment key={index}>
                  {index > 0 && (
                    <span className={styles.segmentSeparator} aria-hidden="true">
                      ›
                    </span>
                  )}
                  {item.unassigned ? (
                    <span className={styles.unassignedRun}>
                      No {item.segments.map((segment) => segment.dimensionLabel).join(" · ")}
                    </span>
                  ) : (
                    <span className={styles.titleItem}>
                      <span className={styles.dimensionName}>
                        {item.segments[0]!.dimensionLabel}
                      </span>
                      {renderValue(item.segments[0]!, false)}
                    </span>
                  )}
                </Fragment>
              ))
            )}
          </h3>
          <span className={styles.count} aria-label={`${group.measurementIds.length} measurements`}>
            {group.measurementIds.length}
          </span>
          <IconButton
            icon={<GroupVisibilityIcon state={group.visibility} />}
            className={styles.visibilityControl}
            data-group-visibility={group.visibility}
            aria-label={bulkActionLabel}
            tooltip={`${actionLabel} all`}
            tooltipPosition="left"
            onClick={() => onSetMeasurementsVisibility(group.measurementIds, !actionIsHide)}
          />
        </header>
      )}
      <div
        id={listId}
        className={styles.list}
        role="list"
        aria-label={`${groupName} measurements`}
        hidden={collapsed}
      >
        {children ? (
          <div className={styles.childGroups}>{children}</div>
        ) : (
          (rowsContent ??
          measurements.map((measurement) => (
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
          )))
        )}
      </div>
    </section>
  );
}
