import { useId, useState, type Ref } from "react";
import type { Measurement } from "../../types/domain";
import styles from "./PdfViewer.module.css";

export function KeyboardGeometryHelp({
  editing,
  measurement,
  target,
  onTargetChange,
  onReturnToViewer,
  helpRef,
  referenceEditing = false,
  hidden = false,
}: {
  editing: boolean;
  measurement: Measurement | null;
  target: number;
  onTargetChange: (target: number) => void;
  onReturnToViewer: () => void;
  helpRef: Ref<HTMLDivElement>;
  referenceEditing?: boolean;
  hidden?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const titleId = useId();
  const targetId = useId();
  if (dismissed || hidden) return null;
  return (
    <div
      ref={helpRef}
      className={styles.keyboardFeedback}
      data-keyboard-controls
      role="region"
      aria-labelledby={titleId}
    >
      <strong id={titleId}>
        {referenceEditing
          ? "Keyboard reference editing"
          : editing
            ? "Keyboard editing"
            : "Keyboard drawing and editing"}
      </strong>
      <button
        type="button"
        aria-label="Dismiss keyboard help"
        onClick={() => {
          setDismissed(true);
          onReturnToViewer();
        }}
      >
        Dismiss
      </button>
      <div className={styles.keyboardFeedbackCopy}>
        <p>
          <kbd>Arrows</kbd> Move precisely · <kbd>Shift</kbd> Move faster
        </p>
        <p className={styles.keyboardHint}>Hold an arrow key to accelerate.</p>
        {editing || referenceEditing ? (
          <>
            {measurement || referenceEditing ? (
              <label className={styles.keyboardTarget} htmlFor={targetId}>
                <span className={styles.keyboardMeasurementName} title={measurement?.name}>
                  {referenceEditing ? "Edit reference point" : `Edit ${measurement!.name}`}
                </span>
                <select
                  id={targetId}
                  value={target}
                  onChange={(event) => {
                    onTargetChange(Number(event.target.value));
                    onReturnToViewer();
                  }}
                >
                  {referenceEditing ? (
                    <>
                      <option value={0}>Start point</option>
                      <option value={1}>End point</option>
                    </>
                  ) : (
                    <>
                      <option value={-1}>Whole measurement</option>
                      {measurement!.points.map((_, index) => (
                        <option key={index} value={index}>
                          Vertex {index + 1} of {measurement!.points.length}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
            ) : (
              <p>Moving all selected measurements together.</p>
            )}
            {(measurement || referenceEditing) && (
              <p>
                <kbd>N</kbd>: next point · <kbd>Shift+N</kbd>: previous
              </p>
            )}
            <p>
              <kbd>Arrows</kbd> Preview · <kbd>Enter</kbd> Save · <kbd>Esc</kbd> Cancel
            </p>
          </>
        ) : (
          <>
            <p>
              <kbd>Space</kbd> Place point / select
            </p>
            <p>
              <kbd>Shift+Space</kbd> Add to selection
            </p>
            <p>
              <kbd>Enter</kbd> Finish path · <kbd>Esc</kbd> Cancel
            </p>
            <p className={styles.keyboardHint}>
              To edit: select a measurement, press <kbd>E</kbd>, then choose a vertex or the whole
              measurement.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
