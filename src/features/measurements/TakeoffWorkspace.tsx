import { memo, useMemo, useState } from "react";
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
} from "./measurementTotals";
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

  return (
    <section className={styles.workspace} aria-label="Takeoff workspace">
      <section className={styles.projectTotals} aria-labelledby="project-totals-heading">
        <div className={styles.sectionHeading}>
          <h2 id="project-totals-heading">Project totals</h2>
          <span className={styles.scope}>All pages</span>
        </div>
        {overall.measurementCount > 0 && (
          <p className={styles.summaryMeta}>
            <span>
              <strong>{overall.measurementCount}</strong> measurement
              {overall.measurementCount === 1 ? "" : "s"}
            </span>
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
          <p className={styles.notice} role="status">
            {overall.excludedCount} measurement{overall.excludedCount === 1 ? " was" : "s were"}{" "}
            excluded because {overall.excludedCount === 1 ? "it cannot" : "they cannot"} be
            calculated.
          </p>
        )}
      </section>

      <section className={styles.breakdownControls} aria-label="Breakdown controls">
        <label htmlFor="takeoff-breakdown">Breakdown</label>
        <select
          id="takeoff-breakdown"
          value={breakdown}
          data-viewer-shortcuts="enabled"
          onChange={(event) => setBreakdown(event.target.value as Breakdown)}
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
              onChange={(event) => setDimensionId(event.target.value || null)}
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
                <p className={styles.groupMeta}>
                  {group.measurementCount} measurement{group.measurementCount === 1 ? "" : "s"}
                </p>
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
