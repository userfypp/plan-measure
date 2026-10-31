import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CheckIcon,
  CloseIcon,
  EyeIcon,
  IconButton,
  Input,
  PlusIcon,
  SaveIcon,
  Tooltip,
  TrashIcon,
} from "../components/ui";
import { useRovingFocusGroup } from "../components/ui/rovingFocus";
import { useViewerInteractionCommands } from "../features/viewer/ViewerInteractionCommands";
import { isMeasurementType, measurementPathSpecs } from "../utils/geometry";
import type { ActionId } from "../utils/shortcuts/bindings";
import { isBlockingOverlayOpen, useShortcutHandlers } from "../utils/shortcuts/dispatcher";
import { useShortcutAria, useShortcutLabel } from "../utils/shortcuts/store";
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
  onCloseMeasurementDetails: () => void;
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
      <path d="M12.75 7.25v-2A1.75 1.75 0 0 0 11 3.5H5.25A1.75 1.75 0 0 0 3.5 5.25V11a1.75 1.75 0 0 0 1.75 1.75h2" />
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
      <path d="M10 3.5v4.75M10 11.75v4.75M3.5 10h4.75M11.75 10h4.75M8.25 8.25h3.5v3.5h-3.5z" />
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

function ShortcutButton({
  label,
  icon,
  pressed,
  disabled,
  danger,
  actionId,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  danger?: boolean;
  actionId: ActionId;
  onClick: () => void;
}) {
  const shortcut = useShortcutLabel(actionId);
  const keyShortcuts = useShortcutAria(actionId);
  return (
    <IconButton
      className={
        danger
          ? `${styles.selectionIconButton} ${styles.selectionDanger}`
          : styles.selectionIconButton
      }
      tone={danger ? "danger" : undefined}
      icon={icon}
      aria-label={label}
      aria-keyshortcuts={keyShortcuts || undefined}
      tooltip={shortcut ? `${label} (${shortcut})` : label}
      tooltipPosition="bottom"
      pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

/**
 * Renders nothing. It is mounted with the selection toolbar and given only the commands whose
 * buttons are currently shown and enabled, so each key is live exactly while its button is.
 */
function SelectionShortcuts({
  duplicate,
  details,
  visibility,
}: {
  duplicate: (() => void) | null;
  details: (() => void) | null;
  visibility: (() => void) | null;
}) {
  useShortcutHandlers((action, event) => {
    const run =
      action === "edit.duplicate"
        ? duplicate
        : action === "measurement.toggleDetails"
          ? details
          : action === "measurement.toggleVisibility"
            ? visibility
            : null;
    if (!run || isBlockingOverlayOpen()) return false;
    event.preventDefault();
    run();
    return true;
  });
  return null;
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
    <Tooltip content={`Hold Shift while drawing to constrain to a ${constraint}`} position="bottom">
      <span
        className={[styles.modifierHint, pressed ? styles.modifierHintActive : ""]
          .filter(Boolean)
          .join(" ")}
        data-active={pressed ? "true" : "false"}
      >
        <kbd>Shift</kbd> {constraint}
      </span>
    </Tooltip>
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
  const shortcut = useShortcutLabel("edit.rename");
  const keyShortcuts = useShortcutAria("edit.rename");

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

  function startEditing() {
    setDraftName(name);
    setNameError(null);
    setEditing(true);
  }

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

  // This editor is mounted only for a single selected measurement, so the key exists only then.
  useShortcutHandlers((action, event) => {
    if (action !== "edit.rename" || editing || isBlockingOverlayOpen()) return false;
    event.preventDefault();
    startEditing();
    return true;
  });

  if (!editing) {
    return (
      <Tooltip
        content={shortcut ? `Rename ${name} (${shortcut})` : `Rename ${name}`}
        position="bottom"
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.measurementNameTrigger}
          aria-label={`Rename selected measurement ${name}`}
          aria-keyshortcuts={keyShortcuts || undefined}
          onClick={startEditing}
        >
          <span>{name}</span>
        </button>
      </Tooltip>
    );
  }

  return (
    <form
      className={styles.renameForm}
      aria-label={`Rename ${name}`}
      data-toolbar-inline-editor
      onSubmit={submitRename}
    >
      <Input
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
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            commitRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelEditing();
          }
        }}
        trailing={
          <>
            <IconButton
              className={styles.selectionControlSize}
              type="submit"
              icon={<SaveIcon />}
              aria-label="Save"
              tooltip="Save"
              tooltipPosition="bottom"
              tone="primary"
              tabIndex={-1}
            />
            <IconButton
              className={styles.selectionIconButton}
              icon={<CloseIcon />}
              aria-label="Cancel"
              tooltip="Cancel"
              tooltipPosition="bottom"
              tabIndex={-1}
              onClick={cancelEditing}
            />
          </>
        }
      />
      {nameError && (
        <span id={errorId} className={styles.visuallyHidden} role="alert">
          {nameError}
        </span>
      )}
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
  onCloseMeasurementDetails,
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
        <IconButton
          className={styles.selectionControlSize}
          icon={<SaveIcon />}
          aria-label="Save"
          tooltip="Save"
          tooltipPosition="bottom"
          tone="primary"
          disabled={!referenceEditValid}
          disabledReason={
            !referenceEditValid ? "Place a valid reference before saving." : undefined
          }
          onClick={onSaveReferenceEdit}
        />
        <IconButton
          className={styles.selectionIconButton}
          icon={<CloseIcon />}
          aria-label="Cancel"
          tooltip="Cancel"
          tooltipPosition="bottom"
          onClick={onCancelReferenceEdit}
        />
      </ToolbarComposite>
    );
  }

  if (calibrationFlow && !calibrationDialogOpen) {
    const calibrationLabel =
      calibrationFlow.mode === "xy"
        ? calibrationFlow.phase === "x"
          ? "Calibrating X reference (1 of 2) · Select two points on a horizontal line"
          : "Calibrating Y reference (2 of 2) · Select two points on a vertical line"
        : "Calibrating scale · Select two points";
    return (
      <ToolbarComposite label="Calibration controls" contextKind="calibration">
        <span className={styles.status} role="status">
          {calibrationLabel}
        </span>
        <Divider />
        <IconButton
          className={styles.selectionIconButton}
          icon={<CloseIcon />}
          aria-label="Cancel"
          tooltip="Cancel"
          tooltipPosition="bottom"
          onClick={onCancelCalibration}
        />
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
        <IconButton
          className={styles.selectionIconButton}
          icon={<PlusIcon />}
          aria-label="New count"
          tooltip="New count"
          tooltipPosition="bottom"
          disabled={!count}
          onClick={onClearMeasurementSelection}
        />
        <IconButton
          className={styles.selectionIconButton}
          icon={<CheckIcon />}
          aria-label="Done"
          tooltip="Done"
          tooltipPosition="bottom"
          onClick={onExitDrawingTool}
        />
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
        {!pathDraft && selectedMeasurementName && (
          <>
            <MeasurementNameEditor
              key={selectedMeasurementId ?? "none"}
              name={selectedMeasurementName}
              onRename={onRenameSelectedMeasurement}
            />
            <Divider />
          </>
        )}
        <ShortcutButton
          label="Snap"
          icon={<SnapIcon />}
          actionId="mode.snap"
          pressed={snap}
          onClick={toggleSnap}
        />
        {activeTool !== "rectangle" && activeTool !== "ellipse" && (
          <ShortcutButton
            label="Ortho"
            icon={<OrthoIcon />}
            actionId="mode.orthogonal"
            pressed={orthogonal}
            onClick={toggleOrthogonal}
          />
        )}
        {(activeTool === "rectangle" || activeTool === "ellipse") && (
          <ShiftConstrainHint constraint={activeTool === "rectangle" ? "square" : "circle"} />
        )}
        {showFinish && (
          <>
            <Divider />
            <IconButton
              className={styles.selectionControlSize}
              icon={<CheckIcon />}
              aria-label="Finish"
              tooltip="Finish"
              tooltipPosition="bottom"
              tone="primary"
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
            />
          </>
        )}
        <Divider />
        <IconButton
          className={`${styles.selectionIconButton} ${styles.selectionDanger}`}
          icon={<DiscardPointsIcon />}
          aria-label="Discard points"
          tooltip="Discard points"
          tooltipPosition="bottom"
          tone="danger"
          disabled={!pathDraft}
          disabledReason="No points placed yet."
          onClick={clearDraft}
        />
      </ToolbarComposite>
    );
  }

  const selectionCount = selectedMeasurements?.length ?? (selectedMeasurementName ? 1 : 0);
  if (activeTool !== "select" || selectionCount === 0) return null;
  const allSelectedVisible =
    selectedMeasurements?.every((measurement) => measurement.visible) ?? false;
  const singleSelection = selectionCount === 1 && selectedMeasurementName !== null;
  const toggleSelectedVisibility =
    selectionCount >= 2 && selectedMeasurements && onEditSelectedMeasurements
      ? () =>
          onEditSelectedMeasurements({
            measurementIds: selectedMeasurements.map((measurement) => measurement.id),
            operation: { type: "visibility", visible: !allSelectedVisible },
          })
      : null;

  return (
    <ToolbarComposite label="Selected measurement controls" contextKind="selection">
      <SelectionShortcuts
        duplicate={duplicateDisabled ? null : onDuplicateSelectedMeasurement}
        details={
          singleSelection
            ? measurementDetailsOpen
              ? onCloseMeasurementDetails
              : onOpenMeasurementDetails
            : null
        }
        visibility={toggleSelectedVisibility}
      />
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
          tooltipPosition="bottom"
          icon={<AddItemsIcon />}
          disabled={Boolean(addCountItemsDisabledReason)}
          disabledReason={addCountItemsDisabledReason}
          onClick={onAddCountItems}
        />
      )}
      <ShortcutButton
        label="Duplicate"
        icon={<DuplicateIcon />}
        actionId="edit.duplicate"
        disabled={duplicateDisabled}
        onClick={onDuplicateSelectedMeasurement}
      />
      {singleSelection && !measurementDetailsOpen && (
        <ShortcutButton
          label="Details"
          icon={<DetailsIcon />}
          actionId="measurement.toggleDetails"
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
      <ShortcutButton
        danger
        label="Delete"
        actionId="edit.delete"
        icon={<TrashIcon />}
        onClick={onDeleteSelectedMeasurement}
      />
      {toggleSelectedVisibility && (
        <ShortcutButton
          label={allSelectedVisible ? "Hide selected measurements" : "Show selected measurements"}
          actionId="measurement.toggleVisibility"
          icon={
            <EyeIcon
              className={styles.selectionIcon}
              state={allSelectedVisible ? "visible" : "hidden"}
            />
          }
          onClick={toggleSelectedVisibility}
        />
      )}
      {onClearMeasurementSelection && (
        <IconButton
          className={styles.selectionIconButton}
          aria-label="Clear selection"
          tooltip="Clear selection"
          tooltipPosition="bottom"
          icon={<CloseIcon />}
          onClick={onClearMeasurementSelection}
        />
      )}
    </ToolbarComposite>
  );
}
