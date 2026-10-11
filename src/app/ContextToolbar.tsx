import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, IconButton } from "../components/ui";
import { useRovingFocusGroup } from "../components/ui/rovingFocus";
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
  onAddCountItems?: () => void;
  addCountItemsDisabledReason?: string;
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

function SelectionSvg({ children }: { children: ReactNode }) {
  return (
    <svg className={styles.selectionIcon} viewBox="0 0 20 20" aria-hidden="true">
      {children}
    </svg>
  );
}

function AddItemsIcon() {
  return (
    <SelectionSvg>
      <circle cx="7.75" cy="7.75" r="3.25" />
      <path d="M14 11.25v5.5M11.25 14h5.5" />
    </SelectionSvg>
  );
}

function DuplicateIcon() {
  return (
    <SelectionSvg>
      <rect x="7.25" y="7.25" width="9.25" height="9.25" rx="1.75" />
      <path d="M12.75 7.25V4.75a1.5 1.5 0 0 0-1.5-1.5h-6.5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 1.5 1.5h2.5" />
    </SelectionSvg>
  );
}

function DetailsIcon() {
  return (
    <SelectionSvg>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9.25v4.25M10 6.75h.01" />
    </SelectionSvg>
  );
}

function DeleteIcon() {
  return (
    <SelectionSvg>
      <path d="M3.75 5.5h12.5M7.75 5.5V4a1.25 1.25 0 0 1 1.25-1.25h2A1.25 1.25 0 0 1 12.25 4v1.5M5.25 5.5l.7 9.9a1.75 1.75 0 0 0 1.75 1.6h4.6a1.75 1.75 0 0 0 1.75-1.6l.7-9.9M8.5 9v4.5M11.5 9v4.5" />
    </SelectionSvg>
  );
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

function SnapIcon() {
  return (
    <SelectionSvg>
      <path d="M4.75 3.25h3.5v7.5a1.75 1.75 0 0 0 3.5 0v-7.5h3.5v7.5a5.25 5.25 0 0 1-10.5 0zM4.75 6.75h3.5M11.75 6.75h3.5" />
    </SelectionSvg>
  );
}

function OrthoIcon() {
  return (
    <SelectionSvg>
      <path d="M4.5 3.75v11.75h11.75M4.5 11.25h4.25v4.25" />
    </SelectionSvg>
  );
}

function SelectToolIcon() {
  return (
    <SelectionSvg>
      <path d="M5.25 3.75v11.5l3-3 2.25 4.25 1.75-.9-2.2-4.1h4.2z" />
    </SelectionSvg>
  );
}

function DiscardPointsIcon() {
  return (
    <SelectionSvg>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
    </SelectionSvg>
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
  icon: ReactNode;
  pressed: boolean;
  shortcut: string | null;
  onClick: () => void;
}) {
  return (
    <IconButton
      className={styles.selectionIconButton}
      icon={icon}
      aria-label={label}
      aria-keyshortcuts={shortcut ?? undefined}
      tooltip={shortcut ? `${label} (${shortcut})` : label}
      pressed={pressed}
      onClick={onClick}
    />
  );
}

/** Live Shift state, cleared on window blur so a missed keyup never leaves it stuck. */
function useShiftPressed(): boolean {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Shift") setPressed(event.type === "keydown");
    };
    const onBlur = () => setPressed(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return pressed;
}

function ShiftConstrainHint({ constraint }: { constraint: "square" | "circle" }) {
  const pressed = useShiftPressed();
  return (
    <span
      className={[styles.modifierHint, pressed ? styles.modifierHintActive : ""]
        .filter(Boolean)
        .join(" ")}
      data-active={pressed ? "true" : "false"}
      title={`Hold Shift while drawing to constrain to a ${constraint}`}
    >
      <kbd>Shift</kbd> {constraint}
    </span>
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
  onAddCountItems,
  addCountItemsDisabledReason,
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

  if (activeTool === "count") {
    const count =
      selectedMeasurements?.length === 1 &&
      selectedMeasurements[0]?.type === "count" &&
      selectedMeasurements[0].visible
        ? selectedMeasurements[0]
        : null;
    return (
      <ToolbarComposite label="Count drawing controls" contextKind="drawing" drawingTool="count">
        <span className={styles.toolIdentity} role="status">
          {count ? "Click to add items" : "Click to start a count"}
        </span>
        {count && (
          <MeasurementNameEditor
            key={count.id}
            name={count.name}
            onRename={onRenameSelectedMeasurement}
          />
        )}
        <Divider />
        <Button
          className={styles.action}
          variant="ghost"
          size="compact"
          disabled={!count}
          onClick={onClearMeasurementSelection}
        >
          New count
        </Button>
        <Button
          className={styles.action}
          variant="ghost"
          size="compact"
          onClick={onExitDrawingTool}
        >
          Done
        </Button>
      </ToolbarComposite>
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
          icon={<SnapIcon />}
          shortcut={getShortcutLabel("toggle-snap")}
          pressed={snap}
          onClick={toggleSnap}
        />
        <DrawingAidButton
          label="Ortho"
          icon={<OrthoIcon />}
          shortcut={getShortcutLabel("toggle-orthogonal")}
          pressed={orthogonal}
          onClick={toggleOrthogonal}
        />
        {(activeTool === "rectangle" || activeTool === "ellipse") && (
          <ShiftConstrainHint constraint={activeTool === "rectangle" ? "square" : "circle"} />
        )}
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
                    : activeTool === "polyline"
                      ? "Add at least two vertices before finishing the polyline."
                      : spec.authoring === "box"
                        ? `Click the opposite corner to finish the ${spec.label.toLowerCase()}.`
                        : `Add at least ${spec.minVertices} vertices before finishing the ${spec.label.toLowerCase()}.`
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
        <Divider />
        <IconButton
          className={`${styles.selectionIconButton} ${styles.selectionDanger}`}
          icon={<DiscardPointsIcon />}
          aria-label="Discard points"
          tooltip="Discard points"
          tone="danger"
          disabled={!pathDraft}
          disabledReason="No points placed yet."
          onClick={clearDraft}
        />
        <IconButton
          className={styles.selectionIconButton}
          icon={<SelectToolIcon />}
          aria-label="Back to Select"
          tooltip="Back to Select"
          onClick={onExitDrawingTool}
        />
      </ToolbarComposite>
    );
  }

  const selectionCount = selectedMeasurements?.length ?? (selectedMeasurementName ? 1 : 0);
  if (activeTool !== "select" || selectionCount === 0) return null;
  const allSelectedVisible =
    selectedMeasurements?.every((measurement) => measurement.visible) ?? false;
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
      {singleSelection && selectedMeasurements?.[0]?.type === "count" && onAddCountItems && (
        <IconButton
          className={styles.selectionIconButton}
          aria-label="Add items"
          tooltip="Add items"
          icon={<AddItemsIcon />}
          disabled={Boolean(addCountItemsDisabledReason)}
          disabledReason={addCountItemsDisabledReason}
          onClick={onAddCountItems}
        />
      )}
      <IconButton
        className={styles.selectionIconButton}
        aria-label="Duplicate"
        tooltip="Duplicate"
        icon={<DuplicateIcon />}
        disabled={duplicateDisabled}
        onClick={onDuplicateSelectedMeasurement}
      />
      {singleSelection && !measurementDetailsOpen && (
        <IconButton
          className={styles.selectionIconButton}
          aria-label="Details"
          tooltip="Details"
          icon={<DetailsIcon />}
          onClick={onOpenMeasurementDetails}
        />
      )}
      {selectedMeasurements && onEditSelectedMeasurements && classificationCatalog && (
        <MeasurementClassificationMenu
          measurements={selectedMeasurements}
          catalog={classificationCatalog}
          onEdit={onEditSelectedMeasurements}
          triggerClassName={styles.selectionIconButton}
          iconOnly
        />
      )}
      <Divider />
      <IconButton
        className={`${styles.selectionIconButton} ${styles.selectionDanger}`}
        tone="danger"
        aria-label="Delete"
        tooltip="Delete"
        icon={<DeleteIcon />}
        onClick={onDeleteSelectedMeasurement}
      />
      {selectionCount >= 2 && selectedMeasurements && onEditSelectedMeasurements && (
        <IconButton
          className={styles.selectionIconButton}
          aria-label={
            allSelectedVisible ? "Hide selected measurements" : "Show selected measurements"
          }
          tooltip={allSelectedVisible ? "Hide selected measurements" : "Show selected measurements"}
          icon={
            <svg className={styles.selectionIcon} viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
              <circle cx="10" cy="10" r="2.2" />
              {!allSelectedVisible && <path d="m3.5 3.5 13 13" />}
            </svg>
          }
          onClick={() =>
            onEditSelectedMeasurements({
              measurementIds: selectedMeasurements.map((measurement) => measurement.id),
              operation: { type: "visibility", visible: !allSelectedVisible },
            })
          }
        />
      )}
      {onClearMeasurementSelection && (
        <IconButton
          className={styles.selectionIconButton}
          aria-label="Clear measurement selection"
          tooltip="Clear selection"
          icon={
            <svg className={styles.selectionIcon} viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
            </svg>
          }
          onClick={onClearMeasurementSelection}
        />
      )}
    </ToolbarComposite>
  );
}
