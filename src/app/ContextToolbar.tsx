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
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Scale reference edit controls"
        data-context-kind="reference-edit"
      >
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
      </div>
    );
  }

  if (calibrationFlow) {
    const calibrationLabel =
      calibrationFlow.mode === "xy"
        ? `Calibrating ${calibrationFlow.phase.toUpperCase()} reference`
        : "Calibrating scale";
    return (
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Calibration controls"
        data-context-kind="calibration"
      >
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
      </div>
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
    const finishRequirementId = `drawing-finish-requirement-${activeTool}`;
    return (
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label={`${spec.label} drawing controls`}
        data-context-kind="drawing"
        data-drawing-tool={activeTool}
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
              aria-describedby={!canFinish ? finishRequirementId : undefined}
              onClick={completeCurrentDraft}
            >
              Finish
            </Button>
            {!canFinish && (
              <span id={finishRequirementId} className={styles.visuallyHidden}>
                {activeTool === "polygon"
                  ? "Add at least three vertices before finishing the polygon."
                  : "Add at least two vertices before finishing the polyline."}
              </span>
            )}
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
      </div>
    );
  }

  if (activeTool !== "select" || !selectedMeasurementName) return null;

  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="Selected measurement controls"
      data-context-kind="selection"
    >
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
    </div>
  );
}
