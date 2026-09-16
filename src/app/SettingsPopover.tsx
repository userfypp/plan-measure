import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Popover } from "../components/ui";
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
  { id: "classifications", label: "Classifications" },
];

const MEASUREMENT_DECIMAL_OPTIONS: MeasurementDecimalPlaces[] = [0, 1, 2, 3, 4, 5, 6];

export interface SettingsPopoverProps {
  trigger: ReactNode;
  triggerClassName?: string;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  confirmMeasurementDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

export function SettingsPopover({
  trigger,
  triggerClassName,
  measurementDecimalPlaces = null,
  confirmMeasurementDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onMeasurementDecimalPlacesChange,
  onConfirmMeasurementDeletionChange,
  onRecoveredPlanStartupWorkspaceChange,
}: SettingsPopoverProps) {
  const { preference, setPreference } = useTheme();
  const titleId = useId();
  const interfaceHeadingId = useId();
  const measurementsHeadingId = useId();
  const appearanceLabelId = useId();
  const recoveredWorkspaceId = useId();
  const recoveredWorkspaceDescriptionId = useId();
  const decimalPlacesId = useId();
  const deleteConfirmationId = useId();
  const themeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectTheme(nextPreference: ThemePreference, nextIndex: number) {
    setPreference(nextPreference);
    themeOptionRefs.current[nextIndex]?.focus({ preventScroll: true });
  }

  function handleThemeKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let direction: 1 | -1 | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") direction = 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") direction = -1;
    if (direction === null) return;

    event.preventDefault();
    const nextIndex = (currentIndex + direction + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    selectTheme(THEME_OPTIONS[nextIndex]!.id, nextIndex);
  }

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
              <span id={appearanceLabelId} className={styles.settingLabel}>
                Appearance
              </span>
              <div
                className={styles.appearanceGroup}
                role="radiogroup"
                aria-labelledby={appearanceLabelId}
              >
                {THEME_OPTIONS.map((option, index) => {
                  const checked = preference === option.id;
                  return (
                    <button
                      key={option.id}
                      ref={(element) => {
                        themeOptionRefs.current[index] = element;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      tabIndex={checked ? 0 : -1}
                      data-popover-autofocus={checked ? "true" : undefined}
                      className={styles.appearanceOption}
                      onClick={() => selectTheme(option.id, index)}
                      onKeyDown={(event) => handleThemeKeyDown(event, index)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {onRecoveredPlanStartupWorkspaceChange && (
              <div className={`${styles.settingRow} ${styles.stackOnNarrow}`}>
                <div className={styles.settingCopy}>
                  <label className={styles.settingLabel} htmlFor={recoveredWorkspaceId}>
                    Recovered plan workspace
                  </label>
                  <span id={recoveredWorkspaceDescriptionId} className={styles.description}>
                    Workspace shown after restoring a saved plan.
                  </span>
                </div>
                <select
                  id={recoveredWorkspaceId}
                  className={styles.recoveredWorkspaceSelect}
                  value={recoveredPlanStartupWorkspace}
                  aria-describedby={recoveredWorkspaceDescriptionId}
                  onChange={(event) =>
                    onRecoveredPlanStartupWorkspaceChange(
                      event.target.value as RecoveredPlanStartupWorkspace,
                    )
                  }
                >
                  {RECOVERED_PLAN_STARTUP_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                <label className={styles.settingLabel} htmlFor={decimalPlacesId}>
                  Decimal places
                </label>
                <select
                  id={decimalPlacesId}
                  className={styles.decimalSelect}
                  value={measurementDecimalPlaces}
                  onChange={(event) =>
                    onMeasurementDecimalPlacesChange(
                      Number(event.target.value) as MeasurementDecimalPlaces,
                    )
                  }
                >
                  {MEASUREMENT_DECIMAL_OPTIONS.map((decimalPlaces) => (
                    <option key={decimalPlaces} value={decimalPlaces}>
                      {decimalPlaces}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {onConfirmMeasurementDeletionChange && (
              <div className={styles.settingRow}>
                <label className={styles.settingLabel} htmlFor={deleteConfirmationId}>
                  Confirm before deleting
                </label>
                <label className={styles.switchTarget}>
                  <input
                    id={deleteConfirmationId}
                    className={styles.switchInput}
                    type="checkbox"
                    role="switch"
                    aria-label="Confirm before deleting measurements"
                    checked={confirmMeasurementDeletion}
                    onChange={(event) => onConfirmMeasurementDeletionChange(event.target.checked)}
                  />
                </label>
              </div>
            )}
          </div>
        </section>
      </div>
    </Popover>
  );
}
