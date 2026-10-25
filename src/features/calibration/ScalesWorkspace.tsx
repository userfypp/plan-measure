import { Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useNumberFormatKey } from "../../utils/appPreferences";
import {
  AnchoredMenu,
  CloseIcon,
  CopyIcon,
  Disclosure,
  EditPointsIcon,
  IconButton,
  InlineField,
  PencilIcon,
  PlusIcon,
  RatioIcon,
  RefreshIcon,
  SaveIcon,
  ScaleCheckIcon,
  TrashIcon,
} from "../../components/ui";
import type {
  CalibrationReferenceKey,
  MeasurementDisplayUnit,
  PageCalibration,
  PageState,
} from "../../types/domain";
import { formatDisplayNumber, formatLinearValue } from "../../utils/format";
import { defaultCalibrationName } from "../../utils/calibration";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { useWorkspaceDrawerPresentation } from "../../app/WorkspaceDrawerContext";
import { retryableImport } from "../../app/retryableImport";
import { recoverableLazy } from "../../app/recoverableLazy";
import { scaleRatioSpecFromCalibration, type RatioCalibrationInput } from "./ratioCalibration";
import {
  STANDARD_SCALE_PRESET_RATIOS,
  type StandardScalePresetRatio,
} from "./standardScalePresets";
import styles from "./ScalesWorkspace.module.css";

const CustomRatioDialog = recoverableLazy(
  retryableImport(() =>
    import("./CustomRatioDialog").then((module) => ({ default: module.CustomRatioDialog })),
  ),
  "Custom ratio",
);
export const preloadCustomRatioDialog = CustomRatioDialog.preload;

export interface ScalesWorkspaceProps {
  page: PageState;
  displayUnit: MeasurementDisplayUnit;
  actionsDisabled?: boolean;
  onAddScale: (mode: "uniform" | "xy") => void;
  onAddCustomRatioScale: (name: string, calibration: RatioCalibrationInput) => void;
  onAddPresetScale: (ratio: StandardScalePresetRatio) => void;
  onSetRatio: (calibrationId: string, calibration: RatioCalibrationInput) => void;
  onRenameScale: (calibrationId: string, name: string) => void;
  onCheckScale?: (calibration: PageCalibration) => void;
  onRecalibrate: (calibrationId: string) => void;
  onEditReference: (calibration: PageCalibration, reference: CalibrationReferenceKey) => void;
  onCopyScale: (calibration: PageCalibration) => void;
  /** Omitted: the scale details offer no Delete. */
  onDeleteScale?: (calibration: PageCalibration) => void;
}

interface RenameState {
  calibrationId: string;
  draftName: string;
  error: string | null;
}

const WORKFLOW_DISABLED_REASON = "Finish or cancel the current scale workflow first.";
const EMPTY_SCALE_NAME_ERROR = "Scale name cannot be empty.";

function findCalibration(calibrations: readonly PageCalibration[], calibrationId: string) {
  return calibrations.some((calibration) => calibration.id === calibrationId);
}

// The session refuses to delete a scale that measurements still use.
function scaleInUseReason(measurementCount: number): string {
  return `${measurementCount} ${measurementCount === 1 ? "measurement uses" : "measurements use"} this scale. Move ${measurementCount === 1 ? "it" : "them"} to another scale or delete ${measurementCount === 1 ? "it" : "them"} first.`;
}

