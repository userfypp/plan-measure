import { useId } from "react";
import { AnchoredMenu, Badge, ChevronDownIcon, Select } from "../../components/ui";
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
      {!compact && assigned.length > 0 && (
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
        const fieldLabelId = `${fieldId}-label`;
        const fieldDisabled = disabled || options.length === 0;
        const currentLabel = current
          ? `${current.name}${current.archived ? " (archived)" : ""}`
          : "Unclassified";
        if (compact) {
          return (
            <div className={styles.field} key={dimension.id}>
              <span id={fieldLabelId}>
                {dimension.name}
                {dimension.archived ? " (archived)" : ""}
              </span>
              <AnchoredMenu
                trigger={
                  <span className={styles.valueTriggerContent}>
                    <span title={currentLabel}>{currentLabel}</span>
                    <ChevronDownIcon />
                  </span>
                }
                triggerProps={{
                  className: styles.valueTrigger,
                  "aria-label": `${dimension.name}: ${currentLabel}`,
                  disabled: fieldDisabled,
                }}
                label={`Select ${dimension.name} classification value`}
                matchTriggerWidth
                items={[
                  {
                    id: "unclassified",
                    label: "Unclassified",
                    role: "menuitemradio",
                    checked: !current,
                    onSelect: () => {
                      if (current) onAssign(measurementId, dimension.id, null);
                    },
                  },
                  ...options.map((value) => ({
                    id: value.id,
                    label: `${value.name}${value.archived ? " (archived)" : ""}`,
                    role: "menuitemradio" as const,
                    checked: value.id === current?.id,
                    onSelect: () => {
                      if (value.id !== current?.id) onAssign(measurementId, dimension.id, value.id);
                    },
                  })),
                ]}
                placement="bottom-start"
              />
            </div>
          );
        }
        return (
          <label className={styles.field} key={dimension.id} htmlFor={fieldId}>
            <span>
              {dimension.name}
              {dimension.archived ? " (archived)" : ""}
            </span>
            <Select
              id={fieldId}
              label={`${dimension.name}${dimension.archived ? " (archived)" : ""}`}
              triggerProps={{ "data-viewer-shortcuts": "enabled" }}
              value={current?.id ?? ""}
              disabled={fieldDisabled}
              options={[
                { value: "", label: "Unclassified" },
                ...options.map((value) => ({
                  value: value.id,
                  label: `${value.name}${value.archived ? " (archived)" : ""}`,
                })),
              ]}
              onChange={(valueId) => onAssign(measurementId, dimension.id, valueId || null)}
            />
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
