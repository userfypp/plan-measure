import { memo, useId, useMemo, useState } from "react";
import { useNumberFormatKey } from "../../utils/appPreferences";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Disclosure,
  EyeIcon,
  IconButton,
  Select,
} from "../../components/ui";
import type {
  AreaDisplay,
  ClassificationCatalog,
  ClassificationValueRates,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
} from "../../types/domain";
import { formatCost } from "../../utils/currencies";
import { formatAreaValue, formatLinearValue, formatVolumeValue } from "../../utils/format";
import {
  createMeasurementTotals,
  type MeasurementTotalGroup,
  type MeasurementTotalsGrouping,
  type TotalQuantity,
  type TakeoffMeasurementSource,
  type TakeoffExclusionReason,
} from "./measurementTotals";
import { measurementPathSpecs } from "../../utils/geometry";
import { ToolIcon } from "../viewer/ToolIcon";
import styles from "./TakeoffWorkspace.module.css";

type Breakdown = Exclude<MeasurementTotalsGrouping, "overall"> | "none";

export interface TakeoffWorkspaceProps {
  pages: Readonly<Record<number, PageState>>;
  catalog: ClassificationCatalog;
  /** Derivation factors and unit prices per classification value; without them neither is shown. */
  classificationRates?: readonly ClassificationValueRates[];
  /** The project's currency, shown with every cost. */
  currency?: string | null;
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
  areaDisplay: AreaDisplay;
  /** Whether revision clouds count towards the totals (a project setting). */
  measureClouds?: boolean;
  pageLabelOverrides: Readonly<Record<number, string>>;
  sourcePageLabels: readonly string[] | null;
  onOpenMeasurement?: (pageNumber: number, measurementId: string) => void;
  navigationBlocked?: boolean;
}

interface QuantityFormats {
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
  areaDisplay: AreaDisplay;
  currency: string | null;
}

interface QuantityRow {
  label: string;
  quantity: TotalQuantity;
  format: (value: number) => string;
}

/** What was measured, in the order the workspace has always read it. */
function geometryRows(group: MeasurementTotalGroup, formats: QuantityFormats): QuantityRow[] {
  const { displayUnit, decimalPlaces, areaDisplay } = formats;
  const linear = (value: number) => formatLinearValue(value, displayUnit, decimalPlaces);
  return [
    { label: "Length", quantity: group.length, format: linear },
    { label: "Perimeter", quantity: group.perimeter, format: linear },
    {
      label: "Area",
      quantity: group.area,
      format: (value) => formatAreaValue(value, displayUnit, areaDisplay, decimalPlaces),
    },
    { label: "Count", quantity: group.count, format: String },
  ];
}

/** What the classification rates add to it: derived quantities and the cost. */
function computedRows(group: MeasurementTotalGroup, formats: QuantityFormats): QuantityRow[] {
  const { displayUnit, decimalPlaces, areaDisplay, currency } = formats;
  return [
    {
      label: "Derived area",
      quantity: group.derivedArea,
      format: (value) => formatAreaValue(value, displayUnit, areaDisplay, decimalPlaces),
    },
    {
      label: "Derived volume",
      quantity: group.derivedVolume,
      format: (value) => formatVolumeValue(value, displayUnit, decimalPlaces),
    },
    { label: "Cost", quantity: group.cost, format: (value) => formatCost(value, currency) },
  ];
}

const shown = (rows: readonly QuantityRow[]) =>
  rows.filter((row) => row.quantity.kind !== "absent");

/** The first row that has a figure, as the text of a closed row. */
function headline(rows: readonly QuantityRow[]): string | undefined {
  for (const { quantity, format } of rows) {
    if (quantity.kind === "value") return format(quantity.value);
  }
  return undefined;
}

function Quantity({ row }: { row: QuantityRow }) {
  const { label, quantity, format } = row;
  if (quantity.kind === "absent") return null;
  const value = quantity.kind === "value" ? format(quantity.value) : "Not calculable";
  return (
    <div className={styles.quantity}>
      <dt>{label}</dt>
      <dd data-unavailable={quantity.kind === "unavailable" || undefined}>{value}</dd>
    </div>
  );
}

function Quantities({
  rows,
  summary = false,
}: {
  rows: readonly QuantityRow[];
  summary?: boolean;
}) {
  const visible = shown(rows);
  if (visible.length === 0) return null;
  return (
    <dl className={summary ? styles.summaryQuantities : styles.quantities}>
      {visible.map((row) => (
        <Quantity key={row.label} row={row} />
      ))}
    </dl>
  );
}

