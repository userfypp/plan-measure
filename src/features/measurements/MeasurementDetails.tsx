import { useState, type FormEvent } from "react";
import { AnchoredMenu, Button, IconButton, Input } from "../../components/ui";
import type {
  AreaDisplay,
  ClassificationCatalog,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import {
  MEASUREMENT_NAME_EMPTY_ERROR,
  normalizeMeasurementName,
} from "../../utils/measurementName";
import { ClassificationAssignment } from "../classification/ClassificationAssignment";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { createMeasurementViewModel } from "./measurementViewModels";
import type { WorkspaceModule } from "../../app/workspaceState";
import { workspaceModuleLabel } from "../../app/WorkspacePanel";
import styles from "./MeasurementDetails.module.css";

export interface MeasurementDetailsProps {
  page: PageState;
  measurement: Measurement;
  displayUnit: MeasurementDisplayUnit;
  areaDisplay: AreaDisplay;
  measurementDecimalPlaces: MeasurementDecimalPlaces;
  catalog: ClassificationCatalog;
  returnModule: WorkspaceModule;
  assignmentDisabled?: boolean;
  onBack: () => void;
  onRename: (name: string) => void;
  onSaveNote: (note: string) => void;
  onAssignClassification: (measurementId: string, dimensionId: string, valueId: string | null) => void;
  onRemoveCountItem?: (index: number) => void;
  onMoveCountItem?: (index: number, targetId: string) => void;
  onAddCountItems?: () => void;
  addCountItemsDisabledReason?: string;
  onDelete: () => void;
}

export function MeasurementDetails({
  page,
  measurement,
  displayUnit,
  areaDisplay,
  measurementDecimalPlaces,
  catalog,
  returnModule,
  assignmentDisabled = false,
  onBack,
  onRename,
  onSaveNote,
  onAssignClassification,
  onRemoveCountItem,
  onMoveCountItem,
  onAddCountItems,
  addCountItemsDisabledReason,
  onDelete,
}: MeasurementDetailsProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(measurement.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [note, setNote] = useState(measurement.note ?? "");
  const viewModel = createMeasurementViewModel(
    page,
    measurement,
    displayUnit,
    true,
    measurementDecimalPlaces,
    areaDisplay,
  );
  const calibration = getMeasurementCalibration(page, measurement);
  const scaleMetadata = calibration ? scaleDisplayMetadata(calibration) : null;
  const scaleLabel =
    calibration && scaleMetadata
      ? `${calibration.name} · ${scaleMetadata.ratioLabel}`
      : "Scale unavailable";
  const [perimeterResult, areaResult] = viewModel.valueLabel.split(" · ");
  const polygonResults = measurement.type === "polygon" && perimeterResult && areaResult;
  const otherCounts = page.measurements.filter(
    (candidate) => candidate.type === "count" && candidate.id !== measurement.id,
  );

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = normalizeMeasurementName(name);
    if (!trimmed) {
      setNameError(MEASUREMENT_NAME_EMPTY_ERROR);
      return;
    }
    onRename(trimmed);
    setName(trimmed);
    setNameError(null);
    setRenaming(false);
  }

  return (
    <section className={styles.details} aria-label={`Details for ${measurement.name}`}>
      <div className={styles.scrollArea}>
        <Button
          variant="ghost"
          size="compact"
          className={styles.back}
          data-measurement-details-back
          onClick={onBack}
        >
          <span className={styles.backContent}>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="m12 4-6 6 6 6" />
            </svg>
            <span>Back to {workspaceModuleLabel(returnModule).toLowerCase()}</span>
          </span>
        </Button>

        <div className={styles.summary} data-measurement-summary>
          <span className={styles.result}>
            {polygonResults ? (
              <>
                <span>{areaResult}</span>
                <span>{perimeterResult}</span>
              </>
            ) : (
              viewModel.valueLabel
            )}
          </span>
        </div>

        <section className={styles.section} aria-label="Measurement properties">
          {renaming ? (
            <form className={styles.renameForm} onSubmit={submitRename}>
              <Input
                label="Name"
                value={name}
                error={nameError}
                autoFocus
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setName(measurement.name);
                  setNameError(null);
                  setRenaming(false);
                }}
              />
              <div className={styles.renameActions}>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => {
                    setName(measurement.name);
                    setNameError(null);
                    setRenaming(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="compact">Save</Button>
              </div>
            </form>
          ) : (
            <div className={styles.propertyRow}>
              <span>Name</span>
              <div className={styles.propertyActionValue}>
                <strong>{measurement.name}</strong>
                <Button
                  variant="ghost"
                  size="compact"
                  className={styles.renameAction}
                  aria-label={`Rename ${measurement.name}`}
                  onClick={() => {
                    setName(measurement.name);
                    setNameError(null);
                    setRenaming(true);
                  }}
                >
                  Rename
                </Button>
              </div>
            </div>
          )}
          <div className={styles.propertyRow}>
            <span>Type</span>
            <strong>{viewModel.typeLabel}</strong>
          </div>
          {measurement.type !== "count" && (
            <>
              <div className={[styles.propertyRow, styles.scaleRow].join(" ")}>
                <span>Scale</span>
                <strong title={calibration ? scaleLabel : undefined}>{scaleLabel}</strong>
              </div>
              <div className={styles.propertyRow}>
                <span>Mode</span>
                <strong>{scaleMetadata?.modeLabel ?? "Unavailable"}</strong>
              </div>
            </>
          )}
          <div className={styles.propertyRow}>
            <span>Page</span>
            <strong>{page.pageNumber}</strong>
          </div>
        </section>

        {measurement.type === "count" && onRemoveCountItem && (
          <section className={styles.section} aria-label="Count items">
            <div className={styles.itemsHeader}>
              <h3>Items</h3>
              {onAddCountItems && (
                <Button
                  variant="ghost"
                  size="compact"
                  disabled={assignmentDisabled || Boolean(addCountItemsDisabledReason)}
                  disabledReason={addCountItemsDisabledReason}
                  onClick={onAddCountItems}
                >
                  Add items
                </Button>
              )}
            </div>
            <ul className={styles.itemsList} aria-label={`Items in ${measurement.name}`}>
              {measurement.points.map((_, index) => (
                <li className={styles.itemRow} key={index}>
                  <span>Item {index + 1}</span>
                  <div className={styles.itemActions}>
                    {onMoveCountItem && (
                      <AnchoredMenu
                        trigger="Move to…"
                        triggerProps={{
                          className: styles.itemMove,
                          "aria-label": `Move item ${index + 1} to another count`,
                          disabled: assignmentDisabled || otherCounts.length === 0,
                          title: otherCounts.length === 0 ? "Create another count on this page first" : undefined,
                        }}
                        label={`Move item ${index + 1} to count`}
                        placement="bottom-end"
                        showMarkerColumn={false}
                        items={otherCounts.map((count) => ({
                          id: count.id,
                          label: `${count.name}${count.visible ? "" : " (hidden)"}`,
                          onSelect: () => onMoveCountItem(index, count.id),
                        }))}
                      />
                    )}
                    <IconButton
                      className={styles.itemRemove}
                      aria-label={`Remove item ${index + 1}`}
                      tooltip={`Remove item ${index + 1}`}
                      tone="danger"
                      disabled={assignmentDisabled}
                      data-count-item-remove
                      onClick={(event) => {
                        if (measurement.points.length === 1) {
                          onDelete();
                          return;
                        }
                        const list = event.currentTarget.closest("ul");
                        onRemoveCountItem(index);
                        window.requestAnimationFrame(() => {
                          list?.querySelectorAll<HTMLButtonElement>("[data-count-item-remove]")[
                            Math.min(index, measurement.points.length - 2)
                          ]?.focus({ preventScroll: true });
                        });
                      }}
                      icon={
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path d="M3.5 5h13M7.5 5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5" />
                          <path d="m5.5 7 .6 9.1a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-9.1M8.5 8.5v6M11.5 8.5v6" />
                        </svg>
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`${styles.section} ${styles.noteSection}`} aria-label="Measurement note">
          <div className={styles.noteHeader}>
            <h3>Note</h3>
            <Button
              type="submit"
              form="measurement-note-form"
              variant="ghost"
              size="compact"
            >
              Save note
            </Button>
          </div>
          <form
            id="measurement-note-form"
            className={styles.noteForm}
            onSubmit={(event) => {
              event.preventDefault();
              onSaveNote(note);
            }}
          >
            <textarea
              id="measurement-note"
              aria-label="Note"
              value={note}
              rows={4}
              onChange={(event) => setNote(event.target.value)}
            />
          </form>
        </section>

        <section
          className={`${styles.section} ${styles.organizationSection}`}
          aria-label="Measurement organization"
        >
          <h3>Organization</h3>
          <ClassificationAssignment
            measurementId={measurement.id}
            appliedValueIds={measurement.classificationValueIds}
            catalog={catalog}
            onAssign={onAssignClassification}
            disabled={assignmentDisabled}
            compact
          />
        </section>

      </div>

      <div className={styles.dangerZone}>
        <Button
          variant="ghost"
          size="compact"
          className={styles.deleteAction}
          onClick={onDelete}
        >
          Delete measurement
        </Button>
      </div>
    </section>
  );
}
