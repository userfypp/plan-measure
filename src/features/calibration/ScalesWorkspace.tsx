import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { AnchoredMenu, Button, Input } from "../../components/ui";
import type { CalibrationReferenceKey, PageCalibration, PageState } from "../../types/domain";
import { formatDisplayNumber } from "../../utils/format";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { useWorkspaceDrawerPresentation } from "../../app/WorkspaceDrawerContext";
import {
  STANDARD_SCALE_PRESET_RATIOS,
  type StandardScalePresetRatio,
} from "./standardScalePresets";
import styles from "./ScalesWorkspace.module.css";

export interface ScalesWorkspaceProps {
  page: PageState;
  actionsDisabled?: boolean;
  onAddScale: (mode: "uniform" | "xy") => void;
  onAddPresetScale: (ratio: StandardScalePresetRatio) => void;
  onRenameScale: (calibrationId: string, name: string) => void;
  onRecalibrate: (calibrationId: string) => void;
  onEditReference: (calibration: PageCalibration, reference: CalibrationReferenceKey) => void;
}

interface RenameState {
  calibrationId: string;
  draftName: string;
  error: string | null;
}

const WORKFLOW_DISABLED_REASON = "Finish or cancel the current scale workflow first.";
const EMPTY_SCALE_NAME_ERROR = "Scale name cannot be empty.";

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

