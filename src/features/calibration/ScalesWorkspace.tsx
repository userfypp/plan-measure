import { useState } from "react";
import { AnchoredMenu, Button } from "../../components/ui";
import type { CalibrationReferenceKey, PageCalibration, PageState } from "../../types/domain";
import { formatDisplayNumber } from "../../utils/format";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { useWorkspaceDrawerPresentation } from "../../app/WorkspaceDrawerContext";
import styles from "./ScalesWorkspace.module.css";

export interface ScalesWorkspaceProps {
  page: PageState;
  actionsDisabled?: boolean;
  onAddScale: (mode: "uniform" | "xy") => void;
  onRecalibrate: (calibrationId: string) => void;
  onEditReference: (calibration: PageCalibration, reference: CalibrationReferenceKey) => void;
}

function formatReferenceDistance(millimetres: number): string {
  return millimetres >= 1000
    ? `${formatDisplayNumber(millimetres / 1000)} m`
    : `${formatDisplayNumber(millimetres)} mm`;
}

function ScaleOptionLabel({ mode }: { mode: "uniform" | "xy" }) {
  return (
    <span className={styles.addOptionLabel}>
      <strong>{mode === "uniform" ? "Uniform" : "X/Y"}</strong>
      <span>{mode === "uniform" ? "One reference" : "Separate X and Y references"}</span>
    </span>
  );
}

function DisclosureIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
      <path d="m7 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ScalesWorkspace({
  page,
  actionsDisabled = false,
  onAddScale,
  onRecalibrate,
  onEditReference,
}: ScalesWorkspaceProps) {
  const workspace = useWorkspaceDrawerPresentation();
  const [inspectedScaleId, setInspectedScaleId] = useState<string | null>(null);
  const precisionActionsDisabled = !workspace.precisionActionAvailable;
  const precisionDisabledReason = workspace.precisionDisabledReason;
  const spatialActionsDisabled = actionsDisabled || precisionActionsDisabled;
  const spatialDisabledReason = actionsDisabled
    ? "Finish or cancel the current scale workflow first."
    : precisionDisabledReason;
  const disabledReasonId = "scale-spatial-actions-disabled-reason";

  return (
    <section className={styles.workspace} aria-label="Scales on current page">
      <div className={styles.list} role="list" aria-label="Page scales">
        {page.calibrations.length === 0 && (
          <p className={styles.empty}>Add a scale to begin measuring.</p>
        )}
        {page.calibrations.map((calibration) => {
          const metadata = scaleDisplayMetadata(calibration);
          const active = calibration.id === page.activeCalibrationId;
          const inspected = inspectedScaleId === calibration.id;
          const detailId = `scale-details-${calibration.id}`;
          return (
            <article
              key={calibration.id}
              className={[styles.scaleRow, active ? styles.active : "", inspected ? styles.inspected : ""]
                .filter(Boolean)
                .join(" ")}
              role="listitem"
            >
              <div className={styles.scaleSummary}>
                <span className={styles.scaleIdentity}>
                  <strong title={calibration.name}>{calibration.name}</strong>
                  <span>{metadata.detailLabel}</span>
                </span>
                {active && <span className={styles.activeLabel}>Active</span>}
                <Button
                  variant="ghost"
                  size="compact"
                  className={styles.disclosureButton}
                  aria-label={`${inspected ? "Collapse" : "Expand"} scale ${calibration.name}${active ? ", active" : ""}`}
                  aria-expanded={inspected}
                  aria-controls={detailId}
                  title={`${inspected ? "Collapse" : "Expand"} ${calibration.name}`}
                  onClick={() => setInspectedScaleId(inspected ? null : calibration.id)}
                >
                  <DisclosureIcon />
                </Button>
              </div>
              <div id={detailId} className={styles.scaleDetails} hidden={!inspected}>
                <div className={styles.references}>
                  {calibration.mode === "uniform" ? (
                    <div className={styles.referenceRow}>
                      <span className={styles.referenceLabel}>Reference</span>
                      <strong>{formatReferenceDistance(calibration.referenceDistanceMm)}</strong>
                    </div>
                  ) : (
                    <>
                      <div className={styles.referenceRow}>
                        <span className={styles.referenceLabel}>X reference</span>
                        <strong>{formatReferenceDistance(calibration.xReference.referenceDistanceMm)}</strong>
                      </div>
                      <div className={styles.referenceRow}>
                        <span className={styles.referenceLabel}>Y reference</span>
                        <strong>{formatReferenceDistance(calibration.yReference.referenceDistanceMm)}</strong>
                      </div>
                    </>
                  )}
                </div>
                <div className={styles.scaleActions}>
                  <Button
                    variant="ghost"
                    size="compact"
                    disabled={spatialActionsDisabled}
                    disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                    onClick={() =>
                      workspace.requestPrecisionAuthoring(() => onRecalibrate(calibration.id))
                    }
                  >
                    Recalibrate
                  </Button>
                  {calibration.mode === "uniform" ? (
                    <Button
                      variant="ghost"
                      size="compact"
                      disabled={spatialActionsDisabled}
                      disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                      onClick={() =>
                        workspace.requestPrecisionAuthoring(() =>
                          onEditReference(calibration, "uniform"),
                        )
                      }
                    >
                      Edit reference
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="compact"
                        disabled={spatialActionsDisabled}
                        disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                        onClick={() =>
                          workspace.requestPrecisionAuthoring(() =>
                            onEditReference(calibration, "x"),
                          )
                        }
                      >
                        Edit X
                      </Button>
                      <Button
                        variant="ghost"
                        size="compact"
                        disabled={spatialActionsDisabled}
                        disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                        onClick={() =>
                          workspace.requestPrecisionAuthoring(() =>
                            onEditReference(calibration, "y"),
                          )
                        }
                      >
                        Edit Y
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.addScale}>
        <AnchoredMenu
          trigger={<span>+ Add scale</span>}
          triggerProps={{
            className: styles.addScaleTrigger,
            "aria-label": "Add scale",
            "aria-describedby": actionsDisabled ? disabledReasonId : undefined,
            "aria-disabled": actionsDisabled || undefined,
            title: actionsDisabled ? spatialDisabledReason : undefined,
            onClick: (event) => {
              if (actionsDisabled) event.preventDefault();
            },
          }}
          label="Add scale"
          items={[
            {
              id: "uniform",
              label: (
                <>
                  <ScaleOptionLabel mode="uniform" />
                  {precisionActionsDisabled && (
                    <span className={styles.visuallyHidden}>{precisionDisabledReason}</span>
                  )}
                </>
              ),
              disabled: precisionActionsDisabled,
              onSelect: () => workspace.requestPrecisionAuthoring(() => onAddScale("uniform")),
            },
            {
              id: "xy",
              label: (
                <>
                  <ScaleOptionLabel mode="xy" />
                  {precisionActionsDisabled && (
                    <span className={styles.visuallyHidden}>{precisionDisabledReason}</span>
                  )}
                </>
              ),
              disabled: precisionActionsDisabled,
              onSelect: () => workspace.requestPrecisionAuthoring(() => onAddScale("xy")),
            },
          ]}
          placement="bottom-start"
        />
      </div>

      {spatialActionsDisabled && (
        <p id={disabledReasonId} className={styles.visuallyHidden}>
          {spatialDisabledReason}
        </p>
      )}

      <p className={styles.note}>Changing the active scale does not relink measurements.</p>
    </section>
  );
}
