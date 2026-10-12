import { useId, useRef, type ReactNode } from "react";
import { Popover, Select, Switch, Tooltip } from "../components/ui";
import type { MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { useTheme, type ThemePreference } from "./themeState";
import styles from "./SettingsPopover.module.css";

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const RECOVERED_PLAN_STARTUP_OPTIONS: Array<{
  id: RecoveredPlanStartupWorkspace;
  label: string;
}> = [
  { id: "scales", label: "Scales" },
  { id: "measurements", label: "Measurements" },
  { id: "takeoff", label: "Takeoff" },
  { id: "classifications", label: "Classifications" },
];

const MEASUREMENT_DECIMAL_OPTIONS: MeasurementDecimalPlaces[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function HelpIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.9 8c0-1.2.9-2 2.1-2s2.1.8 2.1 1.9c0 1.5-2.1 1.7-2.1 3.2M10 14.1v.1" />
    </svg>
  );
}

/** Single-line label; the explanation lives in a tooltip on a keyboard-reachable help button. */
function SettingLabel({
  id,
  htmlFor,
  label,
  description,
  descriptionId,
}: {
  id?: string;
  htmlFor: string;
  label: string;
  description: string;
  descriptionId: string;
}) {
  const copyRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={copyRef} className={styles.settingCopy}>
      <label id={id} className={styles.settingLabel} htmlFor={htmlFor}>
        {label}
      </label>
      <Tooltip
        content={description}
        position="top"
        anchorRef={copyRef}
        describeTrigger={false}
      >
        <button
          type="button"
          className={styles.helpButton}
          aria-label={`About ${label}`}
          aria-describedby={descriptionId}
        >
          <HelpIcon />
        </button>
      </Tooltip>
      <span id={descriptionId} className={styles.visuallyHidden}>
        {description}
      </span>
    </div>
  );
}

