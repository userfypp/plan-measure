import { useRef, type ReactNode } from "react";
import { AnchoredMenu, Button, IconButton, type AnchoredMenuItem } from "../components/ui";
import { useRovingFocusGroup } from "../components/ui/rovingFocus";
import type { MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { SettingsPopover } from "./SettingsPopover";
import styles from "./AppBar.module.css";

const FEEDBACK_ITEMS: readonly AnchoredMenuItem[] = [
  {
    id: "feedback",
    label: "Give feedback",
    href: "https://github.com/userfypp/plan-measure/discussions/1",
    target: "_blank",
    rel: "noopener noreferrer",
  },
  {
    id: "feature-request",
    label: "Request a feature",
    href: "https://github.com/userfypp/plan-measure/issues/new?template=feature_request.yml",
    target: "_blank",
    rel: "noopener noreferrer",
  },
  {
    id: "bug-report",
    label: "Report a bug",
    href: "https://github.com/userfypp/plan-measure/issues/new?template=bug_report.yml",
    target: "_blank",
    rel: "noopener noreferrer",
  },
];

interface AppBarProps {
  saveStatus?: ReactNode;
  documentName: string | null;
  canExport: boolean;
  savedProjectCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  keyboardAuthoringEnabled?: boolean;
  confirmMeasurementDeletion?: boolean;
  confirmValueDeletion?: boolean;
  confirmDimensionDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onExport: () => void;
  onOpenProjects?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onKeyboardAuthoringEnabledChange?: (enabled: boolean) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onConfirmValueDeletionChange?: (enabled: boolean) => void;
  onConfirmDimensionDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <g transform="translate(0 1.5)">
        <path d="M8.62 2.29h2.75l0.47 1.78a6.33 6.33 0 0 1 1.17 0.68l1.73 -0.62 1.38 2.38 -1.27 1.33a6.5 6.5 0 0 1 0 1.35l1.27 1.33 -1.38 2.38 -1.73 -0.62a6.33 6.33 0 0 1 -1.17 0.68l-0.47 1.78h-2.75l-0.47 -1.78a6.33 6.33 0 0 1 -1.17 -0.68l-1.73 0.62 -1.38 -2.38 1.27 -1.33a6.5 6.5 0 0 1 0 -1.35L3.88 6.51l1.38 -2.38 1.73 0.62a6.33 6.33 0 0 1 1.17 -0.68l0.47 -1.78Z" />
        <circle cx="10" cy="8.5" r="2.54" />
      </g>
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7.5 5 4 8.5 7.5 12" />
      <path d="M4 8.5h7a4.5 4.5 0 0 1 0 9H8" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M12.5 5 16 8.5 12.5 12" />
      <path d="M16 8.5H9a4.5 4.5 0 0 0 0 9h3" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.5 4h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H10l-3.5 3v-3h-2A1.5 1.5 0 0 1 3 12.5v-7A1.5 1.5 0 0 1 4.5 4Z" />
    </svg>
  );
}

export function AppBar({
  saveStatus,
  documentName,
  canExport,
  savedProjectCount = 0,
  canUndo = false,
  canRedo = false,
  measurementDecimalPlaces = null,
  keyboardAuthoringEnabled = false,
  confirmMeasurementDeletion = true,
  confirmValueDeletion = true,
  confirmDimensionDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onExport,
  onOpenProjects,
  onUndo,
  onRedo,
  onMeasurementDecimalPlacesChange,
  onKeyboardAuthoringEnabledChange,
  onConfirmMeasurementDeletionChange,
  onConfirmValueDeletionChange,
  onConfirmDimensionDeletionChange,
  onRecoveredPlanStartupWorkspaceChange,
}: AppBarProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsFocus = useRovingFocusGroup(actionsRef, { orientation: "horizontal" });

  return (
    <header
      className={[styles.appBar, saveStatus ? styles.withSaveStatus : ""].filter(Boolean).join(" ")}
      aria-label="Application bar"
    >
      <div className={styles.identityGroup}>
        <div className={styles.brand}>Plan Measure</div>
        <span className={styles.identityDivider} aria-hidden="true" />
        <div className={styles.documentName} title={documentName ?? undefined}>
          {documentName ?? "No PDF loaded"}
        </div>
      </div>

      {saveStatus}
      <div
        ref={actionsRef}
        {...actionsFocus}
        className={styles.actions}
        role="toolbar"
        aria-label="Application actions"
        aria-orientation="horizontal"
      >
        <div className={styles.group}>
          <IconButton
            className={styles.iconAction}
            icon={<UndoIcon />}
            aria-label="Undo"
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Undo (Ctrl+Z / ⌘Z)"
            disabled={!canUndo}
            onClick={onUndo}
          />
          <IconButton
            className={styles.iconAction}
            icon={<RedoIcon />}
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            title="Redo (Ctrl+Shift+Z / ⌘⇧Z)"
            disabled={!canRedo}
            onClick={onRedo}
          />
        </div>
        <span className={styles.groupDivider} aria-hidden="true" />
        <div className={styles.group}>
          {canExport && (
            <Button
              variant="primary"
              size="compact"
              className={styles.exportAction}
              onClick={onExport}
            >
              Export
            </Button>
          )}
          <Button
            variant="ghost"
            size="compact"
            className={styles.projectsAction}
            aria-haspopup="dialog"
            aria-label={`Projects${savedProjectCount ? `, ${savedProjectCount} saved` : ""}`}
            onClick={onOpenProjects}
          >
            Projects
            {savedProjectCount > 0 && (
              <span className={styles.projectCount} aria-hidden="true">
                {savedProjectCount}
              </span>
            )}
          </Button>
        </div>
        <span className={styles.groupDivider} aria-hidden="true" />
        <div className={styles.group}>
          <AnchoredMenu
            trigger={<FeedbackIcon />}
            triggerProps={{ className: styles.iconTrigger, "aria-label": "Feedback", title: "Feedback" }}
            label="Feedback options"
            items={FEEDBACK_ITEMS}
            showMarkerColumn={false}
            placement="bottom-end"
          />
          <SettingsPopover
            trigger={<SettingsIcon />}
            triggerClassName={styles.iconTrigger}
            measurementDecimalPlaces={measurementDecimalPlaces}
            keyboardAuthoringEnabled={keyboardAuthoringEnabled}
            confirmMeasurementDeletion={confirmMeasurementDeletion}
            confirmValueDeletion={confirmValueDeletion}
            confirmDimensionDeletion={confirmDimensionDeletion}
            recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
            onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
            onKeyboardAuthoringEnabledChange={onKeyboardAuthoringEnabledChange}
            onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
            onConfirmValueDeletionChange={onConfirmValueDeletionChange}
            onConfirmDimensionDeletionChange={onConfirmDimensionDeletionChange}
            onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
          />
        </div>
      </div>
    </header>
  );
}
