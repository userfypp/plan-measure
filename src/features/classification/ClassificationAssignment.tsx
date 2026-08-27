import { useId } from "react";
import { Badge } from "../../components/ui";
import type { ClassificationCatalog } from "../../types/domain";
import styles from "./ClassificationAssignment.module.css";

export interface ClassificationAssignmentProps {
  measurementId: string;
  appliedValueIds: readonly string[];
  catalog: ClassificationCatalog;
  onAssign: (measurementId: string, dimensionId: string, valueId: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ClassificationAssignment({
  measurementId,
  appliedValueIds,
  catalog,
  onAssign,
  disabled = false,
  compact = false,
}: ClassificationAssignmentProps) {
  const fieldIdPrefix = useId();
  const assigned = catalog.dimensions.flatMap((dimension) =>
    dimension.values
      .filter((value) => appliedValueIds.includes(value.id))
      .map((value) => ({ dimension, value })),
  );
  const allDimensionsArchived =
    catalog.dimensions.length > 0 && catalog.dimensions.every((dimension) => dimension.archived);
  return (
    <section
      className={[styles.assignment, compact ? styles.compact : ""].filter(Boolean).join(" ")}
      aria-label="Classification assignment"
    >
      {!compact && (
        <div className={styles.heading}>
          <h4 className={styles.title}>Assigned values</h4>
          <Badge variant={assigned.length ? "success" : "neutral"}>{assigned.length}</Badge>
        </div>
      )}
      {assigned.length > 0 && (
        <div className={styles.chips} aria-live="polite">
          {assigned.map(({ dimension, value }) => (
            <Badge key={value.id}>
              {dimension.name}: {value.name}
              {value.archived || dimension.archived ? " (archived)" : ""}
            </Badge>
          ))}
        </div>
      )}
      {catalog.dimensions.map((dimension) => {
        const current = dimension.values.find((value) => appliedValueIds.includes(value.id));
        if (dimension.archived && !current) return null;
        const options = dimension.archived
          ? current
            ? [current]
            : []
          : dimension.values.filter((value) => !value.archived || value.id === current?.id);
        const fieldId = `${fieldIdPrefix}-${measurementId}-${dimension.id}`;
        return (
          <label className={styles.field} key={dimension.id} htmlFor={fieldId}>
            <span>
              {dimension.name}
              {dimension.archived ? " (archived)" : ""}
            </span>
            <select
              id={fieldId}
              data-viewer-shortcuts="enabled"
              value={current?.id ?? ""}
              disabled={disabled || options.length === 0}
              onChange={(event) =>
                onAssign(measurementId, dimension.id, event.target.value || null)
              }
            >
              <option value="">Unclassified</option>
              {options.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                  {value.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {catalog.dimensions.length === 0 && (
        <p className={styles.empty}>Create a classification dimension in the catalog first.</p>
      )}
      {allDimensionsArchived && assigned.length === 0 && (
        <p className={styles.empty}>
          Restore a classification dimension in the catalog to assign classifications.
        </p>
      )}
    </section>
  );
}