function formatReferenceDistance(millimetres: number, displayUnit: MeasurementDisplayUnit): string {
  if (displayUnit === "in" || displayUnit === "ft" || displayUnit === "ft-in") {
    return formatLinearValue(millimetres, displayUnit);
  }
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

function CustomRatioOptionLabel() {
  return (
    <span className={styles.addOptionLabel}>
      <strong>Custom ratio</strong>
      <span>Enter 1:n</span>
    </span>
  );
}

function ReferenceRow({
  label,
  hiddenLabel,
  value,
  actionLabel,
  disabled,
  disabledReason,
  onEdit,
}: {
  label: string;
  hiddenLabel: string;
  value: string;
  actionLabel: string;
  disabled: boolean;
  disabledReason?: string;
  onEdit: () => void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <span className={styles.value} title={value}>
        <span className={styles.visuallyHidden}>{hiddenLabel}</span>
        {value}
      </span>
      <IconButton
        icon={<EditPointsIcon />}
        aria-label={actionLabel}
        tooltip="Edit points"
        disabled={disabled}
        disabledReason={disabledReason}
        onClick={onEdit}
      />
    </div>
  );
}

export function ScalesWorkspace({
  page,
  displayUnit,
  actionsDisabled = false,
  onAddScale,
  onAddCustomRatioScale,
  onAddPresetScale,
  onSetRatio,
  onRenameScale,
  onRecalibrate,
  onCheckScale,
  onEditReference,
  onCopyScale,
  onDeleteScale,
}: ScalesWorkspaceProps) {
  useNumberFormatKey(); // re-render when separators change
  const workspace = useWorkspaceDrawerPresentation();
  const [inspectedScaleId, setInspectedScaleId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [customRatioDialogOpen, setCustomRatioDialogOpen] = useState(false);
  const [setRatioScaleId, setSetRatioScaleId] = useState<string | null>(null);
  const footerRefs = useRef(new Map<string, HTMLElement>());
  const returnFocusScaleIdRef = useRef<string | null>(null);
  const addScaleContainerRef = useRef<HTMLDivElement>(null);
  const returnFocusToAddScaleRef = useRef(false);
  const deletingScaleIdRef = useRef<string | null>(null);
  const precisionActionsDisabled = !workspace.precisionActionAvailable;
  const precisionDisabledReason = workspace.precisionDisabledReason;
  const spatialActionsDisabled = actionsDisabled || precisionActionsDisabled;
  const spatialDisabledReason = actionsDisabled
    ? WORKFLOW_DISABLED_REASON
    : precisionDisabledReason;
  const disabledReasonId = "scale-spatial-actions-disabled-reason";
  const setRatioCalibration = setRatioScaleId
    ? (page.calibrations.find((calibration) => calibration.id === setRatioScaleId) ?? null)
    : null;

  useLayoutEffect(() => {
    if (renameState) return;
    const scaleId = returnFocusScaleIdRef.current;
    if (!scaleId) return;
    returnFocusScaleIdRef.current = null;
    footerRefs.current
      .get(scaleId)
      ?.querySelector<HTMLButtonElement>('button[aria-label^="Rename scale"]')
      ?.focus({ preventScroll: true });
  }, [renameState]);

  useLayoutEffect(() => {
    if (customRatioDialogOpen || !returnFocusToAddScaleRef.current) return;
    returnFocusToAddScaleRef.current = false;
    addScaleContainerRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Add scale"]')
      ?.focus({ preventScroll: true });
  }, [customRatioDialogOpen]);

  // Deleting a scale from its Delete button removes the focused button, or the button a
  // confirmation returns focus to, so focus falls back to the page or to the viewer. A confirmation
  // may queue that fallback in a microtask from its unmount cleanup, so the move to "Add scale" is
  // queued after it. A scale removed any other way, such as an undo, leaves focus where it is.
  useEffect(() => {
    const deletingScaleId = deletingScaleIdRef.current;
    if (!deletingScaleId || findCalibration(page.calibrations, deletingScaleId)) return;
    deletingScaleIdRef.current = null;
    queueMicrotask(() => {
      const focused = document.activeElement;
      const fellBack =
        !focused ||
        focused === document.body ||
        (focused instanceof HTMLElement && focused.hasAttribute("data-dialog-focus-fallback"));
      if (!fellBack) return;
      addScaleContainerRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-label="Add scale"]')
        ?.focus({ preventScroll: true });
    });
  }, [page.calibrations]);

  // A cancelled confirmation keeps the scale; collapsing it or inspecting another one ends that
  // delete. Declared after the effect above so a delete that also clears the inspection still moves
  // focus first.
  useEffect(() => {
    deletingScaleIdRef.current = null;
  }, [inspectedScaleId]);

  function closeCustomRatioDialog() {
    returnFocusToAddScaleRef.current = true;
    setCustomRatioDialogOpen(false);
  }

  function discardRename() {
    returnFocusScaleIdRef.current = null;
    setRenameState(null);
  }

  function cancelRename(calibrationId: string) {
    returnFocusScaleIdRef.current = calibrationId;
    setRenameState(null);
  }

  function commitRename(calibration: PageCalibration) {
    if (!renameState || renameState.calibrationId !== calibration.id || actionsDisabled)
      return false;
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
      <div className={styles.body}>
        {page.calibrations.length === 0 && (
          <p className={styles.empty}>Add a scale to begin measuring.</p>
        )}
        <ul className={styles.list} aria-label="Page scales">
          {page.calibrations.map((calibration) => {
            const metadata = scaleDisplayMetadata(calibration);
            const active = calibration.id === page.activeCalibrationId;
            const inspected = inspectedScaleId === calibration.id;
            const renaming = renameState?.calibrationId === calibration.id;
            const measurementCount = page.measurements.filter(
              (measurement) => measurement.calibrationId === calibration.id,
            ).length;
            return (
              <li key={calibration.id} className={styles.scale}>
                <Disclosure
                  title={calibration.name}
                  subtitle={
                    <>
                      {metadata.detailLabel}
                      {active && <span className={styles.visuallyHidden}>, active</span>}
                    </>
                  }
                  selected={active}
                  open={inspected}
                  onOpenChange={() => toggleScale(calibration.id, inspected)}
                  actions={
                    <>
                      {onCheckScale && (
                        <IconButton
                          icon={<ScaleCheckIcon />}
                          aria-label={`Check scale ${calibration.name}`}
                          tooltip="Check scale"
                          disabled={spatialActionsDisabled}
                          disabledReason={
                            spatialActionsDisabled ? spatialDisabledReason : undefined
                          }
                          onClick={() =>
                            workspace.requestPrecisionAuthoring(() => onCheckScale(calibration))
                          }
                        />
                      )}
                      <IconButton
                        icon={<CopyIcon />}
                        aria-label={`Copy scale ${calibration.name}`}
                        tooltip="Copy scale"
                        disabled={actionsDisabled}
                        disabledReason={actionsDisabled ? WORKFLOW_DISABLED_REASON : undefined}
                        onClick={() => onCopyScale(calibration)}
                      />
                    </>
                  }
                >
                  <div className={styles.details}>
                    {renaming && (
                      <InlineField
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
                        onSubmit={(event) => submitRename(event, calibration)}
                        actions={
                          <>
                            <IconButton
                              icon={<CloseIcon />}
                              aria-label="Cancel"
                              tooltip="Cancel"
                              onClick={() => cancelRename(calibration.id)}
                            />
                            <IconButton
                              type="submit"
                              tone="primary"
                              icon={<SaveIcon />}
                              aria-label="Save"
                              tooltip="Save"
                              disabled={actionsDisabled}
                              disabledReason={
                                actionsDisabled ? WORKFLOW_DISABLED_REASON : undefined
                              }
                            />
                          </>
                        }
                      />
                    )}

                    <div
                      className={styles.rows}
                      role="group"
                      aria-label={`Scale details for ${calibration.name}`}
                    >
                      <div className={styles.row}>
                        <span className={styles.label} aria-hidden="true">
                          Ratio
                        </span>
                        <span className={styles.value} title={metadata.ratioLabel}>
                          <span className={styles.visuallyHidden}>Effective ratio: </span>
                          {metadata.ratioLabel}
                        </span>
                        <IconButton
                          icon={<RatioIcon />}
                          aria-label={`Set ratio for scale ${calibration.name}`}
                          tooltip="Set ratio"
                          disabled={actionsDisabled}
                          disabledReason={actionsDisabled ? WORKFLOW_DISABLED_REASON : undefined}
                          onClick={() => setSetRatioScaleId(calibration.id)}
                        />
                      </div>

                      {calibration.mode === "uniform" ? (
                        <ReferenceRow
                          label="Reference"
                          hiddenLabel="Uniform reference: "
                          value={formatReferenceDistance(
                            calibration.referenceDistanceMm,
                            displayUnit,
                          )}
                          actionLabel="Edit uniform reference points"
                          disabled={spatialActionsDisabled}
                          disabledReason={
                            spatialActionsDisabled ? spatialDisabledReason : undefined
                          }
                          onEdit={() =>
                            workspace.requestPrecisionAuthoring(() =>
                              onEditReference(calibration, "uniform"),
                            )
                          }
                        />
                      ) : (
                        <>
                          <ReferenceRow
                            label="X"
                            hiddenLabel="X reference: "
                            value={formatReferenceDistance(
                              calibration.xReference.referenceDistanceMm,
                              displayUnit,
                            )}
                            actionLabel="Edit X reference points"
                            disabled={spatialActionsDisabled}
                            disabledReason={
                              spatialActionsDisabled ? spatialDisabledReason : undefined
                            }
                            onEdit={() =>
                              workspace.requestPrecisionAuthoring(() =>
                                onEditReference(calibration, "x"),
                              )
                            }
                          />
                          <ReferenceRow
                            label="Y"
                            hiddenLabel="Y reference: "
                            value={formatReferenceDistance(
                              calibration.yReference.referenceDistanceMm,
                              displayUnit,
                            )}
                            actionLabel="Edit Y reference points"
                            disabled={spatialActionsDisabled}
                            disabledReason={
                              spatialActionsDisabled ? spatialDisabledReason : undefined
                            }
                            onEdit={() =>
                              workspace.requestPrecisionAuthoring(() =>
                                onEditReference(calibration, "y"),
                              )
                            }
                          />
                        </>
                      )}
                    </div>

                    <div
                      className={styles.footer}
                      ref={(node) => {
                        if (node) footerRefs.current.set(calibration.id, node);
                        else footerRefs.current.delete(calibration.id);
                      }}
                    >
                      {!renaming && (
                        <IconButton
                          icon={<PencilIcon />}
                          aria-label={`Rename scale ${calibration.name}`}
                          tooltip="Rename"
                          disabled={actionsDisabled}
                          disabledReason={actionsDisabled ? WORKFLOW_DISABLED_REASON : undefined}
                          onClick={() =>
                            setRenameState({
                              calibrationId: calibration.id,
                              draftName: calibration.name,
                              error: null,
                            })
                          }
                        />
                      )}
                      <IconButton
                        icon={<RefreshIcon />}
                        aria-label="Recalibrate scale"
                        tooltip="Recalibrate scale"
                        disabled={spatialActionsDisabled}
                        disabledReason={spatialActionsDisabled ? spatialDisabledReason : undefined}
                        onClick={() =>
                          workspace.requestPrecisionAuthoring(() => onRecalibrate(calibration.id))
                        }
                      />
                      {onDeleteScale && (
                        <IconButton
                          className={styles.deleteScale}
                          tone="danger"
                          icon={<TrashIcon />}
                          aria-label={`Delete scale ${calibration.name}`}
                          tooltip="Delete"
                          disabled={actionsDisabled || measurementCount > 0}
                          disabledReason={
                            actionsDisabled
                              ? WORKFLOW_DISABLED_REASON
                              : measurementCount > 0
                                ? scaleInUseReason(measurementCount)
                                : undefined
                          }
                          onClick={() => {
                            deletingScaleIdRef.current = calibration.id;
                            onDeleteScale(calibration);
                          }}
                        />
                      )}
                    </div>
                  </div>
                </Disclosure>
              </li>
            );
          })}
        </ul>

        <div ref={addScaleContainerRef} className={styles.addScale}>
          <AnchoredMenu
            trigger={
              <>
                <PlusIcon />
                <span>Add scale</span>
              </>
            }
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
              {
                id: "custom-ratio",
                label: <CustomRatioOptionLabel />,
                onSelect: () => setCustomRatioDialogOpen(true),
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
      </div>

      <Suspense fallback={null}>
        {customRatioDialogOpen && (
          <CustomRatioDialog
            purpose="create"
            initialName={defaultCalibrationName(page)}
            onCancel={closeCustomRatioDialog}
            onConfirm={({ name, calibration }) => {
              onAddCustomRatioScale(name, calibration);
              closeCustomRatioDialog();
            }}
          />
        )}

        {setRatioCalibration && (
          <CustomRatioDialog
            purpose="set"
            initialRatio={scaleRatioSpecFromCalibration(setRatioCalibration)}
            onCancel={() => setSetRatioScaleId(null)}
            onConfirm={(calibration) => {
              onSetRatio(setRatioCalibration.id, calibration);
              setSetRatioScaleId(null);
            }}
          />
        )}
      </Suspense>
    </section>
  );
}
