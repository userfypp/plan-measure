import { memo, Suspense, useMemo, useState } from "react";
import { recoverableLazy } from "../../app/recoverableLazy";
import { retryableImport } from "../../app/retryableImport";
import { useNumberFormatKey } from "../../utils/appPreferences";
import { useSessionState } from "../../app/sessionState";
import { Popover } from "../../components/ui";
import type { ClassificationCatalog, PageState } from "../../types/domain";
import { effectivePageLabel } from "../../utils/pageLabels";
import { MeasurementCollection } from "./MeasurementCollection";
import { MeasurementsHeader } from "./MeasurementsHeader";
import { createMeasurementGroups } from "./measurementGrouping";
import {
  CURRENT_PAGE_FILTER,
  NO_MEASUREMENT_FILTERS,
  UNCLASSIFIED_FILTER,
  measurementScaleFilterValue,
  type MeasurementFilters,
} from "./measurementFilters";
import {
  createMeasurementViewModel,
  getMeasurementEmptyMessage,
  type MeasurementValueLabelCache,
} from "./measurementViewModels";
import styles from "./MeasurementPanel.module.css";

const emptyClassificationCatalog: ClassificationCatalog = { dimensions: [] };

const MeasurementFilterFields = recoverableLazy(
  retryableImport(() =>
    import("./MeasurementFilterFields").then((module) => ({
      default: module.MeasurementFilterFields,
    })),
  ),
  "Filters",
);
export const preloadMeasurementFilters = MeasurementFilterFields.preload;

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
  onSetMeasurementsVisibility: (measurementIds: string[], visible: boolean) => void;
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
  const [selectedFilters, setFilters] = useState<MeasurementFilters>(NO_MEASUREMENT_FILTERS);
  const [openControls, setOpenControls] = useState<"filters" | "grouping" | null>(null);
  const catalog = session?.classificationCatalog ?? emptyClassificationCatalog;
  const groupByDimensionIds = useMemo(
    () => selectedGroupByDimensionIds.filter((id) =>
      catalog.dimensions.some((dimension) => dimension.id === id),
    ),
    [catalog, selectedGroupByDimensionIds],
  );
  // A classification filter whose value was deleted is ignored until undo restores the value.
  const filters =
    !selectedFilters.classification ||
    (selectedFilters.classification === UNCLASSIFIED_FILTER && catalog.dimensions.length > 0) ||
    catalog.dimensions.some((dimension) =>
      dimension.values.some((value) => value.id === selectedFilters.classification),
    )
      ? selectedFilters
      : { ...selectedFilters, classification: "" };
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
        calibrationId: measurement.calibrationId,
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
  const currentPageNumber = page.pageNumber;
  const activeCalibrationId = page.activeCalibrationId;
  const activeCalibration = page.calibrations.find(
    (calibration) => calibration.id === activeCalibrationId,
  );
  const { page: pageFilter, type, scale, classification, visibility, selection } = filters;
  const measurements = useMemo(
    () => allMeasurements.filter((measurement) =>
      (!normalizedQuery || measurement.name.toLocaleLowerCase().includes(normalizedQuery)) &&
      (!pageFilter ||
        measurement.pageNumber ===
          (pageFilter === CURRENT_PAGE_FILTER ? currentPageNumber : Number(pageFilter))) &&
      (!type || measurement.type === type) &&
      (!scale ||
        measurementScaleFilterValue(measurement, currentPageNumber, activeCalibrationId) ===
          scale) &&
      (!classification ||
        (classification === UNCLASSIFIED_FILTER
          ? measurement.classificationValueIds.length === 0
          : measurement.classificationValueIds.includes(classification))) &&
      (!visibility || String(measurement.visible) === visibility) &&
      (!selection || measurement.selected),
    ),
    [
      activeCalibrationId,
      allMeasurements,
      classification,
      currentPageNumber,
      normalizedQuery,
      pageFilter,
      scale,
      selection,
      type,
      visibility,
    ],
  );
  const measurementsById = useMemo(
    () => new Map(measurements.map((measurement) => [measurement.id, measurement])),
    [measurements],
  );
  const hasGroupBy = catalog.dimensions.length > 0;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
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
          {/* A cold first open keeps the list on screen while the fields load. */}
          <Suspense fallback={null}>
            <MeasurementFilterFields
              measurements={allMeasurements}
              filters={filters}
              activeFilterCount={activeFilterCount}
              currentPageNumber={currentPageNumber}
              activeScale={
                activeCalibration
                  ? { id: activeCalibration.id, name: activeCalibration.name }
                  : null
              }
              catalog={catalog}
              pageLabel={(pageNumber) =>
                effectivePageLabel(pageNumber, pageLabelOverrides, sourcePageLabels) ||
                `Page ${pageNumber}`
              }
              onChange={setFilters}
            />
          </Suspense>
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
        onSetMeasurementsVisibility={onSetMeasurementsVisibility}
      />
    </aside>
  );
});
