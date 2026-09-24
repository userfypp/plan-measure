import { memo, useMemo, useState } from "react";
import { useSessionState } from "../../app/sessionState";
import type { PageState } from "../../types/domain";
import { effectivePageLabel } from "../../utils/pageLabels";
import { MeasurementCollection } from "./MeasurementCollection";
import { MeasurementsHeader } from "./MeasurementsHeader";
import { createMeasurementGroups } from "./measurementGrouping";
import {
  createMeasurementViewModel,
  getMeasurementEmptyMessage,
} from "./measurementViewModels";
import styles from "./MeasurementPanel.module.css";

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
  onSelectMeasurement: (pageNumber: number, measurementId: string) => void;
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
  onSelectMeasurement,
  onSetMeasurementVisibility,
  onSetMeasurementsVisibility,
}: MeasurementPanelProps) {
  const { session } = useSessionState();
  const displayUnit = session?.settings.displayUnit ?? "m";
  const measurementDecimalPlaces = session?.settings.measurementDecimalPlaces ?? 2;
  const areaDisplay = session?.settings.areaDisplay ?? "auto";
  const [groupByDimensionIds, setGroupByDimensionIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const catalog = session?.classificationCatalog ?? { dimensions: [] };
  const allMeasurements = useMemo(
    () => Object.values(pages).flatMap((candidatePage) =>
      candidatePage.measurements.map((measurement) => ({
        ...createMeasurementViewModel(
          candidatePage,
          measurement,
          displayUnit,
          measurement.id === selectedMeasurementId,
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
    [areaDisplay, displayUnit, measurementDecimalPlaces, pageLabelOverrides, pages, selectedMeasurementId, sourcePageLabels],
  );
  const measurements = allMeasurements.filter((measurement) =>
    measurement.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (!pageFilter || String(measurement.pageNumber) === pageFilter) &&
    (!typeFilter || measurement.type === typeFilter) &&
    (!visibilityFilter || String(measurement.visible) === visibilityFilter) &&
    (!classificationFilter || measurement.classificationValueIds.includes(classificationFilter)),
  );
  const hasGroupBy = catalog.dimensions.length > 0;
  const groups = groupByDimensionIds.length
    ? createMeasurementGroups(
        measurements.map((measurement) => ({
          ...pages[measurement.pageNumber]!.measurements.find((item) => item.id === measurement.id)!,
          pageNumber: measurement.pageNumber,
        })),
        catalog,
        groupByDimensionIds,
      )
    : undefined;

  return (
    <aside
      className={[styles.panel, hasGroupBy ? styles.withGroupBy : styles.withoutGroupBy]
        .filter(Boolean)
        .join(" ")}
      aria-label="Measurements workspace"
    >
      {hasGroupBy && (
        <MeasurementsHeader
          dimensions={catalog.dimensions}
          groupByDimensionIds={groupByDimensionIds}
          onGroupByDimensionsChange={setGroupByDimensionIds}
        />
      )}
      <div className={styles.filters} aria-label="Filter measurements">
        <label className={styles.search}>
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Measurement name"
          />
        </label>
        <div className={styles.filterRow}>
          <label>
            <span>Page</span>
            <select
              value={pageFilter}
              onChange={(event) => setPageFilter(event.target.value)}
            >
              <option value="">All pages</option>
              {Object.values(pages)
                .sort((a, b) => a.pageNumber - b.pageNumber)
                .map((candidatePage) => {
                  const label =
                    effectivePageLabel(
                      candidatePage.pageNumber,
                      pageLabelOverrides,
                      sourcePageLabels,
                    ) || `Page ${candidatePage.pageNumber}`;
                  return (
                    <option key={candidatePage.pageNumber} value={candidatePage.pageNumber}>
                      {label}
                    </option>
                  );
                })}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All types</option>
              <option value="line">Line</option>
              <option value="polyline">Polyline</option>
              <option value="polygon">Polygon</option>
            </select>
          </label>
        </div>
        <div className={styles.filterRow}>
          <label>
            <span>Visibility</span>
            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
            >
              <option value="">All</option>
              <option value="true">Visible</option>
              <option value="false">Hidden</option>
            </select>
          </label>
          <label>
            <span>Classification</span>
            <select
              value={classificationFilter}
              onChange={(event) => setClassificationFilter(event.target.value)}
            >
              <option value="">All classifications</option>
              {catalog.dimensions.flatMap((dimension) =>
                dimension.values.map((value) => (
                  <option key={value.id} value={value.id}>
                    {dimension.name}: {value.name}
                  </option>
                )),
              )}
            </select>
          </label>
        </div>
      </div>
      <MeasurementCollection
        key={groupByDimensionIds.join("/") || "flat"}
        measurements={measurements}
        emptyMessage={
          allMeasurements.length === 0
            ? getMeasurementEmptyMessage(page)
            : "No measurements match these filters."
        }
        onSelectMeasurement={(measurementId) => {
          const result = measurements.find((candidate) => candidate.id === measurementId);
          if (result) onSelectMeasurement(result.pageNumber, measurementId);
        }}
        onToggleVisibility={(measurementId, visible) => {
          const result = measurements.find((candidate) => candidate.id === measurementId);
          if (result) onSetMeasurementVisibility(result.pageNumber, measurementId, visible);
        }}
        groups={groups}
        groupByDimensionId={groupByDimensionIds[0] ?? null}
        onSetMeasurementsVisibility={(measurementIds, visible) =>
          Object.entries(
            measurementIds.reduce<Record<number, string[]>>((byPage, measurementId) => {
              const pageNumber = measurements.find((measurement) => measurement.id === measurementId)?.pageNumber;
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
