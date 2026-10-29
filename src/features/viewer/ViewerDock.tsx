import { useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { PageCalibration, SessionSettings } from "../../types/domain";
import {
  AnchoredMenu,
  Button,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  IconButton,
  Input,
  PlusIcon,
  Popover,
  Select,
  Switch,
} from "../../components/ui";
import { useRovingFocusGroup } from "../../components/ui/rovingFocus";
import { decidePageLabelOverride } from "../../utils/pageLabels";
import type { ViewerNavigationModel } from "./ViewerNavigation";
import { scaleDisplayMetadata } from "./scaleDisplay";
import { setAppPreference, useAppPreferences } from "../../utils/appPreferences";
import styles from "./ViewerDock.module.css";

type ViewerSettings = Pick<
  SessionSettings,
  "displayUnit" | "areaDisplay" | "showLabels" | "showMeasurements" | "showCalibration"
>;

const DISPLAY_UNIT_OPTIONS: Array<{ value: ViewerSettings["displayUnit"]; label: string }> = [
  { value: "mm", label: "Millimetres" },
  { value: "cm", label: "Centimetres" },
  { value: "m", label: "Metres" },
  { value: "in", label: "Inches" },
  { value: "ft", label: "Feet" },
  { value: "ft-in", label: "Feet & inches" },
];

const AREA_DISPLAY_OPTIONS: Array<{ value: ViewerSettings["areaDisplay"]; label: string }> = [
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

function PagesIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 2.75h5.75l3.75 3.75v9.75a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V4.25A1.5 1.5 0 0 1 6 2.75Z" />
      <path d="M11.75 2.75v3a.75.75 0 0 0 .75.75h3M7.5 9.5h5M7.5 12.25h5M7.5 15h2.5" />
    </svg>
  );
}

export interface ViewerDockProps {
  navigation: ViewerNavigationModel;
  pagesOpen?: boolean;
  onTogglePages?: () => void;
  /** Called when the Pages trigger is about to be used, to prepare the panel. */
  onPreparePages?: () => void;
  sourcePageLabel: string | null;
  customPageLabel: string | null;
  effectivePageLabel: string;
  /** The PDF's labels are still being read, so the label is not shown yet rather than "No label". */
  pageLabelPending?: boolean;
  calibrations: readonly PageCalibration[];
  activeCalibrationId: string | null;
  pageNavigationDisabled?: boolean;
  scaleSwitchDisabled?: boolean;
  copiedScaleName?: string | null;
  scaleApplyDisabled?: boolean;
  settings: ViewerSettings;
  onScaleChange: (calibrationId: string) => void;
  onApplyCopiedScale: () => void;
  onSetPageLabelOverride: (label: string) => void;
  onRemovePageLabelOverride: () => void;
  onSettingsChange: (settings: Partial<ViewerSettings>) => void;
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 10h10" />
    </svg>
  );
}

function FitIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 4H4v3M13 4h3v3M7 16H4v-3M13 16h3v-3" />
    </svg>
  );
}

