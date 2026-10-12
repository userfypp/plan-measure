import { createPortal } from "react-dom";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, Dialog, Select, Switch, Tooltip } from "../components/ui";
import type { MeasurementDecimalPlaces, SessionSettings } from "../types/domain";
import {
  resetAppPreferences,
  setAppPreference,
  useAppPreferences,
  type AppPreferences,
} from "../utils/appPreferences";
import { localizeNumberString } from "../utils/format";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { useTheme, type ThemePreference } from "./themeState";
import styles from "./SettingsDialog.module.css";

type SectionId =
  "interface" | "measurements" | "drawing" | "view" | "canvas" | "confirmations" | "advanced";

/** Project-level view settings shown in Settings → View (also reachable from the viewer dock). */
export type ProjectViewSettings = Pick<
  SessionSettings,
  "displayUnit" | "areaDisplay" | "showLabels" | "showMeasurements" | "showCalibration"
>;

const AREA_DISPLAY_OPTIONS: Array<{ value: ProjectViewSettings["areaDisplay"]; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "ac", label: "Acres" },
];

const LINE_THICKNESS_OPTIONS = [
  { value: "thin", label: "Thin" },
  { value: "normal", label: "Normal" },
  { value: "thick", label: "Thick" },
] as const;

const LABEL_SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
] as const;

const FILL_OPACITY_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "normal", label: "Normal" },
  { value: "strong", label: "Strong" },
] as const;

const HANDLE_SIZE_OPTIONS = LABEL_SIZE_OPTIONS;

const LABEL_BACKGROUND_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "translucent", label: "Translucent" },
  { value: "none", label: "None" },
] as const;

const AFTER_FINISHING_OPTIONS = [
  { value: "keep", label: "Keep tool" },
  { value: "select", label: "Select" },
] as const;

const ZOOM_STEP_OPTIONS = [
  { value: "fine", label: "Fine" },
  { value: "normal", label: "Normal" },
  { value: "coarse", label: "Coarse" },
] as const;

const DEFAULT_ZOOM_OPTIONS = [
  { value: "fit-page", label: "Fit page" },
  { value: "fit-width", label: "Fit width" },
  { value: "actual", label: "100%" },
] as const;

const WHEEL_BEHAVIOR_OPTIONS = [
  { value: "zoom", label: "Zoom" },
  { value: "pan", label: "Scroll" },
] as const;

const DATE_FORMAT_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "with-time", label: "With time" },
] as const;

const LABEL_CONTENT_OPTIONS = [
  { value: "value", label: "Value" },
  { value: "name-value", label: "Name and value" },
] as const;

const PAGE_GRID_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "fine", label: "Fine" },
  { value: "coarse", label: "Coarse" },
] as const;

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const RECOVERED_PLAN_STARTUP_OPTIONS: Array<{
  value: RecoveredPlanStartupWorkspace;
  label: string;
}> = [
  { value: "scales", label: "Scales" },
  { value: "measurements", label: "Measurements" },
  { value: "takeoff", label: "Takeoff" },
  { value: "classifications", label: "Classifications" },
];

const MEASUREMENT_DECIMAL_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((value) => ({
  value: String(value),
  label: String(value),
}));

const MOTION_OPTIONS = [
  { value: "system", label: "Follow system" },
  { value: "reduce", label: "Always reduce" },
] as const;

const THOUSANDS_OPTIONS = [
  { value: "none", label: "None" },
  { value: "space", label: "Space" },
  { value: "comma", label: "Comma" },
  { value: "point", label: "Point" },
] as const;

const DECIMAL_SEPARATOR_OPTIONS = [
  { value: "point", label: "Point" },
  { value: "comma", label: "Comma" },
] as const;

const UNIT_OPTIONS = [
  { value: "mm", label: "Millimetres" },
  { value: "cm", label: "Centimetres" },
  { value: "m", label: "Metres" },
  { value: "in", label: "Inches" },
  { value: "ft", label: "Feet" },
  { value: "ft-in", label: "Feet & inches" },
] as const;

const SENSITIVITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const;

const MAX_ZOOM_OPTIONS = [
  { value: "4", label: "4×" },
  { value: "8", label: "8×" },
  { value: "16", label: "16×" },
] as const;

