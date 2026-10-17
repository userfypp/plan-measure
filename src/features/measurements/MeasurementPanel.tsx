import { memo, useMemo, useState } from "react";
import { useNumberFormatKey } from "../../utils/appPreferences";
import { useSessionState } from "../../app/sessionState";
import { Button, Popover, Select } from "../../components/ui";
import type { ClassificationCatalog, PageState } from "../../types/domain";
import { MEASUREMENT_TYPES, measurementPathSpecs } from "../../utils/geometry";
import { effectivePageLabel } from "../../utils/pageLabels";
import { MeasurementCollection } from "./MeasurementCollection";
import { MeasurementsHeader } from "./MeasurementsHeader";
import { createMeasurementGroups } from "./measurementGrouping";
import {
  createMeasurementViewModel,
  getMeasurementEmptyMessage,
  type MeasurementValueLabelCache,
} from "./measurementViewModels";
import styles from "./MeasurementPanel.module.css";

const emptyClassificationCatalog: ClassificationCatalog = { dimensions: [] };

function FilterIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.33 4.58h13.34l-5.21 6.25v4.17l-2.92 1.67v-5.84Z" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.33 5h13.34M9.17 10h7.5M9.17 15h7.5M5.83 5v10h1.67M5.83 10h1.67" />
    </svg>
  );
}

export interface MeasurementDeleteRequest {
  pageNumber: number;
  measurementId: string;
  measurementName: string;
}

export interface MeasurementPanelProps {
  page: PageState;
  pages: Readonly<Record<number, PageState>>;
  pageLabelOverrides: Readonly<Record<number, string>>;
  sourcePageLabels: readonly string[] | null;
  selectedMeasurementId: string | null;
  selectedMeasurementIds?: readonly string[];
  onSelectMeasurement: (pageNumber: number, measurementId: string, additive?: boolean) => void;
  onSetMeasurementVisibility: (pageNumber: number, measurementId: string, visible: boolean) => void;
  onSetMeasurementsVisibility: (
    pageNumber: number,
    measurementIds: string[],
    visible: boolean,
  ) => void;
}

