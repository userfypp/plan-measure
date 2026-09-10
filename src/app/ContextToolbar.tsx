import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "../components/ui";
import { ToolIcon } from "../features/viewer/ToolIcon";
import { useViewerInteractionCommands } from "../features/viewer/ViewerInteractionCommands";
import { isMeasurementType, measurementPathSpecs } from "../utils/geometry";
import { getShortcutLabel } from "../utils/keyboard";
import { useWorkspaceState } from "./workspaceState";
import styles from "./ContextToolbar.module.css";

export interface ContextToolbarProps {
  selectedMeasurementName: string | null;
  duplicateDisabled: boolean;
  referenceEditValid: boolean;
  measurementEditActive: boolean;
  onDuplicateSelectedMeasurement: () => void;
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
  const rovingButtonRef = useRef<HTMLButtonElement | null>(null);

  function toolbarButtons(): HTMLButtonElement[] {
    return Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  }

  function setRovingButton(button: HTMLButtonElement) {
    for (const candidate of toolbarButtons()) candidate.tabIndex = candidate === button ? 0 : -1;
    rovingButtonRef.current = button;
  }

  useLayoutEffect(() => {
    const buttons = toolbarButtons();
    const enabledButtons = buttons.filter((button) => !button.disabled);
    const focused =
      document.activeElement instanceof HTMLButtonElement &&
      toolbarRef.current?.contains(document.activeElement) &&
      !document.activeElement.disabled
        ? document.activeElement
        : null;
    const remembered =
      rovingButtonRef.current &&
      toolbarRef.current?.contains(rovingButtonRef.current) &&
      !rovingButtonRef.current.disabled
        ? rovingButtonRef.current
        : null;
    const nextRoving = focused ?? remembered ?? enabledButtons[0] ?? null;

    for (const button of buttons) button.tabIndex = button === nextRoving ? 0 : -1;
    rovingButtonRef.current = nextRoving;
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = toolbarButtons().filter((button) => !button.disabled);
    if (buttons.length === 0) return;
    const currentIndex = buttons.findIndex((button) => button === document.activeElement);
    if (currentIndex < 0) return;

    const nextButton =
      event.key === "Home"
        ? buttons[0]
        : event.key === "End"
          ? buttons[buttons.length - 1]
          : buttons[
              (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                buttons.length
            ];
    if (!nextButton) return;
    event.preventDefault();
    setRovingButton(nextButton);
    nextButton.focus();
  }

  return (
    <div
      ref={toolbarRef}
      className={styles.toolbar}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      data-context-kind={contextKind}
      data-drawing-tool={drawingTool}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLButtonElement && !event.target.disabled) {
          setRovingButton(event.target);
        }
      }}
      onKeyDown={handleKeyDown}
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

export function ContextToolbar({
  selectedMeasurementName,
  duplicateDisabled,
  referenceEditValid,
  measurementEditActive,
  onDuplicateSelectedMeasurement,
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

  if (calibrationFlow) {
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
    const pathDraft =
      draft?.type === "path" && draft.measurementType === activeTool ? draft : null;
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

  if (activeTool !== "select" || !selectedMeasurementName) return null;

  return (
    <ToolbarComposite label="Selected measurement controls" contextKind="selection">
      <span className={styles.selectionIdentity} role="status" title={selectedMeasurementName}>
        {selectedMeasurementName}
      </span>
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
      {!measurementDetailsOpen && (
        <Button
          className={styles.action}
          variant="secondary"
          size="compact"
          onClick={onOpenMeasurementDetails}
        >
          Details
        </Button>
      )}
    </ToolbarComposite>
  );
}