const UNDO_DEPTH_OPTIONS = [
  { value: "50", label: "50 steps" },
  { value: "100", label: "100 steps" },
  { value: "200", label: "200 steps" },
  { value: "500", label: "500 steps" },
] as const;

const RENDER_DELAY_OPTIONS = [
  { value: "50", label: "50 ms" },
  { value: "90", label: "90 ms" },
  { value: "150", label: "150 ms" },
  { value: "250", label: "250 ms" },
] as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const SECTIONS: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  {
    id: "interface",
    label: "Interface",
    icon: (
      <Icon>
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M3 8h14M7.5 8v8" />
      </Icon>
    ),
  },
  {
    id: "measurements",
    label: "Measurements",
    icon: (
      <Icon>
        <path d="m4 13.5 9.5-9.5 2.5 2.5L6.5 16H4Z" />
        <path d="m11 6.5 2.5 2.5M8.5 9l1.5 1.5" />
      </Icon>
    ),
  },
  {
    id: "drawing",
    label: "Drawing",
    icon: (
      <Icon>
        <path d="M4 16 16 4" />
        <circle cx="4.5" cy="15.5" r="1.5" />
        <circle cx="15.5" cy="4.5" r="1.5" />
      </Icon>
    ),
  },
  {
    id: "view",
    label: "View",
    icon: (
      <Icon>
        <path d="M2.5 10S5.5 4.75 10 4.75 17.5 10 17.5 10 14.5 15.25 10 15.25 2.5 10 2.5 10Z" />
        <circle cx="10" cy="10" r="2.25" />
      </Icon>
    ),
  },
  {
    id: "canvas",
    label: "Canvas",
    icon: (
      <Icon>
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M3 8h14M3 12h14M8 3v14M12 3v14" />
      </Icon>
    ),
  },
  {
    id: "confirmations",
    label: "Confirmations",
    icon: (
      <Icon>
        <circle cx="10" cy="10" r="7" />
        <path d="m7 10.2 2.2 2.2L13.2 8" />
      </Icon>
    ),
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: (
      <Icon>
        <path d="M4 6h8M15 6h1M4 14h1M8 14h8" />
        <circle cx="13.5" cy="6" r="1.5" />
        <circle cx="6.5" cy="14" r="1.5" />
      </Icon>
    ),
  },
];

function HelpIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.9 8c0-1.2.9-2 2.1-2s2.1.8 2.1 1.9c0 1.5-2.1 1.7-2.1 3.2M10 14.1v.1" />
    </svg>
  );
}

interface RowProps {
  label: string;
  /** Explanation shown from a keyboard-reachable "?" button; keeps rows single-line. */
  help?: string;
  /** Renders the control: receives the ids it must wire for labelling. */
  children: (ids: { controlId: string; labelId: string; helpId?: string }) => ReactNode;
}

/** Label (+ optional help tooltip) on the left, control on the right. */
function Row({ label, help, children }: RowProps) {
  const controlId = useId();
  const labelId = useId();
  const helpId = useId();
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingCopy}>
        <label id={labelId} className={styles.settingLabel} htmlFor={controlId}>
          {label}
        </label>
        {help && (
          <>
            <Tooltip content={help} position="top" describeTrigger={false}>
              <button
                type="button"
                className={styles.helpButton}
                aria-label={`About ${label}`}
                aria-describedby={helpId}
              >
                <HelpIcon />
              </button>
            </Tooltip>
            <span id={helpId} className={styles.visuallyHidden}>
              {help}
            </span>
          </>
        )}
      </div>
      {children({ controlId, labelId, helpId: help ? helpId : undefined })}
    </div>
  );
}

function SelectRow<T extends string>({
  label,
  help,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  help?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <Row label={label} help={help}>
      {({ controlId, labelId, helpId }) => (
        <Select<T>
          id={controlId}
          className={[styles.select, className].filter(Boolean).join(" ")}
          label={label}
          labelledBy={labelId}
          describedBy={helpId}
          value={value}
          options={options}
          onChange={onChange}
        />
      )}
    </Row>
  );
}

function SwitchRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Row label={label} help={help}>
      {({ controlId, helpId }) => (
        <Switch
          id={controlId}
          aria-label={label}
          aria-describedby={helpId}
          checked={checked}
          onChange={onChange}
        />
      )}
    </Row>
  );
}