export function ViewerDock({
  navigation,
  pagesOpen = false,
  onTogglePages,
  onPreparePages,
  sourcePageLabel,
  customPageLabel,
  effectivePageLabel,
  pageLabelPending = false,
  calibrations,
  activeCalibrationId,
  pageNavigationDisabled = false,
  scaleSwitchDisabled = false,
  copiedScaleName = null,
  scaleApplyDisabled = false,
  settings,
  onScaleChange,
  onApplyCopiedScale,
  onSetPageLabelOverride,
  onRemovePageLabelOverride,
  onSettingsChange,
}: ViewerDockProps) {
  const pageLabelInputId = useId();
  const displayUnitId = useId();
  const displayUnitLabelId = useId();
  const areaDisplayId = useId();
  const areaDisplayLabelId = useId();
  const lineThicknessId = useId();
  const lineThicknessLabelId = useId();
  const labelSizeId = useId();
  const labelSizeLabelId = useId();
  const appPreferences = useAppPreferences();
  const pageLabelInputRef = useRef<HTMLInputElement>(null);
  const pageNavigationRef = useRef<HTMLDivElement>(null);
  const pageNavigationFocus = useRovingFocusGroup(pageNavigationRef, { orientation: "horizontal" });
  const zoomControlsRef = useRef<HTMLDivElement>(null);
  const zoomControlsFocus = useRovingFocusGroup(zoomControlsRef, { orientation: "horizontal" });
  const editingPageNumberRef = useRef<number | null>(null);
  const originalEffectivePageLabelRef = useRef("");
  const [pageLabelEditorOpen, setPageLabelEditorOpen] = useState(false);
  const [pageLabelDraft, setPageLabelDraft] = useState("");
  const [pageLabelError, setPageLabelError] = useState<string | null>(null);
  const activeCalibration =
    calibrations.find((calibration) => calibration.id === activeCalibrationId) ?? null;
  const activeMetadata = activeCalibration ? scaleDisplayMetadata(activeCalibration) : null;
  const scaleItems = calibrations.map((calibration) => {
    const metadata = scaleDisplayMetadata(calibration);
    const active = calibration.id === activeCalibrationId;
    return {
      id: calibration.id,
      role: "menuitemradio" as const,
      checked: active,
      current: active,
      disabled: scaleSwitchDisabled,
      onSelect: () => onScaleChange(calibration.id),
      label: (
        <span className={styles.scaleMenuLabel}>
          <strong title={calibration.name}>{calibration.name}</strong>
          <small>{metadata.detailLabel}</small>
        </span>
      ),
    };
  });

  useLayoutEffect(() => {
    if (!pageLabelEditorOpen) return;
    if (editingPageNumberRef.current !== navigation.pageNumber) {
      setPageLabelEditorOpen(false);
      setPageLabelError(null);
      return;
    }
    pageLabelInputRef.current?.focus({ preventScroll: true });
    pageLabelInputRef.current?.select();
  }, [navigation.pageNumber, pageLabelEditorOpen]);

  function handlePageLabelOpenChange(open: boolean) {
    if (open) {
      editingPageNumberRef.current = navigation.pageNumber;
      originalEffectivePageLabelRef.current = effectivePageLabel;
      setPageLabelDraft(effectivePageLabel);
      setPageLabelError(null);
    }
    setPageLabelEditorOpen(open);
  }

  function closePageLabelEditor() {
    setPageLabelError(null);
    setPageLabelEditorOpen(false);
  }

  function handlePageLabelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision = decidePageLabelOverride({
      draft: pageLabelDraft,
      originalEffectiveLabel: originalEffectivePageLabelRef.current,
      customPageLabel,
      sourcePageLabel,
    });
    if (decision.kind === "invalid") {
      setPageLabelError("Use a single-line label without control characters.");
      return;
    }
    if (decision.kind === "set") onSetPageLabelOverride(decision.value);
    if (decision.kind === "remove") onRemovePageLabelOverride();
    closePageLabelEditor();
  }

  const pageLabelTriggerAriaLabel = effectivePageLabel
    ? `Page label: ${effectivePageLabel}. Page ${navigation.pageNumber} of ${navigation.pageCount}. Edit page label`
    : `Page ${navigation.pageNumber} of ${navigation.pageCount}. No page label. Set page label`;

  return (
    <nav className={styles.dock} aria-label="Viewer controls">
      <div
        ref={pageNavigationRef}
        {...pageNavigationFocus}
        className={styles.group}
        role="toolbar"
        aria-label="Page navigation"
        aria-orientation="horizontal"
      >
        {onTogglePages && (
          <IconButton
            className={styles.pagesTrigger}
            icon={<PagesIcon />}
            aria-label="Pages"
            tooltip="Pages"
            pressed={pagesOpen}
            aria-controls="page-browser"
            onPointerEnter={onPreparePages}
            onFocus={onPreparePages}
            onClick={onTogglePages}
          />
        )}
        <Button
          variant="ghost"
          size="compact"
          className={styles.iconButton}
          aria-label="Previous page"
          title="Previous page"
          disabled={pageNavigationDisabled || navigation.pageNumber <= 1}
          disabledReason={
            pageNavigationDisabled
              ? "Finish or cancel the current drawing or scale workflow before changing pages."
              : undefined
          }
          onClick={() => navigation.onPageChange(navigation.pageNumber - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Popover
          trigger={
            <span className={styles.pageTriggerText}>
              <strong
                className={[styles.settlingValue, pageLabelPending ? styles.pendingValue : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {effectivePageLabel || "No label"}
              </strong>
              <small>
                {navigation.pageNumber} / {navigation.pageCount}
              </small>
            </span>
          }
          triggerProps={{
            className: styles.pageTrigger,
            "aria-label": pageLabelTriggerAriaLabel,
            title: effectivePageLabel || "Set page label",
          }}
          open={pageLabelEditorOpen}
          onOpenChange={handlePageLabelOpenChange}
          placement="bottom-start"
          initialFocus="first"
          dismissOnFocusLeave
          role="dialog"
          aria-label="Page label"
          className={styles.pageLabelPopover}
        >
          <form className={styles.pageLabelEditor} onSubmit={handlePageLabelSubmit}>
            <strong className={styles.pageLabelHeading}>Page label</strong>
            <Input
              label="Label"
              ref={pageLabelInputRef}
              id={pageLabelInputId}
              data-popover-autofocus="true"
              type="text"
              value={pageLabelDraft}
              aria-invalid={pageLabelError ? true : undefined}
              onChange={(event) => {
                setPageLabelDraft(event.target.value);
                if (pageLabelError) setPageLabelError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
            />
            <div className={styles.pageLabelSource}>
              PDF label:{" "}
              <span title={sourcePageLabel ?? undefined}>
                {sourcePageLabel === null ? "None" : sourcePageLabel}
              </span>
            </div>
            {pageLabelError && (
              <div className={styles.pageLabelError} role="alert">
                {pageLabelError}
              </div>
            )}
            <div className={styles.pageLabelActions}>
              {customPageLabel !== null && (
                <Button
                  variant="secondary"
                  size="compact"
                  className={styles.pageLabelReset}
                  onClick={() => {
                    onRemovePageLabelOverride();
                    closePageLabelEditor();
                  }}
                >
                  {sourcePageLabel === null ? "Remove label" : "Restore PDF label"}
                </Button>
              )}
              <Button variant="ghost" size="compact" onClick={closePageLabelEditor}>
                Cancel
              </Button>
              <Button size="compact" type="submit">
                Save
              </Button>
            </div>
          </form>
        </Popover>
        <Button
          variant="ghost"
          size="compact"
          className={styles.iconButton}
          aria-label="Next page"
          title="Next page"
          disabled={pageNavigationDisabled || navigation.pageNumber >= navigation.pageCount}
          disabledReason={
            pageNavigationDisabled
              ? "Finish or cancel the current drawing or scale workflow before changing pages."
              : undefined
          }
          onClick={() => navigation.onPageChange(navigation.pageNumber + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <span className={styles.separator} aria-hidden="true" />

      <div
        ref={zoomControlsRef}
        {...zoomControlsFocus}
        className={styles.group}
        role="toolbar"
        aria-label="Zoom controls"
        aria-orientation="horizontal"
      >
        <Button
          variant="ghost"
          size="compact"
          className={styles.iconButton}
          aria-label="Zoom out"
          aria-keyshortcuts="-"
          title="Zoom out"
          onClick={navigation.onZoomOut}
        >
          <MinusIcon />
        </Button>
        <span
          className={[
            styles.zoomValue,
            styles.settlingValue,
            navigation.zoomPending ? styles.pendingValue : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {Math.round(navigation.zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="compact"
          className={styles.iconButton}
          aria-label="Zoom in"
          aria-keyshortcuts="+"
          title="Zoom in"
          onClick={navigation.onZoomIn}
        >
          <PlusIcon />
        </Button>
        <Button
          variant="ghost"
          size="compact"
          className={styles.iconButton}
          aria-label="Fit page"
          title="Fit page"
          onClick={navigation.onFit}
        >
          <FitIcon />
        </Button>
      </div>

      <span className={styles.separator} aria-hidden="true" />

      <AnchoredMenu
        trigger={
          <>
            <span className={styles.scaleTriggerText}>
              <strong>{activeCalibration?.name ?? "No active scale"}</strong>
              {activeMetadata ? (
                <small className={styles.scaleMetadata}>
                  <span className={styles.scaleRatio}>{activeMetadata.ratioLabel}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{activeMetadata.modeLabel}</span>
                </small>
              ) : (
                <small>Create a scale to measure</small>
              )}
            </span>
            <ChevronDownIcon className={styles.chevron} />
          </>
        }
        triggerProps={{
          className: styles.scaleTrigger,
          disabled: calibrations.length === 0,
          "aria-disabled": calibrations.length > 0 && scaleSwitchDisabled ? true : undefined,
          title: scaleSwitchDisabled
            ? "Finish or cancel the current scale workflow before switching active scale."
            : undefined,
          onClick: (event) => {
            if (scaleSwitchDisabled) event.preventDefault();
          },
          "aria-label": activeCalibration
            ? `Active scale: ${activeCalibration.name}, ${activeMetadata?.ratioLabel}, ${activeMetadata?.modeLabel}. ${
                scaleSwitchDisabled
                  ? "Switching unavailable while the current scale workflow is active."
                  : "Switch active scale"
              }`
            : "Active scale: none. Create a scale to measure.",
        }}
        label="Active scale"
        items={scaleItems}
        placement="bottom-end"
        matchTriggerWidth
      />

      {copiedScaleName !== null && (
        <Button
          variant="secondary"
          size="compact"
          className={styles.applyCopiedScaleButton}
          aria-label="Apply copied scale to this page"
          title={`Apply “${copiedScaleName}” to this page`}
          disabled={scaleApplyDisabled}
          disabledReason={
            scaleApplyDisabled
              ? "Finish or cancel the current drawing or scale workflow before applying a scale."
              : undefined
          }
          onClick={onApplyCopiedScale}
        >
          Apply copied scale
        </Button>
      )}

      <span className={styles.separator} aria-hidden="true" />

      <Popover
        trigger={
          <span className={styles.viewTriggerContent}>
            <EyeIcon />
            <span className={styles.viewLabel}>View</span>
          </span>
        }
        triggerProps={{ className: styles.viewTrigger, "aria-label": "View options" }}
        placement="bottom-end"
        initialFocus="first"
        dismissOnFocusLeave
        role="dialog"
        aria-label="View options"
        className={styles.viewPopover}
      >
        <div className={styles.viewOptions}>
          <div className={styles.menuHeader}>
            <strong>View settings</strong>
            <span>Control plan annotations and units.</span>
          </div>
          <div className={styles.settingBlock}>
            <div className={`${styles.unit} ${styles.stackOnNarrow}`}>
              <span id={displayUnitLabelId} className={styles.settingLabel}>
                Display unit
              </span>
              <Select
                id={displayUnitId}
                className={styles.unitSelect}
                label="Display unit"
                labelledBy={displayUnitLabelId}
                value={settings.displayUnit}
                options={DISPLAY_UNIT_OPTIONS}
                onChange={(displayUnit) => onSettingsChange({ displayUnit })}
              />
            </div>
            <div className={`${styles.unit} ${styles.stackOnNarrow}`}>
              <span id={areaDisplayLabelId} className={styles.settingLabel}>
                Polygon area
              </span>
              <Select
                id={areaDisplayId}
                className={styles.unitSelect}
                label="Polygon area"
                labelledBy={areaDisplayLabelId}
                value={settings.areaDisplay}
                options={AREA_DISPLAY_OPTIONS}
                onChange={(areaDisplay) => onSettingsChange({ areaDisplay })}
              />
            </div>
            <div className={`${styles.unit} ${styles.stackOnNarrow}`}>
              <span id={lineThicknessLabelId} className={styles.settingLabel}>
                Line thickness
              </span>
              <Select
                id={lineThicknessId}
                className={styles.unitSelect}
                label="Line thickness"
                labelledBy={lineThicknessLabelId}
                value={appPreferences.lineThickness}
                options={LINE_THICKNESS_OPTIONS}
                onChange={(value) => setAppPreference("lineThickness", value)}
              />
            </div>
            <div className={`${styles.unit} ${styles.stackOnNarrow}`}>
              <span id={labelSizeLabelId} className={styles.settingLabel}>
                Label size
              </span>
              <Select
                id={labelSizeId}
                className={styles.unitSelect}
                label="Label size"
                labelledBy={labelSizeLabelId}
                value={appPreferences.labelSize}
                options={LABEL_SIZE_OPTIONS}
                onChange={(value) => setAppPreference("labelSize", value)}
              />
            </div>
          </div>
          <span className={styles.menuDivider} aria-hidden="true" />
          <div className={styles.settingBlock}>
            <ViewToggle
              label="Labels"
              description="Show calculated values"
              checked={settings.showLabels}
              onChange={(checked) => onSettingsChange({ showLabels: checked })}
            />
            <ViewToggle
              label="Measurements"
              description="Show drawn geometry"
              checked={settings.showMeasurements}
              onChange={(checked) => onSettingsChange({ showMeasurements: checked })}
            />
            <ViewToggle
              label="Calibration"
              description="Show scale references"
              checked={settings.showCalibration}
              onChange={(checked) => onSettingsChange({ showCalibration: checked })}
            />
          </div>
        </div>
      </Popover>
    </nav>
  );
}

function ViewToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const labelId = useId();
  return (
    <div className={styles.toggle}>
      <div className={styles.toggleText}>
        <span id={labelId} className={styles.settingLabel}>
          {label}
        </span>
        <small>{description}</small>
      </div>
      <Switch aria-labelledby={labelId} checked={checked} onChange={onChange} />
    </div>
  );
}
