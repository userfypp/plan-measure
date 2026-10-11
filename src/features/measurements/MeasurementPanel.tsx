import { memo, useMemo, useState } from "react";
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
} from "./measurementViewModels";
import styles from "./MeasurementPanel.module.css";

const emptyClassificationCatalog: ClassificationCatalog = { dimensions: [] };

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
  const { session } = useSessionState();
  const displayUnit = session?.settings.displayUnit ?? "m";
  const measurementDecimalPlaces = session?.settings.measurementDecimalPlaces ?? 2;
  const areaDisplay = session?.settings.areaDisplay ?? "auto";
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
        ),
        pageNumber: candidatePage.pageNumber,
        pageLabel:
          effectivePageLabel(candidatePage.pageNumber, pageLabelOverrides, sourcePageLabels) ||
          `Page ${candidatePage.pageNumber}`,
        classificationValueIds: measurement.classificationValueIds,
      })),
    ),
    [areaDisplay, displayUnit, measurementDecimalPlaces, pageLabelOverrides, pages, selectedMeasurementId, selectedMeasurementIds, sourcePageLabels],
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
            className: styles.toolbarButton,
            "aria-label": activeFilterCount
              ? `Filters, ${activeFilterCount} active`
              : "Filters",
          }}
          trigger={
            <>
              <span>Filters</span>
              {activeFilterCount > 0 && <span className={styles.activeCount}>· {activeFilterCount}</span>}
            </>
          }
          role="dialog"
          aria-label="Measurement filters"
          initialFocus="first"
          dismissOnFocusLeave
          placement="bottom-end"
          className={[styles.controlsPopover, styles.filtersPopover].join(" ")}
        >
          <div className={styles.filters}>
            <div className={styles.filterRow}>
              <label>
                <span>Page</span>
                <Select
                  label="Page"
                  value={pageFilter}
                  options={[
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
                  ]}
                  onChange={setPageFilter}
                />
              </label>
              <label>
                <span>Type</span>
                <Select
                  label="Type"
                  value={typeFilter}
                  options={[
                    { value: "", label: "All types" },
                    ...MEASUREMENT_TYPES.map((type) => ({
                      value: type as string,
                      label: measurementPathSpecs[type].label,
                    })),
                  ]}
                  onChange={setTypeFilter}
                />
              </label>
            </div>
            <div className={styles.filterRow}>
              <label>
                <span>Visibility</span>
                <Select
                  label="Visibility"
                  value={visibilityFilter}
                  options={[
                    { value: "", label: "All" },
                    { value: "true", label: "Visible" },
                    { value: "false", label: "Hidden" },
                  ]}
                  onChange={setVisibilityFilter}
                />
              </label>
              <label>
                <span>Classification</span>
                <Select
                  label="Classification"
                  value={classificationFilter}
                  options={[
                    { value: "", label: "All classifications" },
                    ...catalog.dimensions.flatMap((dimension) =>
                      dimension.values.map((value) => ({
                        value: value.id,
                        label: `${dimension.name}: ${value.name}`,
                      })),
                    ),
                  ]}
                  onChange={setClassificationFilter}
                />
              </label>
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="compact"
                className={styles.clearFilters}
                onClick={() => {
                  setPageFilter("");
                  setTypeFilter("");
                  setVisibilityFilter("");
                  setClassificationFilter("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </Popover>
        {hasGroupBy && (
          <Popover
            open={openControls === "grouping"}
            onOpenChange={(open) => setOpenControls(open ? "grouping" : null)}
            triggerProps={{
              className: [styles.toolbarButton, styles.groupingButton].join(" "),
              "aria-label":
                groupByNames.length > 0
                  ? `Group by ${groupByNames.join(", then ")}`
                  : "Group measurements",
              title: groupByNames.length > 0 ? groupByNames.join(", then ") : undefined,
            }}
            trigger={
              <span className={styles.truncatedTrigger}>
                <span className={styles.groupingPrefix}>Group</span>
                {groupByNames.length > 0 && (
                  <>
                    <span className={styles.groupingSeparator} aria-hidden="true">·</span>
                    <span className={styles.groupingName}>{groupByNames[0]}</span>
                    {groupByNames.length > 1 && (
                      <span className={styles.groupingCount}>+{groupByNames.length - 1}</span>
                    )}
                  </>
                )}
              </span>
            }
            role="dialog"
            aria-label="Measurement grouping"
            initialFocus="first"
            dismissOnFocusLeave
            placement="bottom-end"
            className={[styles.controlsPopover, styles.groupingPopover].join(" ")}
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