export interface SettingsDialogProps {
  trigger: ReactNode;
  triggerClassName?: string;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  /** Null when no project is open: project view settings are then shown disabled. */
  viewSettings?: ProjectViewSettings | null;
  keyboardAuthoringEnabled?: boolean;
  confirmMeasurementDeletion?: boolean;
  confirmValueDeletion?: boolean;
  confirmDimensionDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onViewSettingsChange?: (settings: Partial<ProjectViewSettings>) => void;
  onKeyboardAuthoringEnabledChange?: (enabled: boolean) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onConfirmValueDeletionChange?: (enabled: boolean) => void;
  onConfirmDimensionDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

export function SettingsDialog({
  trigger,
  triggerClassName,
  measurementDecimalPlaces = null,
  viewSettings = null,
  keyboardAuthoringEnabled = false,
  confirmMeasurementDeletion = true,
  confirmValueDeletion = true,
  confirmDimensionDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onMeasurementDecimalPlacesChange,
  onViewSettingsChange,
  onKeyboardAuthoringEnabledChange,
  onConfirmMeasurementDeletionChange,
  onConfirmValueDeletionChange,
  onConfirmDimensionDeletionChange,
  onRecoveredPlanStartupWorkspaceChange,
}: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("interface");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const { preference, setPreference } = useTheme();
  const preferences = useAppPreferences();
  const tabIdPrefix = useId();
  const tabRefs = useRef<Partial<Record<SectionId, HTMLButtonElement | null>>>({});

  function set<K extends keyof AppPreferences>(key: K) {
    return (value: AppPreferences[K]) => setAppPreference(key, value);
  }

  function selectSection(next: SectionId) {
    setSection(next);
    setConfirmingReset(false);
  }

  function handleNavKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = SECTIONS.findIndex((candidate) => candidate.id === section);
    const last = SECTIONS.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowDown" || event.key === "ArrowRight"
            ? (index + 1) % SECTIONS.length
            : (index - 1 + SECTIONS.length) % SECTIONS.length;
    const next = SECTIONS[nextIndex]!.id;
    selectSection(next);
    tabRefs.current[next]?.focus();
  }

  function resetAll() {
    resetAppPreferences();
    setPreference("system");
    onKeyboardAuthoringEnabledChange?.(false);
    onConfirmMeasurementDeletionChange?.(true);
    onConfirmValueDeletionChange?.(true);
    onConfirmDimensionDeletionChange?.(true);
    onRecoveredPlanStartupWorkspaceChange?.("scales");
    setConfirmingReset(false);
  }