function PresetScaleOptionLabel({ ratio }: { ratio: StandardScalePresetRatio }) {
  return (
    <span className={styles.addOptionLabel}>
      <strong>1:{ratio}</strong>
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
  onAddPresetScale,
  onRenameScale,
  onRecalibrate,
  onEditReference,
}: ScalesWorkspaceProps) {
  const workspace = useWorkspaceDrawerPresentation();
  const [inspectedScaleId, setInspectedScaleId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const renameTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusScaleIdRef = useRef<string | null>(null);
  const precisionActionsDisabled = !workspace.precisionActionAvailable;
  const precisionDisabledReason = workspace.precisionDisabledReason;
  const spatialActionsDisabled = actionsDisabled || precisionActionsDisabled;
  const spatialDisabledReason = actionsDisabled
    ? WORKFLOW_DISABLED_REASON
    : precisionDisabledReason;
  const disabledReasonId = "scale-spatial-actions-disabled-reason";

  useLayoutEffect(() => {
    if (renameState) return;
    const scaleId = returnFocusScaleIdRef.current;
    if (!scaleId) return;
    returnFocusScaleIdRef.current = null;
    renameTriggerRefs.current.get(scaleId)?.focus({ preventScroll: true });
  }, [renameState]);

  function discardRename() {
    returnFocusScaleIdRef.current = null;
    setRenameState(null);
  }

  function cancelRename(calibrationId: string) {
    returnFocusScaleIdRef.current = calibrationId;
    setRenameState(null);
  }

  function commitRename(calibration: PageCalibration) {
    if (!renameState || renameState.calibrationId !== calibration.id || actionsDisabled) return false;
    const normalizedName = renameState.draftName.trim();
    if (!normalizedName) {
      setRenameState({ ...renameState, error: EMPTY_SCALE_NAME_ERROR });
      return false;
    }
    if (normalizedName !== calibration.name) onRenameScale(calibration.id, normalizedName);
    returnFocusScaleIdRef.current = calibration.id;
    setRenameState(null);
    return true;
  }

  function submitRename(event: FormEvent<HTMLFormElement>, calibration: PageCalibration) {
    event.preventDefault();
    commitRename(calibration);
  }

  function toggleScale(calibrationId: string, inspected: boolean) {
    discardRename();
    setInspectedScaleId(inspected ? null : calibrationId);
  }

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
                  onClick={() => toggleScale(calibration.id, inspected)}
                >
                  <DisclosureIcon />
                </Button>
              </div>
              <div id={detailId} className={styles.scaleDetails} hidden={!inspected}>
                <section className={styles.detailSection} aria-label="Identity">
                  <span className={styles.sectionLabel}>Identity</span>
                  {renameState?.calibrationId === calibration.id ? (
                    <form
                      className={styles.renameForm}
                      onSubmit={(event) => submitRename(event, calibration)}
                    >
                      <span className={styles.fieldLabel}>Scale name</span>
                      <Input
                        aria-label="Scale name"
                        value={renameState.draftName}
                        error={renameState.error}
                        autoFocus
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          setRenameState({
                            calibrationId: calibration.id,
                            draftName: event.target.value,
                            error: null,
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitRename(calibration);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelRename(calibration.id);
                          }
                        }}
                      />
                      <div className={styles.renameActions}>
                        <Button
                          variant="ghost"
                          size="compact"
                          onClick={() => cancelRename(calibration.id)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="secondary"
                          size="compact"
                          disabled={actionsDisabled}
                          disabledReason={actionsDisabled ? WORKFLOW_DISABLED_REASON : undefined}
                        >
                          Save
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className={styles.identityField}>
                      <span className={styles.fieldLabel}>Scale name</span>
                      <div className={styles.identityValueRow}>
                        <strong className={styles.scaleNameValue} title={calibration.name}>
                          {calibration.name}
                        </strong>
                        <Button
                          ref={(node) => {
                            if (node) renameTriggerRefs.current.set(calibration.id, node);
                            else renameTriggerRefs.current.delete(calibration.id);
                          }}
                          variant="ghost"
                          size="compact"
                          aria-label={`Rename scale ${calibration.name}`}
                          disabled={actionsDisabled}
                          disabledReason={actionsDisabled ? WORKFLOW_DISABLED_REASON : undefined}
                          onClick={() =>
                            setRenameState({
                              calibrationId: calibration.id,
                              draftName: calibration.name,
                              error: null,
                            })
                          }
                        >
                          Rename
                        </Button>
                      </div>
                    </div>
                  )}
                </section>

                <section className={styles.detailSection} aria-label="Calibration">
                  <span className={styles.sectionLabel}>Calibration</span>
                  {calibration.mode === "uniform" ? (
                    <div className={styles.referenceRow}>
                      <span className={styles.referenceInfo}>
                        <span className={styles.referenceLabel}>Reference</span>
                        <strong>{formatReferenceDistance(calibration.referenceDistanceMm)}</strong>
                      </span>
                      <Button
                        variant="ghost"
                        size="compact"
                        aria-label="Edit uniform reference points"
                        disabled={spatialActionsDisabled}
                        disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                        onClick={() =>
                          workspace.requestPrecisionAuthoring(() =>
                            onEditReference(calibration, "uniform"),
                          )
                        }
                      >
                        Edit points
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.referenceRow}>
                        <span className={styles.referenceInfo}>
                          <span className={styles.referenceLabel}>X reference</span>
                          <strong>
                            {formatReferenceDistance(calibration.xReference.referenceDistanceMm)}
                          </strong>
                        </span>
                        <Button
                          variant="ghost"
                          size="compact"
                          aria-label="Edit X reference points"
                          disabled={spatialActionsDisabled}
                          disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                          onClick={() =>
                            workspace.requestPrecisionAuthoring(() =>
                              onEditReference(calibration, "x"),
                            )
                          }
                        >
                          Edit points
                        </Button>
                      </div>
                      <div className={styles.referenceRow}>
                        <span className={styles.referenceInfo}>
                          <span className={styles.referenceLabel}>Y reference</span>
                          <strong>
                            {formatReferenceDistance(calibration.yReference.referenceDistanceMm)}
                          </strong>
                        </span>
                        <Button
                          variant="ghost"
                          size="compact"
                          aria-label="Edit Y reference points"
                          disabled={spatialActionsDisabled}
                          disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                          onClick={() =>
                            workspace.requestPrecisionAuthoring(() =>
                              onEditReference(calibration, "y"),
                            )
                          }
                        >
                          Edit points
                        </Button>
                      </div>
                    </>
                  )}
                </section>

                <div className={styles.recalibrateFooter}>
                  <Button
                    variant="secondary"
                    size="compact"
                    className={styles.recalibrateButton}
                    disabled={spatialActionsDisabled}
                    disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                    onClick={() =>
                      workspace.requestPrecisionAuthoring(() => onRecalibrate(calibration.id))
                    }
                  >
                    Recalibrate scale
                  </Button>
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
          className={styles.addScaleMenu}
          label="Add scale"
          showMarkerColumn={false}
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
            ...STANDARD_SCALE_PRESET_RATIOS.map((ratio, index) => ({
              id: `preset-${ratio}`,
              sectionLabel: index === 0 ? "Standard ratios" : undefined,
              label: <PresetScaleOptionLabel ratio={ratio} />,
              onSelect: () => onAddPresetScale(ratio),
            })),
          ]}
          placement="bottom-start"
        />
      </div>

      {spatialActionsDisabled && (
        <p id={disabledReasonId} className={styles.visuallyHidden}>
          {spatialDisabledReason}
        </p>
      )}

      {page.calibrations.length > 0 && (
        <p className={styles.note}>
          {page.calibrations.length > 1
            ? "Before drawing, switch the active scale from the Viewer Dock. Changing it does not relink measurements."
            : "Changing the active scale does not relink measurements."}
        </p>
      )}
    </section>
  );
}