export const TakeoffWorkspace = memo(function TakeoffWorkspace(props: TakeoffWorkspaceProps) {
  const currency = props.currency ?? null;
  const formats: QuantityFormats = {
    displayUnit: props.displayUnit,
    decimalPlaces: props.decimalPlaces,
    areaDisplay: props.areaDisplay,
    currency,
  };
  useNumberFormatKey(); // re-render when separators change
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
        measureClouds: props.measureClouds,
        rates: props.classificationRates,
      }),
    [
      props.catalog,
      props.classificationRates,
      props.measureClouds,
      props.pageLabelOverrides,
      props.pages,
      props.sourcePageLabels,
    ],
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
            measureClouds: props.measureClouds,
            rates: props.classificationRates,
          }),
    [
      activeDimensionId,
      breakdown,
      props.catalog,
      props.classificationRates,
      props.measureClouds,
      props.pageLabelOverrides,
      props.pages,
      props.sourcePageLabels,
    ],
  );
  const overallGroup = overall.groups[0];
  const ratesAcrossDimensions = useMemo(() => {
    const ratedValueIds = new Set((props.classificationRates ?? []).map((entry) => entry.valueId));
    return (
      props.catalog.dimensions.filter((dimension) =>
        dimension.values.some((value) => ratedValueIds.has(value.id)),
      ).length > 1
    );
  }, [props.catalog, props.classificationRates]);
  const sourceList = (key: string, sources: readonly TakeoffMeasurementSource[]) =>
    expandedSources === key && sources.length > 0 ? (
      <>
        <SourceMeasurements
          key={`${breakdown}:${activeDimensionId}:${key}`}
          id={`${sourceListId}-${key}`}
          sources={sources}
          onOpen={props.onOpenMeasurement}
          disabled={props.navigationBlocked}
        />
        {props.navigationBlocked && (
          <p className={styles.bodyMessage}>
            Finish or cancel the current edit to open a measurement.
          </p>
        )}
      </>
    ) : null;
  const projectGeometry = overallGroup ? geometryRows(overallGroup, formats) : [];
  const projectComputed = overallGroup ? computedRows(overallGroup, formats) : [];
  const projectComputedShown = shown(projectComputed);
  // The cost speaks for the computed figures; without one the derived area does, then the volume.
  const [derivedArea, derivedVolume, cost] = projectComputed;
  const projectComputedHeadline = headline(
    [cost, derivedArea, derivedVolume].filter((row): row is QuantityRow => row !== undefined),
  );

  return (
    <section className={styles.workspace} aria-label="Takeoff workspace">
      <section className={styles.block} aria-label="Project totals">
        <Disclosure
          title="Project totals"
          subtitle={overall.measurementCount > 0 ? "All pages · Includes hidden" : undefined}
          defaultOpen
          flush
        >
          <Quantities rows={projectGeometry} summary />
          {overall.measurementCount === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyMark} aria-hidden="true">
                Σ
              </span>
              <p className={styles.emptyTitle}>No measurements in this project.</p>
              <p className={styles.message}>Draw a measurement to start your takeoff.</p>
            </div>
          )}
          {overall.measurementCount > 0 && shown(projectGeometry).length === 0 && (
            <p className={styles.bodyMessage}>No calculable quantities.</p>
          )}
          {overall.measurementCount > 0 && (
            <SourceToggle
              count={overall.measurementCount}
              label="Project totals"
              expanded={expandedSources === "overall"}
              controls={`${sourceListId}-overall`}
              onClick={() => toggleSources("overall")}
            />
          )}
          {sourceList("overall", overall.sourcesByGroup.get("overall") ?? [])}
        </Disclosure>
      </section>

      {overall.excludedCount > 0 && (
        <section className={styles.block} aria-label="Excluded measurements">
          <div className={styles.notice}>
            <p role="status">
              {overall.excludedCount} measurement{overall.excludedCount === 1 ? " was" : "s were"}{" "}
              excluded because {overall.excludedCount === 1 ? "it cannot" : "they cannot"} be
              calculated.
            </p>
            <IconButton
              icon={<EyeIcon />}
              aria-label="Inspect excluded measurements"
              tooltip="Inspect"
              aria-expanded={expandedSources === "excluded"}
              aria-controls={`${sourceListId}-excluded`}
              onClick={() => toggleSources("excluded")}
            />
          </div>
          {sourceList("excluded", overall.excludedMeasurements)}
        </section>
      )}

      {projectComputedShown.length > 0 && (
        <section className={styles.block} aria-label="Derived and cost">
          <Disclosure
            title="Derived & cost"
            subtitle={projectComputedShown.map((row) => row.label).join(" · ")}
            summary={projectComputedHeadline}
            flush
          >
            <Quantities rows={projectComputed} summary />
            {ratesAcrossDimensions && (
              <p className={styles.bodyMessage}>
                Derived quantities and costs from several classification dimensions are added
                together.
              </p>
            )}
          </Disclosure>
        </section>
      )}

      <section className={styles.breakdownControls} aria-label="Breakdown controls">
        <span className={styles.breakdownLabel}>Breakdown</span>
        <Select<Breakdown>
          id="takeoff-breakdown"
          label="Breakdown"
          triggerProps={{ "data-viewer-shortcuts": "enabled" }}
          value={breakdown}
          options={[
            { value: "none", label: "None" },
            { value: "page", label: "Page" },
            { value: "type", label: "Type" },
            { value: "classification", label: "Classification" },
          ]}
          onChange={(nextBreakdown) => {
            setBreakdown(nextBreakdown);
            setExpandedSources(null);
          }}
        />
        {breakdown === "classification" && (
          <div className={styles.dimension}>
            <span>Dimension</span>
            <Select
              label="Dimension"
              triggerProps={{ "data-viewer-shortcuts": "enabled" }}
              value={activeDimensionId ?? ""}
              options={props.catalog.dimensions.map((dimension) => ({
                value: dimension.id,
                label: `${dimension.name}${dimension.archived ? " (archived)" : ""}`,
              }))}
              onChange={(nextDimensionId) => {
                setDimensionId(nextDimensionId || null);
                setExpandedSources(null);
              }}
            />
          </div>
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
          {grouped.groups.map((group) => {
            const geometry = geometryRows(group, formats);
            return (
              <section
                key={`${breakdown}:${activeDimensionId}:${group.key}`}
                className={styles.block}
                aria-label={`${group.label}${group.archived ? " (archived)" : ""} totals`}
              >
                <Disclosure
                  title={group.label}
                  subtitle={group.archived ? "Archived" : undefined}
                  summary={headline(geometry.filter((row) => row.label !== "Perimeter"))}
                  flush
                >
                  <Quantities rows={geometry} />
                  <Quantities rows={computedRows(group, formats)} />
                  {shown(geometry).length === 0 && (
                    <p className={styles.bodyMessage}>No calculable quantities.</p>
                  )}
                  <SourceToggle
                    count={group.measurementCount}
                    label={group.label}
                    expanded={expandedSources === group.key}
                    controls={`${sourceListId}-${group.key}`}
                    onClick={() => toggleSources(group.key)}
                  />
                  {sourceList(group.key, grouped.sourcesByGroup.get(group.key) ?? [])}
                </Disclosure>
              </section>
            );
          })}
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
    <div className={styles.sourceRow}>
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
        <ChevronDownIcon className={styles.chevron} />
      </button>
    </div>
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
  const pageSize = 50;
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(sources.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  if (currentPage !== page) setPage(currentPage);
  const start = currentPage * pageSize;
  return (
    <>
      <ul key={currentPage} id={id} className={styles.sourceList} aria-label="Source measurements">
        {sources
          .slice(start, start + pageSize)
          .map(({ measurement, pageNumber, pageLabel, exclusionReason }) => (
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
                    {measurementPathSpecs[measurement.type].label} · Page {pageNumber}
                    {pageLabel !== `Page ${pageNumber}` ? ` · ${pageLabel}` : ""}
                    {!measurement.visible ? " · Hidden" : ""}
                  </span>
                  {exclusionReason && (
                    <span className={styles.sourceReason}>
                      {exclusionMessages[exclusionReason]}
                    </span>
                  )}
                </span>
                <span className={styles.sourceArrow} aria-hidden="true">
                  <ChevronRightIcon />
                </span>
              </button>
            </li>
          ))}
      </ul>
      {sources.length > pageSize && (
        <nav className={styles.sourcePagination} aria-label="Source measurement pages">
          <IconButton
            icon={<ChevronLeftIcon />}
            aria-label="Previous source measurements"
            tooltip="Previous"
            aria-controls={id}
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          />
          <span role="status">
            {start + 1}–{Math.min(start + pageSize, sources.length)} of {sources.length}
          </span>
          <IconButton
            icon={<ChevronRightIcon />}
            aria-label="Next source measurements"
            tooltip="Next"
            aria-controls={id}
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
          />
        </nav>
      )}
    </>
  );
}