export interface SettingsPopoverProps {
  trigger: ReactNode;
  triggerClassName?: string;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  keyboardAuthoringEnabled?: boolean;
  confirmMeasurementDeletion?: boolean;
  confirmValueDeletion?: boolean;
  confirmDimensionDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onKeyboardAuthoringEnabledChange?: (enabled: boolean) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onConfirmValueDeletionChange?: (enabled: boolean) => void;
  onConfirmDimensionDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

export function SettingsPopover({
  trigger,
  triggerClassName,
  measurementDecimalPlaces = null,
  keyboardAuthoringEnabled = false,
  confirmMeasurementDeletion = true,
  confirmValueDeletion = true,
  confirmDimensionDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onMeasurementDecimalPlacesChange,
  onKeyboardAuthoringEnabledChange,
  onConfirmMeasurementDeletionChange,
  onConfirmValueDeletionChange,
  onConfirmDimensionDeletionChange,
  onRecoveredPlanStartupWorkspaceChange,
}: SettingsPopoverProps) {
  const { preference, setPreference } = useTheme();
  const titleId = useId();
  const interfaceHeadingId = useId();
  const measurementsHeadingId = useId();
  const classificationsHeadingId = useId();
  const valueDeletionId = useId();
  const dimensionDeletionId = useId();
  const appearanceId = useId();
  const appearanceLabelId = useId();
  const keyboardAuthoringId = useId();
  const keyboardAuthoringDescriptionId = useId();
  const recoveredWorkspaceId = useId();
  const recoveredWorkspaceDescriptionId = useId();
  const decimalPlacesId = useId();
  const decimalPlacesLabelId = useId();
  const recoveredWorkspaceLabelId = useId();
  const deleteConfirmationId = useId();
  return (
    <Popover
      trigger={trigger}
      triggerProps={{
        className: triggerClassName,
        "aria-label": "Settings",
        "aria-haspopup": "dialog",
        title: "Settings",
      }}
      placement="bottom-end"
      initialFocus="first"
      dismissOnFocusLeave
      role="dialog"
      aria-labelledby={titleId}
      className={styles.popover}
    >
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Settings
        </h2>

        <section className={styles.section} aria-labelledby={interfaceHeadingId}>
          <h3 id={interfaceHeadingId} className={styles.sectionHeading}>
            INTERFACE
          </h3>
          <div className={styles.settingList}>
            <div className={`${styles.settingRow} ${styles.stackOnNarrow}`}>
              <label id={appearanceLabelId} className={styles.settingLabel} htmlFor={appearanceId}>
                Appearance
              </label>
              <Select<ThemePreference>
                id={appearanceId}
                className={styles.appearanceSelect}
                label="Appearance"
                labelledBy={appearanceLabelId}
                value={preference}
                options={THEME_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                onChange={setPreference}
              />
            </div>

            {onKeyboardAuthoringEnabledChange && (
              <div className={styles.settingRow}>
                <SettingLabel
                  htmlFor={keyboardAuthoringId}
                  label="Keyboard drawing and editing"
                  description="Use arrows to move a cursor, Space to place points and E to edit measurements."
                  descriptionId={keyboardAuthoringDescriptionId}
                />
                <Switch
                  id={keyboardAuthoringId}
                  aria-label="Keyboard drawing and editing"
                  aria-describedby={keyboardAuthoringDescriptionId}
                  checked={keyboardAuthoringEnabled}
                  onChange={onKeyboardAuthoringEnabledChange}
                />
              </div>
            )}

            {onRecoveredPlanStartupWorkspaceChange && (
              <div className={`${styles.settingRow} ${styles.stackOnNarrow}`}>
                <SettingLabel
                  id={recoveredWorkspaceLabelId}
                  htmlFor={recoveredWorkspaceId}
                  label="Recovered plan workspace"
                  description="Workspace shown after restoring a saved plan."
                  descriptionId={recoveredWorkspaceDescriptionId}
                />
                <Select
                  id={recoveredWorkspaceId}
                  className={styles.recoveredWorkspaceSelect}
                  label="Recovered plan workspace"
                  labelledBy={recoveredWorkspaceLabelId}
                  describedBy={recoveredWorkspaceDescriptionId}
                  value={recoveredPlanStartupWorkspace}
                  options={RECOVERED_PLAN_STARTUP_OPTIONS.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  onChange={onRecoveredPlanStartupWorkspaceChange}
                />
              </div>
            )}
          </div>
        </section>

        <div className={styles.divider} aria-hidden="true" />

        <section className={styles.section} aria-labelledby={measurementsHeadingId}>
          <h3 id={measurementsHeadingId} className={styles.sectionHeading}>
            MEASUREMENTS
          </h3>
          <div className={styles.settingList}>
            {measurementDecimalPlaces !== null && onMeasurementDecimalPlacesChange && (
              <div className={styles.settingRow}>
                <label
                  id={decimalPlacesLabelId}
                  className={styles.settingLabel}
                  htmlFor={decimalPlacesId}
                >
                  Decimal places
                </label>
                <Select
                  id={decimalPlacesId}
                  className={styles.decimalSelect}
                  label="Decimal places"
                  labelledBy={decimalPlacesLabelId}
                  value={String(measurementDecimalPlaces)}
                  options={MEASUREMENT_DECIMAL_OPTIONS.map((decimalPlaces) => ({
                    value: String(decimalPlaces),
                    label: String(decimalPlaces),
                  }))}
                  onChange={(value) =>
                    onMeasurementDecimalPlacesChange(Number(value) as MeasurementDecimalPlaces)
                  }
                />
              </div>
            )}

            {onConfirmMeasurementDeletionChange && (
              <div className={styles.settingRow}>
                <label className={styles.settingLabel} htmlFor={deleteConfirmationId}>
                  Confirm before deleting measurements
                </label>
                <Switch
                  id={deleteConfirmationId}
                  aria-label="Confirm before deleting measurements"
                  checked={confirmMeasurementDeletion}
                  onChange={onConfirmMeasurementDeletionChange}
                />
              </div>
            )}
          </div>
        </section>

        {(onConfirmValueDeletionChange || onConfirmDimensionDeletionChange) && (
          <>
            <div className={styles.divider} aria-hidden="true" />
            <section className={styles.section} aria-labelledby={classificationsHeadingId}>
              <h3 id={classificationsHeadingId} className={styles.sectionHeading}>
                CLASSIFICATIONS
              </h3>
              <div className={styles.settingList}>
                {onConfirmValueDeletionChange && (
                  <div className={styles.settingRow}>
                    <label className={styles.settingLabel} htmlFor={valueDeletionId}>
                      Confirm before deleting values
                    </label>
                    <Switch
                      id={valueDeletionId}
                      aria-label="Confirm before deleting values"
                      checked={confirmValueDeletion}
                      onChange={onConfirmValueDeletionChange}
                    />
                  </div>
                )}
                {onConfirmDimensionDeletionChange && (
                  <div className={styles.settingRow}>
                    <label className={styles.settingLabel} htmlFor={dimensionDeletionId}>
                      Confirm before deleting dimensions
                    </label>
                    <Switch
                      id={dimensionDeletionId}
                      aria-label="Confirm before deleting dimensions"
                      checked={confirmDimensionDeletion}
                      onChange={onConfirmDimensionDeletionChange}
                    />
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </Popover>
  );
}
