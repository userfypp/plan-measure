import { useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { PageCalibration, SessionSettings } from "../../types/domain";
import { AnchoredMenu, Button, Popover, Switch } from "../../components/ui";
import { decidePageLabelOverride } from "../../utils/pageLabels";
import type { ViewerNavigationModel } from "./ViewerNavigation";
import { scaleDisplayMetadata } from "./scaleDisplay";
import styles from "./ViewerDock.module.css";

type ViewerSettings = Pick<
  SessionSettings,
  "displayUnit" | "areaDisplay" | "showLabels" | "showMeasurements" | "showCalibration"
>;

export interface ViewerDockProps {
  navigation: ViewerNavigationModel;
  sourcePageLabel: string | null;
  customPageLabel: string | null;
  effectivePageLabel: string;
  calibrations: readonly PageCalibration[];
  activeCalibrationId: string | null;
  pageNavigationDisabled?: boolean;
  scaleSwitchDisabled?: boolean;
  settings: ViewerSettings;
  onScaleChange: (calibrationId: string) => void;
  onSetPageLabelOverride: (label: string) => void;
  onRemovePageLabelOverride: () => void;
  onSettingsChange: (settings: Partial<ViewerSettings>) => void;
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m12 5-5 5 5 5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m8 5 5 5-5 5" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 10h10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 10h10M10 5v10" />
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

function DisclosureIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m6.5 8 3.5 4 3.5-4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

export function ViewerDock({
  navigation,
  sourcePageLabel,
  customPageLabel,
  effectivePageLabel,
  calibrations,
  activeCalibrationId,
  pageNavigationDisabled = false,
  scaleSwitchDisabled = false,
  settings,
  onScaleChange,
  onSetPageLabelOverride,
  onRemovePageLabelOverride,
  onSettingsChange,
}: ViewerDockProps) {
  const pageLabelInputId = useId();
  const pageLabelInputRef = useRef<HTMLInputElement>(null);
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
          <strong>{calibration.name}</strong>
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
      <div className={styles.group} aria-label="Page navigation">
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
              <strong>{effectivePageLabel || "No label"}</strong>
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
            <label className={styles.pageLabelField} htmlFor={pageLabelInputId}>
              <span>Label</span>
              <input
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
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
              />
            </label>
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
              <Button variant="secondary" size="compact" onClick={closePageLabelEditor}>
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

      <div className={styles.group} aria-label="Zoom controls">
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
        <span className={styles.zoomValue}>{Math.round(navigation.zoom * 100)}%</span>
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
          aria-label="Fit page to viewer"
          title="Fit"
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
            <DisclosureIcon />
            {activeCalibration && (
              <span className={styles.scaleFullName} data-scale-full-name aria-hidden="true">
                {activeCalibration.name}
              </span>
            )}
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
      />

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
          <label className={styles.unit}>
            <span>Display unit</span>
            <select
              value={settings.displayUnit}
              onChange={(event) =>
                onSettingsChange({ displayUnit: event.target.value as ViewerSettings["displayUnit"] })
              }
            >
              <option value="mm">Millimetres</option>
              <option value="cm">Centimetres</option>
              <option value="m">Metres</option>
              <option value="in">Inches</option>
              <option value="ft">Feet</option>
              <option value="ft-in">Feet &amp; inches</option>
            </select>
          </label>
          <label className={styles.unit}>
            <span>Polygon area</span>
            <select
              value={settings.areaDisplay}
              onChange={(event) =>
                onSettingsChange({
                  areaDisplay: event.target.value as ViewerSettings["areaDisplay"],
                })
              }
            >
              <option value="auto">Auto</option>
              <option value="ac">Acres</option>
            </select>
          </label>
          <span className={styles.menuDivider} aria-hidden="true" />
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
  const switchId = useId();
  return (
    <div className={styles.toggle}>
      <label className={styles.toggleText} htmlFor={switchId}>
        <strong>{label}</strong>
        <small>{description}</small>
      </label>
      <Switch id={switchId} checked={checked} onChange={onChange} />
    </div>
  );
}
