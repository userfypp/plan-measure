import { memo, useMemo, useState } from "react";
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
  return (
    <div className={styles.quantity}>
      <dt>{label}</dt>
      <dd>{quantity.kind === "value" ? format(quantity.value) : "Not calculable"}</dd>
    </div>
  );
}

function Quantities({
  group,
  displayUnit,
  decimalPlaces,
  areaDisplay,
}: {
  group: MeasurementTotalGroup;
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
  areaDisplay: AreaDisplay;
}) {
  return (
    <dl className={styles.quantities}>
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
  const activeDimensionId = dimensionId ?? props.catalog.dimensions[0]?.id ?? null;
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
        <h2 id="project-totals-heading">Project totals</h2>
        {overallGroup && (
          <Quantities
            group={overallGroup}
            displayUnit={props.displayUnit}
            decimalPlaces={props.decimalPlaces}
            areaDisplay={props.areaDisplay}
          />
        )}
        {overall.measurementCount === 0 && (
          <p className={styles.message}>No measurements in this project.</p>
        )}
        {overall.measurementCount > 0 &&
          (!overallGroup ||
            (overallGroup.length.kind === "absent" &&
              overallGroup.perimeter.kind === "absent" &&
              overallGroup.area.kind === "absent")) && (
            <p className={styles.message}>No calculable quantities.</p>
          )}
        {overall.excludedCount > 0 && (
          <p className={styles.notice}>
            {overall.excludedCount} measurement{overall.excludedCount === 1 ? " was" : "s were"}{" "}
            excluded because {overall.excludedCount === 1 ? "it cannot" : "they cannot"} be
            calculated.
          </p>
        )}
      </section>

      <section className={styles.breakdownControls}>
        <label htmlFor="takeoff-breakdown">
          Breakdown
        </label>
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

      {grouped && (
        <section className={styles.breakdownResults} aria-label={`Breakdown by ${breakdown}`}>
          {grouped.groups.map((group) => (
            <section
              key={group.key}
              className={styles.group}
              aria-label={`${group.label}${group.archived ? " (archived)" : ""} totals`}
            >
              <h3>
                {group.label}
                {group.archived ? " (archived)" : ""}
              </h3>
              <p>
                {group.measurementCount} measurement{group.measurementCount === 1 ? "" : "s"}
              </p>
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