  const preview = localizeNumberString("1234567.89");

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Settings"
        onClick={() => setOpen(true)}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <Dialog
            open
            title="Settings"
            size="large"
            className={styles.dialog}
            bodyClassName={styles.dialogBody}
            onClose={() => {
              setOpen(false);
              setConfirmingReset(false);
            }}
            actions={
              <Button size="compact" variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            }
          >
            <div className={styles.layout}>
              <div
                className={styles.nav}
                role="tablist"
                aria-label="Settings sections"
                aria-orientation="vertical"
                onKeyDown={handleNavKeyDown}
              >
                {SECTIONS.map((item) => (
                  <button
                    key={item.id}
                    ref={(element) => {
                      tabRefs.current[item.id] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`${tabIdPrefix}-tab-${item.id}`}
                    aria-selected={section === item.id}
                    aria-controls={`${tabIdPrefix}-panel`}
                    tabIndex={section === item.id ? 0 : -1}
                    className={styles.navItem}
                    onClick={() => selectSection(item.id)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <div
                className={styles.panel}
                role="tabpanel"
                id={`${tabIdPrefix}-panel`}
                aria-labelledby={`${tabIdPrefix}-tab-${section}`}
              >
                {section === "interface" && (
                  <div className={styles.settingList}>
                    <SelectRow<ThemePreference>
                      label="Appearance"
                      value={preference}
                      options={THEME_OPTIONS}
                      onChange={setPreference}
                    />
                    <SelectRow
                      label="Reduce motion"
                      help="Removes transitions and animations. “Follow system” uses your operating system setting."
                      value={preferences.motion}
                      options={MOTION_OPTIONS}
                      onChange={set("motion")}
                    />
                    <SwitchRow
                      label="Show tooltips"
                      help="Shows a short description when you hover or focus a button."
                      checked={preferences.tooltips}
                      onChange={set("tooltips")}
                    />
                    <SelectRow
                      label="Zoom step"
                      help="How much each zoom in or out button press and keyboard shortcut changes the zoom."
                      value={preferences.zoomStep}
                      options={ZOOM_STEP_OPTIONS}
                      onChange={set("zoomStep")}
                    />
                    <SelectRow
                      label="Default zoom"
                      help="How a page is shown when it opens. The Fit button always fits the whole page."
                      value={preferences.defaultZoom}
                      options={DEFAULT_ZOOM_OPTIONS}
                      onChange={set("defaultZoom")}
                    />
                    <SelectRow
                      label="Mouse wheel"
                      help="Zoom makes the wheel zoom the plan. Scroll makes it move the plan, and Ctrl or Cmd with the wheel (or a trackpad pinch) zooms."
                      value={preferences.wheelBehavior}
                      options={WHEEL_BEHAVIOR_OPTIONS}
                      onChange={set("wheelBehavior")}
                    />
                    <SelectRow
                      label="Date format"
                      help="How saved dates appear in the project library."
                      value={preferences.dateFormat}
                      options={DATE_FORMAT_OPTIONS}
                      onChange={set("dateFormat")}
                    />
                    {onKeyboardAuthoringEnabledChange && (
                      <SwitchRow
                        label="Keyboard drawing and editing"
                        help="Use arrows to move a cursor, Space to place points and E to edit measurements."
                        checked={keyboardAuthoringEnabled}
                        onChange={onKeyboardAuthoringEnabledChange}
                      />
                    )}
                    {onRecoveredPlanStartupWorkspaceChange && (
                      <SelectRow<RecoveredPlanStartupWorkspace>
                        label="Recovered plan workspace"
                        help="Workspace shown after restoring a saved plan."
                        value={recoveredPlanStartupWorkspace}
                        options={RECOVERED_PLAN_STARTUP_OPTIONS}
                        onChange={onRecoveredPlanStartupWorkspaceChange}
                      />
                    )}
                  </div>
                )}

                {section === "measurements" && (
                  <div className={styles.settingList}>
                    {measurementDecimalPlaces !== null && onMeasurementDecimalPlacesChange && (
                      <SelectRow
                        label="Decimal places"
                        help="Applies to the current project only."
                        className={styles.narrowSelect}
                        value={String(measurementDecimalPlaces)}
                        options={MEASUREMENT_DECIMAL_OPTIONS}
                        onChange={(value) =>
                          onMeasurementDecimalPlacesChange(
                            Number(value) as MeasurementDecimalPlaces,
                          )
                        }
                      />
                    )}
                    <SelectRow
                      label="Thousands separator"
                      help="Groups large numbers on screen. CSV exports are never affected. Ignored when it matches the decimal separator."
                      value={preferences.thousandsSeparator}
                      options={THOUSANDS_OPTIONS}
                      onChange={set("thousandsSeparator")}
                    />
                    <SelectRow
                      label="Decimal separator"
                      help="Applies to every project on this device. CSV exports always use a point."
                      value={preferences.decimalSeparator}
                      options={DECIMAL_SEPARATOR_OPTIONS}
                      onChange={set("decimalSeparator")}
                    />
                    <SelectRow
                      label="Label content"
                      help="Show only the value or the measurement name before it. Applies on screen only; exports do not change."
                      value={preferences.labelContent}
                      options={LABEL_CONTENT_OPTIONS}
                      onChange={set("labelContent")}
                    />
                    <p className={styles.preview} aria-live="polite">
                      <span>Preview</span>
                      <output className={styles.previewValue}>{preview}</output>
                    </p>
                    <SelectRow
                      label="Default unit for new plans"
                      help="Initial display unit of plans you open for the first time. Existing plans keep their own unit."
                      value={preferences.defaultDisplayUnit}
                      options={UNIT_OPTIONS}
                      onChange={set("defaultDisplayUnit")}
                    />
                  </div>
                )}

                {section === "drawing" && (
                  <div className={styles.settingList}>
                    <SwitchRow
                      label="Snap on by default"
                      help="Starts every session with snapping to existing points and edges enabled."
                      checked={preferences.snapDefault}
                      onChange={set("snapDefault")}
                    />
                    <SwitchRow
                      label="Ortho on by default"
                      help="Starts every session with horizontal and vertical constraints enabled."
                      checked={preferences.orthoDefault}
                      onChange={set("orthoDefault")}
                    />
                    <SelectRow
                      label="Snap sensitivity"
                      help="How close the pointer must be to a target to snap. Higher catches targets from farther away."
                      value={preferences.snapSensitivity}
                      options={SENSITIVITY_OPTIONS}
                      onChange={set("snapSensitivity")}
                    />
                    <SelectRow
                      label="Polygon close sensitivity"
                      help="How close the pointer must be to the first point to close a polygon."
                      value={preferences.closeSensitivity}
                      options={SENSITIVITY_OPTIONS}
                      onChange={set("closeSensitivity")}
                    />
                    <SelectRow
                      label="After finishing"
                      help="Tool used after completing a measurement. Count always stays active."
                      value={preferences.afterFinishing}
                      options={AFTER_FINISHING_OPTIONS}
                      onChange={set("afterFinishing")}
                    />
                    <SwitchRow
                      label="Crosshair cursor"
                      help="Uses a crosshair while a drawing tool is active. Off keeps the normal arrow."
                      checked={preferences.crosshairCursor}
                      onChange={set("crosshairCursor")}
                    />
                    <SwitchRow
                      label="Live segment length"
                      help="Shows the length of the segment being drawn next to the pointer."
                      checked={preferences.liveLength}
                      onChange={set("liveLength")}
                    />
                    <SwitchRow
                      label="Finish on double-click"
                      help="Double-clicking completes the polyline or polygon being drawn, without adding an extra point."
                      checked={preferences.finishOnDoubleClick}
                      onChange={set("finishOnDoubleClick")}
                    />
                  </div>
                )}

                {section === "view" && (
                  <div className={styles.settingList}>
                    {viewSettings && onViewSettingsChange && (
                      <>
                        <h3 className={styles.groupTitle}>
                          This project
                          <span>Saved with the plan</span>
                        </h3>
                        <SelectRow
                          label="Display unit"
                          help="Unit used for lengths and areas on screen. Measurements are stored in the plan scale."
                          value={viewSettings.displayUnit}
                          options={UNIT_OPTIONS}
                          onChange={(displayUnit) => onViewSettingsChange({ displayUnit })}
                        />
                        <SelectRow
                          label="Polygon area"
                          help="Auto picks square units from the display unit; Acres always shows acres."
                          value={viewSettings.areaDisplay}
                          options={AREA_DISPLAY_OPTIONS}
                          onChange={(areaDisplay) => onViewSettingsChange({ areaDisplay })}
                        />
                        <SwitchRow
                          label="Labels"
                          help="Shows the calculated value next to each measurement."
                          checked={viewSettings.showLabels}
                          onChange={(showLabels) => onViewSettingsChange({ showLabels })}
                        />
                        <SwitchRow
                          label="Measurements"
                          help="Shows the drawn geometry on the plan."
                          checked={viewSettings.showMeasurements}
                          onChange={(showMeasurements) =>
                            onViewSettingsChange({ showMeasurements })
                          }
                        />
                        <SwitchRow
                          label="Calibration"
                          help="Shows the scale reference lines and their labels."
                          checked={viewSettings.showCalibration}
                          onChange={(showCalibration) => onViewSettingsChange({ showCalibration })}
                        />
                      </>
                    )}
                    {!viewSettings && (
                      <p className={styles.sectionNote}>
                        Open a plan to change its display unit and visibility settings.
                      </p>
                    )}
                    <p className={styles.sectionNote}>
                      Line thickness, label size, fills and other canvas appearance settings are in
                      Canvas.
                    </p>
                  </div>
                )}

                {section === "canvas" && (
                  <div className={styles.settingList}>
                    <h3 className={styles.groupTitle}>
                      This device
                      <span>Applies to every project</span>
                    </h3>
                    <SelectRow
                      label="Line thickness"
                      help="Stroke width of measurements on the plan. Does not change exports."
                      value={preferences.lineThickness}
                      options={LINE_THICKNESS_OPTIONS}
                      onChange={set("lineThickness")}
                    />
                    <SelectRow
                      label="Label size"
                      help="Text size of measurement labels on the plan. Does not change exports."
                      value={preferences.labelSize}
                      options={LABEL_SIZE_OPTIONS}
                      onChange={set("labelSize")}
                    />
                    <SelectRow
                      label="Fill opacity"
                      help="Transparency of polygon, rectangle, ellipse and cloud fills on the plan. Does not change exports."
                      value={preferences.fillOpacity}
                      options={FILL_OPACITY_OPTIONS}
                      onChange={set("fillOpacity")}
                    />
                    <SelectRow
                      label="Handle size"
                      help="Visible size of vertex handles. The touch area does not change."
                      value={preferences.handleSize}
                      options={HANDLE_SIZE_OPTIONS}
                      onChange={set("handleSize")}
                    />
                    <SelectRow
                      label="Label background"
                      help="Background behind measurement labels. With None the text gets a light outline to stay readable. Does not change exports."
                      value={preferences.labelBackground}
                      options={LABEL_BACKGROUND_OPTIONS}
                      onChange={set("labelBackground")}
                    />
                    <SelectRow
                      label="Page grid"
                      help="Draws a faint grid over the page as a visual aid. It is not saved and does not change exports."
                      value={preferences.pageGrid}
                      options={PAGE_GRID_OPTIONS}
                      onChange={set("pageGrid")}
                    />
                  </div>
                )}

                {section === "confirmations" && (
                  <div className={styles.settingList}>
                    {onConfirmMeasurementDeletionChange && (
                      <SwitchRow
                        label="Confirm before deleting measurements"
                        checked={confirmMeasurementDeletion}
                        onChange={onConfirmMeasurementDeletionChange}
                      />
                    )}
                    {onConfirmValueDeletionChange && (
                      <SwitchRow
                        label="Confirm before deleting values"
                        checked={confirmValueDeletion}
                        onChange={onConfirmValueDeletionChange}
                      />
                    )}
                    {onConfirmDimensionDeletionChange && (
                      <SwitchRow
                        label="Confirm before deleting dimensions"
                        checked={confirmDimensionDeletion}
                        onChange={onConfirmDimensionDeletionChange}
                      />
                    )}
                  </div>
                )}

                {section === "advanced" && (
                  <div className={styles.settingList}>
                    <SelectRow
                      label="Maximum zoom"
                      help="Highest magnification of the plan viewer. Higher values render more detail but use more memory."
                      value={String(preferences.maxZoom)}
                      options={MAX_ZOOM_OPTIONS}
                      onChange={(value) =>
                        setAppPreference("maxZoom", Number(value) as AppPreferences["maxZoom"])
                      }
                    />
                    <SelectRow
                      label="Undo history"
                      help="How many edits can be undone. Longer histories use more memory on large projects."
                      value={String(preferences.undoDepth)}
                      options={UNDO_DEPTH_OPTIONS}
                      onChange={(value) =>
                        setAppPreference("undoDepth", Number(value) as AppPreferences["undoDepth"])
                      }
                    />
                    <SelectRow
                      label="Render delay"
                      help="Wait after zooming or panning before the plan is redrawn sharply. Lower is crisper sooner, higher is lighter on slow devices."
                      value={String(preferences.renderDelayMs)}
                      options={RENDER_DELAY_OPTIONS}
                      onChange={(value) =>
                        setAppPreference(
                          "renderDelayMs",
                          Number(value) as AppPreferences["renderDelayMs"],
                        )
                      }
                    />
                    <div className={styles.resetRow}>
                      <div className={styles.resetCopy}>
                        <span className={styles.settingLabel}>Reset settings</span>
                        <span className={styles.resetHint}>
                          Restores every option on this device to its default. Projects are not
                          changed.
                        </span>
                      </div>
                      {confirmingReset ? (
                        <div className={styles.resetActions}>
                          <Button
                            size="compact"
                            variant="secondary"
                            onClick={() => setConfirmingReset(false)}
                          >
                            Cancel
                          </Button>
                          <Button size="compact" variant="danger" onClick={resetAll}>
                            Reset
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="compact"
                          variant="secondary"
                          onClick={() => setConfirmingReset(true)}
                        >
                          Reset…
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Dialog>,
          document.body,
        )}
    </>
  );
}
