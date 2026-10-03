import { useId, useState } from "react";
import { AnchoredMenu, Popover } from "../../components/ui";
import type { BulkMeasurementCommand } from "../../app/sessionState";
import type { ClassificationCatalog, Measurement } from "../../types/domain";
import styles from "./MeasurementClassificationMenu.module.css";

export interface MeasurementClassificationMenuProps {
  measurements: readonly Measurement[];
  catalog: ClassificationCatalog;
  onEdit: (command: BulkMeasurementCommand) => boolean;
  triggerClassName?: string;
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m6.5 8 3.5 4 3.5-4" />
    </svg>
  );
}

export function MeasurementClassificationMenu({
  measurements,
  catalog,
  onEdit,
  triggerClassName,
}: MeasurementClassificationMenuProps) {
  const [open, setOpen] = useState(false);
  const fieldPrefix = useId();
  const measurementIds = measurements.map((measurement) => measurement.id);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <span className={styles.triggerContent}>
          Classify
          <Chevron />
        </span>
      }
      triggerProps={{
        className: [styles.trigger, triggerClassName].filter(Boolean).join(" "),
        disabled: catalog.dimensions.length === 0,
      }}
      role="dialog"
      aria-label="Classify selected measurements"
      placement="bottom-start"
      initialFocus="first"
      dismissOnFocusLeave
      className={styles.popover}
    >
      <div className={styles.heading}>
        <strong>Classifications</strong>
        <span>
          {measurements.length === 1
            ? "Apply to the selected measurement."
            : `Apply to ${measurements.length} selected measurements.`}
        </span>
      </div>
      <div className={styles.fields}>
        {catalog.dimensions.map((dimension) => {
          const assigned = measurements.map(
            (measurement) =>
              dimension.values.find((value) =>
                measurement.classificationValueIds.includes(value.id),
              )?.id ?? "",
          );
          const mixed = assigned.some((valueId) => valueId !== assigned[0]);
          if (dimension.archived && assigned.every((id) => !id)) return null;
          const options = dimension.values.filter(
            (value) => (!dimension.archived && !value.archived) || assigned.includes(value.id),
          );
          const current = dimension.values.find((value) => value.id === assigned[0]);
          const currentLabel = mixed
            ? "Mixed values"
            : current
              ? `${current.name}${current.archived ? " (archived)" : ""}`
              : "Unclassified";
          const labelId = `${fieldPrefix}-${dimension.id}`;
          function assign(valueId: string | null) {
            onEdit({
              measurementIds,
              operation: { type: "classification", dimensionId: dimension.id, valueId },
            });
          }
          return (
            <div className={styles.field} key={dimension.id}>
              <span id={labelId} className={styles.fieldLabel} title={dimension.name}>
                {dimension.name}
                {dimension.archived ? " (archived)" : ""}
              </span>
              <AnchoredMenu
                trigger={
                  <span className={styles.valueContent}>
                    <span title={currentLabel}>{currentLabel}</span>
                    <Chevron />
                  </span>
                }
                triggerProps={{
                  className: styles.valueTrigger,
                  "aria-label": `${dimension.name}: ${currentLabel}`,
                  "aria-describedby": labelId,
                }}
                label={`Select ${dimension.name} classification value`}
                placement="bottom-start"
                className={styles.valueMenu}
                items={[
                  {
                    id: "unclassified",
                    label: <span className={styles.option}>Unclassified</span>,
                    role: "menuitemradio",
                    checked: !mixed && !current,
                    onSelect: () => assign(null),
                  },
                  ...options.map((value) => ({
                    id: value.id,
                    label: (
                      <span className={styles.option} title={value.name}>
                        {value.name}
                        {value.archived ? " (archived)" : ""}
                      </span>
                    ),
                    role: "menuitemradio" as const,
                    checked: !mixed && value.id === current?.id,
                    disabled: dimension.archived || value.archived,
                    onSelect: () => assign(value.id),
                  })),
                ]}
              />
            </div>
          );
        })}
        {catalog.dimensions.every(
          (dimension) =>
            dimension.archived &&
            !dimension.values.some((value) =>
              measurements.some((measurement) =>
                measurement.classificationValueIds.includes(value.id),
              ),
            ),
        ) && <p className={styles.empty}>Restore a classification dimension to assign values.</p>}
      </div>
    </Popover>
  );
}