export const MeasurementPanel = memo(function MeasurementPanel({
  page,
  pages,
  pageLabelOverrides,
  sourcePageLabels,
  selectedMeasurementId,
  selectedMeasurementIds,
  onSelectMeasurement,
  onSetMeasurementVisibility,
  onSetMeasurementsVisibility,
}: MeasurementPanelProps) {
  const numberFormatKey = useNumberFormatKey();
  const { session } = useSessionState();
  const displayUnit = session?.settings.displayUnit ?? "m";
  const measurementDecimalPlaces = session?.settings.measurementDecimalPlaces ?? 2;
  const areaDisplay = session?.settings.areaDisplay ?? "auto";
  const measureClouds = session?.settings.measureClouds ?? false;
  const [selectedGroupByDimensionIds, setGroupByDimensionIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [selectedClassificationFilter, setClassificationFilter] = useState("");
  const [openControls, setOpenControls] = useState<"filters" | "grouping" | null>(null);
  const catalog = session?.classificationCatalog ?? emptyClassificationCatalog;
  const groupByDimensionIds = useMemo(
    () => selectedGroupByDimensionIds.filter((id) =>
      catalog.dimensions.some((dimension) => dimension.id === id),
    ),
    [catalog, selectedGroupByDimensionIds],
  );
  const classificationFilter = catalog.dimensions.some((dimension) =>
    dimension.values.some((value) => value.id === selectedClassificationFilter),
  )
    ? selectedClassificationFilter
    : "";
  const [valueLabels] = useState<MeasurementValueLabelCache>(() => new WeakMap());
  const sourceMeasurementsById = useMemo(
    () => new Map(Object.values(pages).flatMap((candidatePage) =>
      candidatePage.measurements.map((measurement) => [measurement.id, measurement] as const),
    )),
    [pages],
  );
  const allMeasurements = useMemo(
    () => Object.values(pages).flatMap((candidatePage) =>
      candidatePage.measurements.map((measurement) => ({
        ...createMeasurementViewModel(
          candidatePage,
          measurement,
          displayUnit,
          selectedMeasurementIds ? selectedMeasurementIds.includes(measurement.id) : measurement.id === selectedMeasurementId,
          measurementDecimalPlaces,
          areaDisplay,
          valueLabels,
          measureClouds,
        ),
        pageNumber: candidatePage.pageNumber,
        pageLabel:
          effectivePageLabel(candidatePage.pageNumber, pageLabelOverrides, sourcePageLabels) ||
          `Page ${candidatePage.pageNumber}`,
        classificationValueIds: measurement.classificationValueIds,
      })),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- separators are read by the formatters
    [
      areaDisplay,
      displayUnit,
      measureClouds,
      measurementDecimalPlaces,
      numberFormatKey,
      pageLabelOverrides,
      pages,
      selectedMeasurementId,
      selectedMeasurementIds,
      sourcePageLabels,
      valueLabels,
    ],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const measurements = useMemo(
    () => allMeasurements.filter((measurement) =>
      (!normalizedQuery || measurement.name.toLocaleLowerCase().includes(normalizedQuery)) &&
      (!pageFilter || String(measurement.pageNumber) === pageFilter) &&
      (!typeFilter || measurement.type === typeFilter) &&
      (!visibilityFilter || String(measurement.visible) === visibilityFilter) &&
      (!classificationFilter || measurement.classificationValueIds.includes(classificationFilter)),
    ),
    [allMeasurements, classificationFilter, normalizedQuery, pageFilter, typeFilter, visibilityFilter],
  );
  const measurementsById = useMemo(
    () => new Map(measurements.map((measurement) => [measurement.id, measurement])),
    [measurements],
  );
  const hasGroupBy = catalog.dimensions.length > 0;
  const activeFilterCount =
    Number(Boolean(pageFilter)) +
    Number(Boolean(typeFilter)) +
    Number(Boolean(visibilityFilter)) +
    Number(Boolean(classificationFilter));
  const groupByNames = groupByDimensionIds.map(
    (dimensionId) =>
      catalog.dimensions.find((dimension) => dimension.id === dimensionId)?.name ??
      "Unknown classification",
  );
  const groups = useMemo(() => groupByDimensionIds.length
    ? createMeasurementGroups(
        measurements.map((measurement) => ({
          ...sourceMeasurementsById.get(measurement.id)!,
          pageNumber: measurement.pageNumber,
        })),
        catalog,
        groupByDimensionIds,
      )
    : undefined,
    [catalog, groupByDimensionIds, measurements, sourceMeasurementsById],
  );

  return (
    <aside
      className={styles.panel}
      aria-label="Measurements workspace"
    >
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span className={styles.visuallyHidden}>Search measurements by name</span>
          <svg
            className={styles.searchIcon}
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="9" cy="9" r="5.67" />
            <path d="m13.33 13.33 3.75 3.75" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search measurements"
          />
        </label>
        <Popover
          open={openControls === "filters"}
          onOpenChange={(open) => setOpenControls(open ? "filters" : null)}
          triggerProps={{
            className: [styles.toolbarButton, activeFilterCount > 0 ? styles.active : ""]
              .filter(Boolean)
              .join(" "),
            "aria-label": activeFilterCount
              ? `Filters, ${activeFilterCount} active`
              : "Filters",
          }}
          tooltip={activeFilterCount ? `Filters · ${activeFilterCount} active` : "Filters"}
          tooltipPosition="bottom"
          trigger={
            <>
              <FilterIcon />
              {activeFilterCount > 0 && (
                <span className={styles.activeCount} aria-hidden="true">
                  {activeFilterCount}
                </span>
              )}
            </>
          }
          role="dialog"
          aria-label="Measurement filters"
          initialFocus="first"
          dismissOnFocusLeave
          placement="bottom-end"
          className={styles.controlsPopover}
        >
          <div className={styles.fields}>
            {(
              [
                {
                  label: "Page",
                  value: pageFilter,
                  onChange: setPageFilter,
                  options: [
                    { value: "", label: "All pages" },
                    ...Object.values(pages)
                      .sort((a, b) => a.pageNumber - b.pageNumber)
                      .map((candidatePage) => ({
                        value: String(candidatePage.pageNumber),
                        label:
                          effectivePageLabel(
                            candidatePage.pageNumber,
                            pageLabelOverrides,
                            sourcePageLabels,
                          ) || `Page ${candidatePage.pageNumber}`,
                      })),
                  ],
                },
                {
                  label: "Type",
                  value: typeFilter,
                  onChange: setTypeFilter,
                  options: [
                    { value: "", label: "All types" },
                    ...MEASUREMENT_TYPES.map((type) => ({
                      value: type as string,
                      label: measurementPathSpecs[type].label,
                    })),
                  ],
                },
                {
                  label: "Visibility",
                  value: visibilityFilter,
                  onChange: setVisibilityFilter,
                  options: [
                    { value: "", label: "All" },
                    { value: "true", label: "Visible" },
                    { value: "false", label: "Hidden" },
                  ],
                },
                {
                  label: "Classification",
                  value: classificationFilter,
                  onChange: setClassificationFilter,
                  options: [
                    { value: "", label: "All classifications" },
                    ...catalog.dimensions.flatMap((dimension) =>
                      dimension.values.map((value) => ({
                        value: value.id,
                        label: `${dimension.name}: ${value.name}`,
                      })),
                    ),
                  ],
                },
              ] as const
            ).map((field) => (
              <label className={styles.field} key={field.label}>
                <span>{field.label}</span>
                <Select
                  label={field.label}
                  value={field.value}
                  options={field.options}
                  onChange={field.onChange}
                />
              </label>
            ))}
          </div>
          {activeFilterCount > 0 && (
            <footer className={styles.popoverFooter}>
              <Button
                variant="ghost"
                size="compact"
                onClick={() => {
                  setPageFilter("");
                  setTypeFilter("");
                  setVisibilityFilter("");
                  setClassificationFilter("");
                }}
              >
                Clear filters
              </Button>
            </footer>
          )}
        </Popover>
        {hasGroupBy && (
          <Popover
            open={openControls === "grouping"}
            onOpenChange={(open) => setOpenControls(open ? "grouping" : null)}
            triggerProps={{
              className: [styles.toolbarButton, groupByNames.length > 0 ? styles.active : ""]
                .filter(Boolean)
                .join(" "),
              "aria-label":
                groupByNames.length > 0
                  ? `Group by ${groupByNames.join(", then ")}`
                  : "Group measurements",
            }}
            tooltip={
              groupByNames.length > 0 ? `Grouped by ${groupByNames.join(" › ")}` : "Group"
            }
            tooltipPosition="bottom"
            trigger={<GroupIcon />}
            role="dialog"
            aria-label="Measurement grouping"
            initialFocus="first"
            dismissOnFocusLeave
            placement="bottom-end"
            className={styles.controlsPopover}
          >
            <MeasurementsHeader
              dimensions={catalog.dimensions}
              groupByDimensionIds={groupByDimensionIds}
              onGroupByDimensionsChange={setGroupByDimensionIds}
            />
          </Popover>
        )}
      </div>
      <MeasurementCollection
        key={groupByDimensionIds.join("/") || "flat"}
        measurements={measurements}
        emptyMessage={
          allMeasurements.length === 0
            ? getMeasurementEmptyMessage(page)
            : "No measurements match these filters."
        }
        onSelectMeasurement={(measurementId, additive) => {
          const result = measurementsById.get(measurementId);
          if (result) onSelectMeasurement(result.pageNumber, measurementId, additive);
        }}
        onToggleVisibility={(measurementId, visible) => {
          const result = measurementsById.get(measurementId);
          if (result) onSetMeasurementVisibility(result.pageNumber, measurementId, visible);
        }}
        groups={groups}
        groupByDimensionId={groupByDimensionIds[0] ?? null}
        onSetMeasurementsVisibility={(measurementIds, visible) =>
          Object.entries(
            measurementIds.reduce<Record<number, string[]>>((byPage, measurementId) => {
              const pageNumber = measurementsById.get(measurementId)?.pageNumber;
              if (pageNumber !== undefined) (byPage[pageNumber] ??= []).push(measurementId);
              return byPage;
            }, {}),
          ).forEach(([pageNumber, ids]) =>
            onSetMeasurementsVisibility(Number(pageNumber), ids, visible),
          )
        }
      />
    </aside>
  );
});
