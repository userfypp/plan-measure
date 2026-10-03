import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, IconButton } from "../components/ui";
import { useRovingFocusGroup } from "../components/ui/rovingFocus";
import { ToolIcon } from "../features/viewer/ToolIcon";
import { useViewerInteractionCommands } from "../features/viewer/ViewerInteractionCommands";
import { isMeasurementType, measurementPathSpecs } from "../utils/geometry";
import { getShortcutLabel } from "../utils/keyboard";
import { MEASUREMENT_NAME_EMPTY_ERROR, normalizeMeasurementName } from "../utils/measurementName";
import { useWorkspaceState } from "./workspaceState";
import type { ClassificationCatalog, Measurement } from "../types/domain";
import type { BulkMeasurementCommand } from "./sessionState";
import { MeasurementClassificationMenu } from "../features/measurements/MeasurementClassificationMenu";
import styles from "./ContextToolbar.module.css";

export interface ContextToolbarProps {
  selectedMeasurementId: string | null;
  selectedMeasurementName: string | null;
  selectedMeasurements?: readonly Measurement[];
  classificationCatalog?: ClassificationCatalog;
  onEditSelectedMeasurements?: (command: BulkMeasurementCommand) => boolean;
  onClearMeasurementSelection?: () => void;
  duplicateDisabled: boolean;
  referenceEditValid: boolean;
  measurementEditActive: boolean;
  calibrationDialogOpen?: boolean;
  onDeleteSelectedMeasurement: () => void;
  onDuplicateSelectedMeasurement: () => void;
  onRenameSelectedMeasurement: (name: string) => void;
  onOpenMeasurementDetails: () => void;
  onExitDrawingTool: () => void;
  onCancelCalibration: () => void;
  onCancelReferenceEdit: () => void;
  onSaveReferenceEdit: () => void;
}

function Divider() {
  return <span className={styles.divider} aria-hidden="true" />;
}

function ToolbarComposite({
  label,
  contextKind,
  drawingTool,
  children,
}: {
  label: string;
  contextKind: string;
  drawingTool?: string;
  children: ReactNode;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarFocus = useRovingFocusGroup(toolbarRef, {
    orientation: "horizontal",
    itemSelector: "button",
    suspendWhen: (root) => Boolean(root.querySelector("[data-toolbar-inline-editor]")),
  });

  return (
    <div
      ref={toolbarRef}
      {...toolbarFocus}
      className={styles.toolbar}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      data-context-kind={contextKind}
      data-drawing-tool={drawingTool}
    >
      {children}
    </div>
  );
}

function DrawingAidButton({
  label,
  icon,
  pressed,
  shortcut,
  onClick,
}: {
  label: string;
  icon: "snap" | "orthogonal";
  pressed: boolean;
  shortcut: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[styles.aidButton, pressed ? styles.pressed : ""].filter(Boolean).join(" ")}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut ?? undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      <span className={styles.aidIcon} aria-hidden="true">
        <ToolIcon name={icon} />
      </span>
      {pressed && (
        <span className={styles.pressedMark} aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}

function MeasurementNameEditor({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [nameError, setNameError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef(false);
  const errorId = useId();

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
      return;
    }
    if (!returnFocusRef.current) return;
    returnFocusRef.current = false;
    triggerRef.current?.focus({ preventScroll: true });
  }, [editing]);

  function finishEditing() {
    returnFocusRef.current = true;
    setEditing(false);
  }

  function cancelEditing() {
    setDraftName(name);
    setNameError(null);
    finishEditing();
  }

  function commitRename() {
    const normalized = normalizeMeasurementName(draftName);
    if (!normalized) {
      setNameError(MEASUREMENT_NAME_EMPTY_ERROR);
      return false;
    }
    if (normalized !== name) onRename(normalized);
    setDraftName(normalized);
    setNameError(null);
    finishEditing();
    return true;
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitRename();
  }

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={styles.measurementNameTrigger}
        aria-label={`Rename selected measurement ${name}`}
        title={`Rename ${name}`}
        onClick={() => {
          setDraftName(name);
          setNameError(null);
          setEditing(true);
        }}
      >
        <span>{name}</span>
      </button>
    );
  }

  return (
    <form
      className={styles.renameForm}
      aria-label={`Rename ${name}`}
      data-toolbar-inline-editor
      onSubmit={submitRename}
    >
      <input
        ref={inputRef}
        className={styles.renameInput}
        value={draftName}
        aria-label={`Name for ${name}`}
        aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? errorId : undefined}
        onChange={(event) => {
          setDraftName(event.target.value);
          setNameError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelEditing();
          }
        }}
      />
      {nameError && (
        <span id={errorId} className={styles.visuallyHidden} role="alert">
          {nameError}
        </span>
      )}
      <Button type="submit" className={styles.renameAction} size="compact" tabIndex={-1}>
        Save
      </Button>
      <Button
        type="button"
        className={styles.renameAction}
        variant="ghost"
        size="compact"
        tabIndex={-1}
        onClick={cancelEditing}
      >
        Cancel
      </Button>
    </form>
  );
}

