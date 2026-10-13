import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNumberFormatKey } from "../../utils/appPreferences";
import { AnchoredMenu, Button, IconButton, Input, Textarea } from "../../components/ui";
import type {
  AreaDisplay,
  ClassificationCatalog,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { measurementPathSpecs } from "../../utils/geometry";
import {
  MEASUREMENT_NAME_EMPTY_ERROR,
  normalizeMeasurementName,
} from "../../utils/measurementName";
import { ClassificationAssignment } from "../classification/ClassificationAssignment";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { createMeasurementViewModel } from "./measurementViewModels";
import type { WorkspaceModule } from "../../app/workspaceState";
import { workspaceModuleLabel } from "../../app/WorkspacePanel";
import { CloudColorPicker } from "./CloudColorPicker";
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
  /** Present only where cloud colors can be edited. */
  onChangeColor?: (color: string) => void;
  onAssignClassification: (measurementId: string, dimensionId: string, valueId: string | null) => void;
  onRemoveCountItem?: (index: number) => void;
  onMoveCountItem?: (index: number, targetId: string) => void;
  onAddCountItems?: () => void;
  addCountItemsDisabledReason?: string;
  onDelete: () => void;
}

const COUNT_ITEMS_PER_PAGE = 50;

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
  onChangeColor,
  onAssignClassification,
  onRemoveCountItem,
  onMoveCountItem,
  onAddCountItems,
  addCountItemsDisabledReason,
  onDelete,
}: MeasurementDetailsProps) {
  useNumberFormatKey(); // re-render when separators change
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(measurement.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const savedNote = measurement.note ?? "";
  const [note, setNote] = useState(savedNote);
  const [noteSource, setNoteSource] = useState({ id: measurement.id, note: savedNote });
  if (noteSource.id !== measurement.id || noteSource.note !== savedNote) {
    setNoteSource({ id: measurement.id, note: savedNote });
    setNote(savedNote);
  }
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
  const polygonResults = measurementPathSpecs[measurement.type].closed && perimeterResult && areaResult;
  const otherCounts = useMemo(() => page.measurements.filter(
    (candidate) => candidate.type === "count" && candidate.id !== measurement.id,
  ), [page.measurements, measurement.id]);
  const [itemPage, setItemPage] = useState(0);
  const lastItemPage = Math.max(0, Math.ceil(measurement.points.length / COUNT_ITEMS_PER_PAGE) - 1);
  const visibleItemPage = Math.min(itemPage, lastItemPage);
  if (itemPage !== visibleItemPage) setItemPage(visibleItemPage);
  const itemsStart = visibleItemPage * COUNT_ITEMS_PER_PAGE;
  const itemsListRef = useRef<HTMLUListElement>(null);
  function changeItemPage(next: number) {
    setItemPage(next);
    if (itemsListRef.current) itemsListRef.current.scrollTop = 0;
  }

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
              <path d="M16 10H4.5M9.75 4.75 4.5 10l5.25 5.25" />
            </svg>
            <span>Back to {workspaceModuleLabel(returnModule).toLowerCase()}</span>
          </span>
        </Button>

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
                variant="ghost"
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
          <div className={styles.identity}>
            <h2 className={styles.name} title={measurement.name}>{measurement.name}</h2>
            <IconButton
              className={styles.renameAction}
              aria-label={`Rename ${measurement.name}`}
              tooltip="Rename"
              icon={
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M4.5 15.5l.75-3.25 8.5-8.5a1.41 1.41 0 0 1 2 0l1 1a1.41 1.41 0 0 1 0 2l-8.5 8.5-3.75.75zM12 5.5l2.5 2.5" />
                </svg>
              }
              onClick={() => {
                setName(measurement.name);
                setNameError(null);
                setRenaming(true);
              }}
            />
          </div>
        )}

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

        <dl className={styles.properties} aria-label="Measurement properties">
          <div className={styles.cell}>
            <dt>Type</dt>
            <dd>{viewModel.typeLabel}</dd>
          </div>
          {measurement.type !== "count" && (
            <div className={styles.cell}>
              <dt>Mode</dt>
              <dd>{scaleMetadata?.modeLabel ?? "Unavailable"}</dd>
            </div>
          )}
          <div className={styles.cell}>
            <dt>Page</dt>
            <dd>{page.pageNumber}</dd>
          </div>
          {measurement.type !== "count" && (
            <div className={[styles.cell, styles.wideCell].join(" ")}>
              <dt>Scale</dt>
              <dd title={calibration ? scaleLabel : undefined}>{scaleLabel}</dd>
            </div>
          )}
          {measurement.type === "cloud" && onChangeColor && (
            <div className={[styles.cell, styles.wideCell, styles.colorCell].join(" ")}>
              <dt>Color</dt>
              <dd>
                <CloudColorPicker
                  color={measurement.color}
                  disabled={assignmentDisabled}
                  onChange={onChangeColor}
                />
              </dd>
            </div>
          )}
        </dl>

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
            <ul ref={itemsListRef} className={styles.itemsList} aria-label={`Items in ${measurement.name}`}>
              {measurement.points.slice(itemsStart, itemsStart + COUNT_ITEMS_PER_PAGE).map((_, localIndex) => {
                const index = itemsStart + localIndex;
                return (
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
                        items={() => otherCounts.map((count) => ({
                          id: count.id,
                          label: `${count.name}${count.visible ? "" : " (hidden)"}`,
                          onSelect: () => onMoveCountItem(index, count.id),
                        }))}
                      />
                    )}
                    <IconButton
                      className={styles.itemRemove}
                      aria-label={`Delete item ${index + 1}`}
                      tooltip={`Delete item ${index + 1}`}
                      tooltipPosition="left"
                      tone="danger"
                      disabled={assignmentDisabled}
                      data-count-item-index={index}
                      data-count-item-remove
                      onClick={(event) => {
                        if (measurement.points.length === 1) {
                          onDelete();
                          return;
                        }
                        const list = event.currentTarget.closest("ul");
                        onRemoveCountItem(index);
                        window.requestAnimationFrame(() => {
                          const buttons = Array.from(list?.querySelectorAll<HTMLButtonElement>("[data-count-item-remove]") ?? []);
                          const nearest = buttons.find((button) => Number(button.dataset.countItemIndex) === Math.min(index, measurement.points.length - 2));
                          (nearest ?? buttons.at(-1))?.focus({ preventScroll: true });
                        });
                      }}
                      icon={
                        <svg
                          className={styles.itemRemoveIcon}
                          viewBox="0 0 20 20"
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
              ); })}
            </ul>
            {measurement.points.length > COUNT_ITEMS_PER_PAGE && (
              <nav className={styles.itemsPagination} aria-label="Count items pagination">
                <Button size="compact" variant="ghost" disabled={visibleItemPage === 0}
                  onClick={() => changeItemPage(visibleItemPage - 1)}>Previous items</Button>
                <span role="status">{itemsStart + 1}–{Math.min(itemsStart + COUNT_ITEMS_PER_PAGE, measurement.points.length)} of {measurement.points.length}</span>
                <Button size="compact" variant="ghost" disabled={visibleItemPage === lastItemPage}
                  onClick={() => changeItemPage(visibleItemPage + 1)}>Next items</Button>
              </nav>
            )}
          </section>
        )}

        <section className={styles.section} aria-label="Measurement note">
          <h3>Note</h3>
          <form
            id="measurement-note-form"
            className={styles.noteForm}
            onSubmit={(event) => {
              event.preventDefault();
              onSaveNote(note);
            }}
          >
            <Textarea
              id="measurement-note"
              aria-label="Note"
              value={note}
              rows={4}
              onChange={(event) => setNote(event.target.value)}
            />
          </form>
          <div className={styles.noteActions}>
            <Button
              type="submit"
              form="measurement-note-form"
              size="compact"
              disabled={note === savedNote}
            >
              Save note
            </Button>
          </div>
        </section>

        <section
          className={styles.section}
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
    </section>
  );
}
