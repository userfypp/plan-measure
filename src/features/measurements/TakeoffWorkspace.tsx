import { memo, useId, useMemo, useState } from "react";
import { Badge } from "../../components/ui";
import type {
  AreaDisplay,
  ClassificationCatalog,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
} from "../../types/domain";
import { formatAreaValue, formatLinearValue } from "../../utils/format";
import {
  createMeasurementTotals,
  type MeasurementTotalGroup,
  type MeasurementTotalsGrouping,
  type TotalQuantity,
  type TakeoffMeasurementSource,
  type TakeoffExclusionReason,
} from "./measurementTotals";
import { ToolIcon } from "../viewer/ToolIcon";
import styles from "./TakeoffWorkspace.module.css";

type Breakdown = Exclude<MeasurementTotalsGrouping, "overall"> | "none";

export interface TakeoffWorkspaceProps {
  pages: Readonly<Record<number, PageState>>;
  catalog: ClassificationCatalog;
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
  areaDisplay: AreaDisplay;
  pageLabelOverrides: Readonly<Record<number, string>>;
  sourcePageLabels: readonly string[] | null;
  onOpenMeasurement?: (pageNumber: number, measurementId: string) => void;
  navigationBlocked?: boolean;
}

function Quantity({
  label,
  quantity,
  format,
}: {
  label: string;
  quantity: TotalQuantity;
  format: (value: number) => string;
}) {
  if (quantity.kind === "absent") return null;
  const value = quantity.kind === "value" ? format(quantity.value) : "Not calculable";
  return (
    <div className={styles.quantity} data-quantity={label.toLowerCase()}>
      <dt>{label}</dt>
      <dd
        data-unavailable={quantity.kind === "unavailable" || undefined}
        data-wide={value.length > 10 || undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function Quantities({
  group,
  displayUnit,
  decimalPlaces,
  areaDisplay,
  summary = false,
}: {
  group: MeasurementTotalGroup;
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
  areaDisplay: AreaDisplay;
  summary?: boolean;
}) {
  return (
    <dl className={summary ? styles.summaryQuantities : styles.quantities}>
      <Quantity
        label="Length"
        quantity={group.length}
        format={(value) => formatLinearValue(value, displayUnit, decimalPlaces)}
      />
      <Quantity
        label="Perimeter"
        quantity={group.perimeter}
        format={(value) => formatLinearValue(value, displayUnit, decimalPlaces)}
      />
      <Quantity
        label="Area"
        quantity={group.area}
        format={(value) => formatAreaValue(value, displayUnit, areaDisplay, decimalPlaces)}
      />
    </dl>
  );
}

export const TakeoffWorkspace = memo(function TakeoffWorkspace(props: TakeoffWorkspaceProps) {
  const sourceListId = useId();
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const toggleSources = (key: string) =>
    setExpandedSources((current) => (current === key ? null : key));
  const [breakdown, setBreakdown] = useState<Breakdown>("none");
  const [dimensionId, setDimensionId] = useState<string | null>(null);
  const overall = useMemo(
    () =>
      createMeasurementTotals({
        pages: props.pages,
        catalog: props.catalog,
        grouping: "overall",
        classificationDimensionId: null,
        pageLabelOverrides: props.pageLabelOverrides,
        sourcePageLabels: props.sourcePageLabels,
      }),
    [props.catalog, props.pageLabelOverrides, props.pages, props.sourcePageLabels],
  );
  const activeDimensionId = props.catalog.dimensions.some(
    (dimension) => dimension.id === dimensionId,
  )
    ? dimensionId
    : (props.catalog.dimensions[0]?.id ?? null);
  const grouped = useMemo(
    () =>
      breakdown === "none"
        ? null
        : createMeasurementTotals({
            pages: props.pages,
            catalog: props.catalog,
            grouping: breakdown,
            classificationDimensionId: breakdown === "classification" ? activeDimensionId : null,
            pageLabelOverrides: props.pageLabelOverrides,
            sourcePageLabels: props.sourcePageLabels,
          }),
    [
      activeDimensionId,
      breakdown,
      props.catalog,
      props.pageLabelOverrides,
      props.pages,
      props.sourcePageLabels,
    ],
  );
  const overallGroup = overall.groups[0];
  const sourceList = (key: string, sources: readonly TakeoffMeasurementSource[]) =>
    expandedSources === key && sources.length > 0 ? (
      <SourceMeasurements
        id={`${sourceListId}-${key}`}
        sources={sources}
        onOpen={props.onOpenMeasurement}
        disabled={props.navigationBlocked}
      />
    ) : null;

  return (
    <section className={styles.workspace} aria-label="Takeoff workspace">
      <section className={styles.projectTotals} aria-labelledby="project-totals-heading">
        <div className={styles.sectionHeading}>
          <h2 id="project-totals-heading">Project totals</h2>
          <span className={styles.scope}>All pages</span>
        </div>
        {overall.measurementCount > 0 && (
          <p className={styles.summaryMeta}>
            <SourceToggle
              count={overall.measurementCount}
              label="Project totals"
              expanded={expandedSources === "overall"}
              controls={`${sourceListId}-overall`}
              onClick={() => toggleSources("overall")}
            />
            <span className={styles.metaSeparator} aria-hidden="true">
              ·
            </span>
            Includes hidden
          </p>
        )}
        {overallGroup && (
          <Quantities
            group={overallGroup}
            displayUnit={props.displayUnit}
            decimalPlaces={props.decimalPlaces}
            areaDisplay={props.areaDisplay}
            summary
          />
        )}
        {sourceList("overall", overall.sourcesByGroup.get("overall") ?? [])}
        {overall.measurementCount === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyMark} aria-hidden="true">
              Σ
            </span>
            <p className={styles.emptyTitle}>No measurements in this project.</p>
            <p className={styles.message}>Draw a measurement to start your takeoff.</p>
          </div>
        )}
        {overall.measurementCount > 0 &&
          (!overallGroup ||
            (overallGroup.length.kind === "absent" &&
              overallGroup.perimeter.kind === "absent" &&
              overallGroup.area.kind === "absent")) && (
            <p className={styles.message}>No calculable quantities.</p>
          )}
        {overall.excludedCount > 0 && (
          <div className={styles.notice}>
            <p role="status">
              {overall.excludedCount} measurement{overall.excludedCount === 1 ? " was" : "s were"}{" "}
              excluded because {overall.excludedCount === 1 ? "it cannot" : "they cannot"} be
              calculated.
            </p>
            <button
              type="button"
              className={styles.inspectButton}
              aria-label="Inspect excluded measurements"
              aria-expanded={expandedSources === "excluded"}
              aria-controls={`${sourceListId}-excluded`}
              onClick={() => toggleSources("excluded")}
            >
              Inspect
            </button>
          </div>
        )}
        {sourceList("excluded", overall.excludedMeasurements)}
        {props.navigationBlocked && expandedSources !== null && (
          <p className={styles.message}>Finish or cancel the current edit to open a measurement.</p>
        )}
      </section>

      <section className={styles.breakdownControls} aria-label="Breakdown controls">
        <label htmlFor="takeoff-breakdown">Breakdown</label>
        <select
          id="takeoff-breakdown"
          value={breakdown}
          data-viewer-shortcuts="enabled"
          onChange={(event) => {
            setBreakdown(event.target.value as Breakdown);
            setExpandedSources(null);
          }}
        >
          <option value="none">None</option>
          <option value="page">Page</option>
          <option value="type">Type</option>
          <option value="classification">Classification</option>
        </select>
        {breakdown === "classification" && (
          <label className={styles.dimension}>
            <span>Dimension</span>
            <select
              aria-label="Dimension"
              value={activeDimensionId ?? ""}
              data-viewer-shortcuts="enabled"
              onChange={(event) => {
                setDimensionId(event.target.value || null);
                setExpandedSources(null);
              }}
            >
              {props.catalog.dimensions.map((dimension) => (
                <option key={dimension.id} value={dimension.id}>
                  {dimension.name}
                  {dimension.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {breakdown === "none" && overall.measurementCount > 0 && (
        <p className={styles.breakdownHint}>Choose a breakdown to compare totals.</p>
      )}

      {grouped && (
        <section className={styles.breakdownResults} aria-label={`Breakdown by ${breakdown}`}>
          {grouped.groups.length > 0 && (
            <p className={styles.resultsMeta}>
              {grouped.groups.length} group{grouped.groups.length === 1 ? "" : "s"}
            </p>
          )}
          {grouped.groups.map((group) => (
            <section
              key={group.key}
              className={styles.group}
              aria-label={`${group.label}${group.archived ? " (archived)" : ""} totals`}
            >
              <div className={styles.groupHeading}>
                <h3>{group.label}</h3>
                <SourceToggle
                  count={group.measurementCount}
                  label={group.label}
                  expanded={expandedSources === group.key}
                  controls={`${sourceListId}-${group.key}`}
                  onClick={() => toggleSources(group.key)}
                />
                {group.archived && <Badge className={styles.archivedBadge}>Archived</Badge>}
              </div>
              <Quantities
                group={group}
                displayUnit={props.displayUnit}
                decimalPlaces={props.decimalPlaces}
                areaDisplay={props.areaDisplay}
              />
              {group.length.kind === "absent" &&
                group.perimeter.kind === "absent" &&
                group.area.kind === "absent" && (
                  <p className={styles.message}>No calculable quantities.</p>
                )}
              {sourceList(group.key, grouped.sourcesByGroup.get(group.key) ?? [])}
            </section>
          ))}
          {breakdown === "classification" && !activeDimensionId && (
            <p className={styles.message}>No classification dimensions.</p>
          )}
        </section>
      )}
    </section>
  );
});

function SourceToggle({
  count,
  label,
  expanded,
  controls,
  onClick,
}: {
  count: number;
  label: string;
  expanded: boolean;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.sourceToggle}
      aria-label={`${expanded ? "Hide" : "Show"} measurements in ${label}`}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <span>
        {count} measurement{count === 1 ? "" : "s"}
      </span>
      <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="m6 8 4 4 4-4" />
      </svg>
    </button>
  );
}

const exclusionMessages: Record<TakeoffExclusionReason, string> = {
  "missing-scale": "Assigned scale is missing.",
  "invalid-geometry": "Measurement points are invalid.",
  "invalid-scale": "Assigned scale is invalid.",
  "nonfinite-result": "Result exceeds the supported numeric range.",
};

function SourceMeasurements({
  id,
  sources,
  onOpen,
  disabled,
}: {
  id: string;
  sources: readonly TakeoffMeasurementSource[];
  onOpen?: (pageNumber: number, measurementId: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul id={id} className={styles.sourceList} aria-label="Source measurements">
      {sources.map(({ measurement, pageNumber, pageLabel, exclusionReason }) => (
        <li key={`${pageNumber}:${measurement.id}`}>
          <button
            type="button"
            className={styles.sourceMeasurement}
            data-measurement-id={measurement.id}
            data-measurement-control="selection"
            disabled={disabled || !onOpen}
            aria-label={`Open ${measurement.name} on page ${pageNumber}`}
            onClick={() => onOpen?.(pageNumber, measurement.id)}
          >
            <span className={styles.sourceGlyph} aria-hidden="true">
              <ToolIcon name={measurement.type} />
            </span>
            <span className={styles.sourceText}>
              <span className={styles.sourceName}>{measurement.name}</span>
              <span className={styles.sourceMeta}>
                {measurement.type === "polyline"
                  ? "Polyline"
                  : measurement.type === "polygon"
                    ? "Polygon"
                    : "Line"}{" "}
                · Page {pageNumber}
                {pageLabel !== `Page ${pageNumber}` ? ` · ${pageLabel}` : ""}
                {!measurement.visible ? " · Hidden" : ""}
              </span>
              {exclusionReason && (
                <span className={styles.sourceReason}>{exclusionMessages[exclusionReason]}</span>
              )}
            </span>
            <span className={styles.sourceArrow} aria-hidden="true">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