export function ContextToolbar({
  selectedMeasurementId,
  selectedMeasurementName,
  selectedMeasurements,
  classificationCatalog,
  onEditSelectedMeasurements,
  onClearMeasurementSelection,
  duplicateDisabled,
  referenceEditValid,
  measurementEditActive,
  calibrationDialogOpen = false,
  onDeleteSelectedMeasurement,
  onDuplicateSelectedMeasurement,
  onRenameSelectedMeasurement,
  onOpenMeasurementDetails,
  onExitDrawingTool,
  onCancelCalibration,
  onCancelReferenceEdit,
  onSaveReferenceEdit,
}: ContextToolbarProps) {
  const {
    activeTool,
    draft,
    orthogonal,
    snap,
    calibrationFlow,
    calibrationReferenceEdit,
    measurementDetailsOpen,
    toggleOrthogonal,
    toggleSnap,
    clearDraft,
  } = useWorkspaceState();
  const { completeCurrentDraft } = useViewerInteractionCommands();

  if (calibrationReferenceEdit) {
    const referenceLabel =
      calibrationReferenceEdit.reference === "uniform"
        ? "Scale reference"
        : `${calibrationReferenceEdit.reference.toUpperCase()} reference`;
    return (
      <ToolbarComposite label="Scale reference edit controls" contextKind="reference-edit">
        <span className={styles.status} role="status">
          Editing {referenceLabel}
          {referenceEditValid
            ? " · Preview updates linked measurements"
            : " · Place a valid reference before saving"}
        </span>
        <Divider />
        <Button
          className={styles.action}
          size="compact"
          disabled={!referenceEditValid}
          disabledReason={
            !referenceEditValid ? "Place a valid reference before saving." : undefined
          }
          onClick={onSaveReferenceEdit}
        >
          Save
        </Button>
        <Button
          className={styles.action}
          variant="ghost"
          size="compact"
          onClick={onCancelReferenceEdit}
        >
          Cancel
        </Button>
      </ToolbarComposite>
    );
  }

  if (calibrationFlow && !calibrationDialogOpen) {
    const calibrationLabel =
      calibrationFlow.mode === "xy"
        ? `Calibrating ${calibrationFlow.phase.toUpperCase()} reference`
        : "Calibrating scale";
    return (
      <ToolbarComposite label="Calibration controls" contextKind="calibration">
        <span className={styles.status} role="status">
          {calibrationLabel} · Select two points
        </span>
        <Divider />
        <Button
          className={styles.action}
          variant="ghost"
          size="compact"
          onClick={onCancelCalibration}
        >
          Cancel
        </Button>
      </ToolbarComposite>
    );
  }

  if (measurementEditActive) {
    return (
      <div
        className={styles.toolbar}
        role="status"
        aria-label="Direct measurement manipulation"
        data-context-kind="direct-manipulation"
      >
        <span className={styles.status}>Editing geometry</span>
      </div>
    );
  }

  if (isMeasurementType(activeTool)) {
    const pathDraft = draft?.type === "path" && draft.measurementType === activeTool ? draft : null;
    const spec = measurementPathSpecs[activeTool];
    const showFinish = spec.maxVertices === null && pathDraft !== null;
    const canFinish = Boolean(pathDraft && pathDraft.points.length >= spec.minVertices);
    return (
      <ToolbarComposite
        label={`${spec.label} drawing controls`}
        contextKind="drawing"
        drawingTool={activeTool}
      >
        <span className={styles.toolIdentity} role="status">
          {spec.label}
        </span>
        {!pathDraft && selectedMeasurementName && (
          <MeasurementNameEditor
            key={selectedMeasurementId ?? "none"}
            name={selectedMeasurementName}
            onRename={onRenameSelectedMeasurement}
          />
        )}
        <Divider />
        <DrawingAidButton
          label="Snap"
          icon="snap"
          shortcut={getShortcutLabel("toggle-snap")}
          pressed={snap}
          onClick={toggleSnap}
        />
        <DrawingAidButton
          label="Ortho"
          icon="orthogonal"
          shortcut={getShortcutLabel("toggle-orthogonal")}
          pressed={orthogonal}
          onClick={toggleOrthogonal}
        />
        {showFinish && (
          <>
            <Divider />
            <Button
              className={`${styles.action} ${styles.finishAction}`}
              variant="ghost"
              size="compact"
              disabled={!canFinish}
              disabledReason={
                !canFinish
                  ? activeTool === "polygon"
                    ? "Add at least three vertices before finishing the polygon."
                    : "Add at least two vertices before finishing the polyline."
                  : undefined
              }
              onClick={() => {
                completeCurrentDraft();
                window.requestAnimationFrame(() => {
                  document
                    .querySelector<HTMLElement>("[data-dialog-focus-fallback]")
                    ?.focus({ preventScroll: true });
                });
              }}
            >
              Finish
            </Button>
          </>
        )}
        <Button
          className={`${styles.action} ${styles.cancelAction}`}
          variant="ghost"
          size="compact"
          onClick={() => {
            if (pathDraft) clearDraft();
            else onExitDrawingTool();
          }}
        >
          Cancel
        </Button>
      </ToolbarComposite>
    );
  }

  const selectionCount = selectedMeasurements?.length ?? (selectedMeasurementName ? 1 : 0);
  if (activeTool !== "select" || selectionCount === 0) return null;
  const allSelectedVisible = selectedMeasurements?.every((measurement) => measurement.visible) ?? false;
  const singleSelection = selectionCount === 1 && selectedMeasurementName !== null;

  return (
    <ToolbarComposite label="Selected measurement controls" contextKind="selection">
      {singleSelection ? (
        <MeasurementNameEditor
          key={selectedMeasurementId ?? "none"}
          name={selectedMeasurementName}
          onRename={onRenameSelectedMeasurement}
        />
      ) : (
        <span className={styles.status} role="status">
          {selectionCount} selected
        </span>
      )}
      <Divider />
      <Button
        className={styles.action}
        variant="secondary"
        size="compact"
        disabled={duplicateDisabled}
        onClick={onDuplicateSelectedMeasurement}
      >
        Duplicate
      </Button>
      {singleSelection && !measurementDetailsOpen && (
        <Button
          className={styles.action}
          variant="secondary"
          size="compact"
          onClick={onOpenMeasurementDetails}
        >
          Details
        </Button>
      )}
      {selectedMeasurements && onEditSelectedMeasurements && classificationCatalog && (
        <MeasurementClassificationMenu
          measurements={selectedMeasurements}
          catalog={classificationCatalog}
          onEdit={onEditSelectedMeasurements}
          triggerClassName={styles.action}
        />
      )}
      <Button
        className={styles.action}
        variant="dangerSecondary"
        size="compact"
        onClick={onDeleteSelectedMeasurement}
      >
        Delete
      </Button>
      {selectionCount >= 2 && selectedMeasurements && onEditSelectedMeasurements && (
        <IconButton
          className={styles.selectionIconButton}
          aria-label={allSelectedVisible ? "Hide selected measurements" : "Show selected measurements"}
          tooltip={allSelectedVisible ? "Hide selected measurements" : "Show selected measurements"}
          icon={
            <svg className={styles.selectionIcon} viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
              <circle cx="10" cy="10" r="2.2" />
              {!allSelectedVisible && <path d="m3.5 3.5 13 13" />}
            </svg>
          }
          onClick={() => onEditSelectedMeasurements({
            measurementIds: selectedMeasurements.map((measurement) => measurement.id),
            operation: { type: "visibility", visible: !allSelectedVisible },
          })}
        />
      )}
      {onClearMeasurementSelection && (
        <IconButton
          className={styles.selectionIconButton}
          aria-label="Clear measurement selection"
          tooltip="Clear selection"
          icon={
            <svg className={styles.selectionIcon} viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          }
          onClick={onClearMeasurementSelection}
        />
      )}
    </ToolbarComposite>
  );
}
