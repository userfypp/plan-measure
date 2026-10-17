import { Button, Select, type SelectOption } from "../../components/ui";
import type { ClassificationCatalog } from "../../types/domain";
import { MEASUREMENT_TYPES, measurementPathSpecs } from "../../utils/geometry";
import {
  CURRENT_PAGE_FILTER,
  NO_MEASUREMENT_FILTERS,
  UNCLASSIFIED_FILTER,
  measurementScaleFilterValue,
  type FilterableMeasurement,
  type MeasurementFilterKey,
  type MeasurementFilters,
} from "./measurementFilters";
import styles from "./MeasurementPanel.module.css";

export interface MeasurementFilterFieldsProps {
  measurements: readonly FilterableMeasurement[];
  filters: MeasurementFilters;
  activeFilterCount: number;
  currentPageNumber: number;
  /** The active scale of the page on screen. */
  activeScale: { id: string; name: string } | null;
  catalog: ClassificationCatalog;
  pageLabel: (pageNumber: number) => string;
  onChange: (filters: MeasurementFilters) => void;
}

interface FilterField {
  key: MeasurementFilterKey;
  label: string;
  options: SelectOption<string>[];
}

function countBy(
  measurements: readonly FilterableMeasurement[],
  keyOf: (measurement: FilterableMeasurement) => string | readonly string[],
) {
  const counts = new Map<string, number>();
  for (const measurement of measurements) {
    const keys = keyOf(measurement);
    for (const key of typeof keys === "string" ? [keys] : keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function counted(label: string, count: number) {
  return `${label} (${count})`;
}

/**
 * Filter choices built from the measurements themselves: each list offers only values that some
 * measurement has, with how many have it, plus the chosen value so a stale choice stays visible.
 */
export function MeasurementFilterFields({
  measurements,
  filters,
  activeFilterCount,
  currentPageNumber,
  activeScale,
  catalog,
  pageLabel,
  onChange,
}: MeasurementFilterFieldsProps) {
  const pageCounts = countBy(measurements, (measurement) => String(measurement.pageNumber));
  const typeCounts = countBy(measurements, (measurement) => measurement.type);
  const scaleCounts = countBy(measurements, (measurement) =>
    measurementScaleFilterValue(measurement, currentPageNumber, activeScale?.id ?? null),
  );
  const visibilityCounts = countBy(measurements, (measurement) => String(measurement.visible));
  const classificationCounts = countBy(measurements, (measurement) =>
    measurement.classificationValueIds.length
      ? measurement.classificationValueIds
      : UNCLASSIFIED_FILTER,
  );
  const selectedCount = measurements.filter((measurement) => measurement.selected).length;
  const offered = (value: string, counts: Map<string, number>, chosen: string) =>
    counts.has(value) || value === chosen;

  const pageNumbers = [...pageCounts.keys()].map(Number);
  if (filters.page && filters.page !== CURRENT_PAGE_FILTER && !pageCounts.has(filters.page)) {
    pageNumbers.push(Number(filters.page));
  }
  const fields: FilterField[] = [
    {
      key: "page",
      label: "Page",
      options: [
        { value: "", label: "All pages" },
        {
          value: CURRENT_PAGE_FILTER,
          label: counted("This page", pageCounts.get(String(currentPageNumber)) ?? 0),
        },
        ...pageNumbers
          .sort((left, right) => left - right)
          .map((pageNumber) => ({
            value: String(pageNumber),
            label: counted(pageLabel(pageNumber), pageCounts.get(String(pageNumber)) ?? 0),
          })),
      ],
    },
    {
      key: "type",
      label: "Type",
      options: [
        { value: "", label: "All types" },
        ...MEASUREMENT_TYPES.filter((type) => offered(type, typeCounts, filters.type)).map(
          (type) => ({
            value: type as string,
            label: counted(measurementPathSpecs[type].label, typeCounts.get(type) ?? 0),
          }),
        ),
      ],
    },
  ];
  if (scaleCounts.has("active") || scaleCounts.has("other") || filters.scale) {
    fields.push({
      key: "scale",
      label: "Scale",
      options: [
        { value: "", label: "All scales" },
        {
          value: "active",
          label: counted(
            activeScale ? `Active: ${activeScale.name}` : "Active scale",
            scaleCounts.get("active") ?? 0,
          ),
        },
        { value: "other", label: counted("Other scales", scaleCounts.get("other") ?? 0) },
      ],
    });
  }
  if (catalog.dimensions.length > 0) {
    fields.push({
      key: "classification",
      label: "Classification",
      options: [
        { value: "", label: "All classifications" },
        {
          value: UNCLASSIFIED_FILTER,
          label: counted("Unclassified", classificationCounts.get(UNCLASSIFIED_FILTER) ?? 0),
        },
        ...catalog.dimensions.flatMap((dimension) =>
          dimension.values
            .filter((value) => offered(value.id, classificationCounts, filters.classification))
            .map((value) => ({
              value: value.id,
              label: counted(
                `${dimension.name}: ${value.name}`,
                classificationCounts.get(value.id) ?? 0,
              ),
            })),
        ),
      ],
    });
  }
  fields.push(
    {
      key: "visibility",
      label: "Visibility",
      options: [
        { value: "", label: "All" },
        { value: "true", label: counted("Visible", visibilityCounts.get("true") ?? 0) },
        { value: "false", label: counted("Hidden", visibilityCounts.get("false") ?? 0) },
      ],
    },
    {
      key: "selection",
      label: "Selection",
      options: [
        { value: "", label: "All" },
        { value: "selected", label: counted("Selected", selectedCount) },
      ],
    },
  );

  return (
    <>
      <div className={styles.fields}>
        {fields.map((field) => (
          <label className={styles.field} key={field.key}>
            <span>{field.label}</span>
            <Select
              label={field.label}
              value={filters[field.key]}
              options={field.options}
              onChange={(value) => onChange({ ...filters, [field.key]: value })}
            />
          </label>
        ))}
      </div>
      {activeFilterCount > 0 && (
        <footer className={styles.popoverFooter}>
          <Button variant="ghost" size="compact" onClick={() => onChange(NO_MEASUREMENT_FILTERS)}>
            Clear filters
          </Button>
        </footer>
      )}
    </>
  );
}
