import { useState, useSyncExternalStore } from "react";
import { useSessionState } from "../../app/sessionState";
import { useWorkspaceState } from "../../app/workspaceState";
import { Button } from "../../components/ui";
import { CalibrationDialog } from "./CalibrationDialog";
import type { ScaleCheckStore } from "./scaleCheckState";
import { formatScaleCheckResult, scaleCheckResult } from "./scaleCheck";
import styles from "./ScaleCheckPanel.module.css";
import viewerStyles from "../../app/ViewerShell.module.css";

export function ScaleCheckPanel({ store }: { store: ScaleCheckStore }) {
  const check = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { session } = useSessionState();
  const { workspaceVersion, clearDraft, chooseTool } = useWorkspaceState();
  const [error, setError] = useState<{ check: object; message: string } | null>(null);
  const page = session?.pages[session.currentPage];
  const valid = Boolean(
    check &&
    page &&
    check.pageNumber === page.pageNumber &&
    check.activeCalibrationId === page.activeCalibrationId &&
    check.workspaceVersion === workspaceVersion &&
    page.calibrations.includes(check.calibration),
  );
  function cancel() {
    store.clear();
    clearDraft();
    chooseTool("select");
    document
      .querySelector<HTMLElement>("[data-dialog-focus-fallback]")
      ?.focus({ preventScroll: true });
  }
  const resultMm =
    check?.points && check.referenceDistanceMm !== null && valid && session
      ? scaleCheckResult(check.points, check.calibration, check.referenceDistanceMm)
      : null;
  const result =
    resultMm && session
      ? formatScaleCheckResult(
          resultMm,
          session.settings.displayUnit,
          session.settings.measurementDecimalPlaces,
        )
      : null;
  function content() {
    if (!check || !valid || !session) return null;
    if (!check.points)
      return (
        <div className={`${viewerStyles.viewerOverlay} ${styles.checkOverlay}`}>
          <div className={styles.checkControls} role="group" aria-label="Check scale controls">
            <div className={styles.instructions}>
              <strong>Select two points</strong>
              <span title={check.calibration.name}>Checking {check.calibration.name}</span>
            </div>
            <Button variant="ghost" size="compact" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      );
    if (check.referenceDistanceMm === null)
      return (
        <CalibrationDialog
          initialName={check.calibration.name}
          title="Check scale"
          includeName={false}
          distanceLabel="Known distance"
          confirmLabel="Check scale"
          confirmationError={error?.check === check ? error.message : null}
          onCancel={cancel}
          onConfirm={({ referenceDistanceMm }) => {
            try {
              scaleCheckResult(check.points!, check.calibration, referenceDistanceMm);
              setError(null);
              store.complete(referenceDistanceMm);
            } catch (cause) {
              setError({
                check,
                message:
                  cause instanceof Error
                    ? cause.message
                    : "Enter a valid distance that is not excessively large.",
              });
            }
          }}
        />
      );
    return (
      <div
        className={styles.checkResult}
        role="group"
        aria-label={`Scale check: ${check.calibration.name}`}
      >
        <div className={styles.resultHeader}>
          <div className={styles.resultIdentity}>
            <h3>Scale check</h3>
            <p className={styles.scaleName} title={check.calibration.name}>{check.calibration.name}</p>
          </div>
          <Button variant="ghost" size="compact" className={styles.dismissButton} onClick={cancel} autoFocus>
            Dismiss
          </Button>
        </div>
        <dl className={styles.comparison}>
          <div>
            <dt>Measured distance</dt>
            <dd>{result!.measured}</dd>
          </div>
          <div>
            <dt>Known distance</dt>
            <dd>{result!.real}</dd>
          </div>
        </dl>
        <dl className={styles.differences}>
          <div>
            <dt>Difference</dt>
            <dd>{result!.difference}</dd>
          </div>
          <div>
            <dt>Relative difference</dt>
            <dd className={resultMm!.percentageDifference === null ? styles.unavailable : undefined}>
              {result!.percentage}
            </dd>
          </div>
        </dl>
        <p className={styles.resultNote}>Measured − known; percentage relative to known.</p>
      </div>
    );
  }
  return (
    <>
      <div className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">
        {result
          ? `Measured distance: ${result.measured}. Real distance: ${result.real}. Difference (measured − real): ${result.difference}. Percentage difference (relative to real): ${result.percentage}`
          : ""}
      </div>
      {check?.points && valid && check.referenceDistanceMm === null ? (
        <div
          className={viewerStyles.viewerInteractionShield}
          data-layout-slot="scale-check-interaction-shield"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
        >
          <div className={`${viewerStyles.viewerOverlay} ${styles.checkOverlay}`}>{content()}</div>
        </div>
      ) : check?.points && valid ? (
        <div className={`${viewerStyles.viewerOverlay} ${styles.checkOverlay} ${styles.resultOverlay}`}>{content()}</div>
      ) : (
        content()
      )}
    </>
  );
}
