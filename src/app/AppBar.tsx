import { useRef } from "react";
import { AnchoredMenu, Button, IconButton, type AnchoredMenuItem } from "../components/ui";
import { useRovingFocusGroup } from "../components/ui/rovingFocus";
import type { ClassificationDimension, MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { SettingsButton } from "./SettingsButton";
import type { LabelPreviewMeasurement, ProjectViewSettings } from "./SettingsDialog";
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
  documentName: string | null;
  canExport: boolean;
  savedProjectCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  labelPreviewMeasurement?: LabelPreviewMeasurement | null;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  viewSettings?: ProjectViewSettings | null;
  classificationDimensions?: readonly ClassificationDimension[];
  keyboardAuthoringEnabled?: boolean;
  confirmMeasurementDeletion?: boolean;
  confirmValueDeletion?: boolean;
  confirmDimensionDeletion?: boolean;
  confirmScaleDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onExport: () => void;
  onOpenProjects?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onViewSettingsChange?: (settings: Partial<ProjectViewSettings>) => void;
  onKeyboardAuthoringEnabledChange?: (enabled: boolean) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onConfirmValueDeletionChange?: (enabled: boolean) => void;
  onConfirmDimensionDeletionChange?: (enabled: boolean) => void;
  onConfirmScaleDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M8.11 4.20 L9.07 2.15 L10.93 2.15 L11.89 4.20 L12.77 4.56 L14.89 3.80 L16.20 5.11 L15.44 7.23 L15.80 8.11 L17.85 9.07 L17.85 10.93 L15.80 11.89 L15.44 12.77 L16.20 14.89 L14.89 16.20 L12.77 15.44 L11.89 15.80 L10.93 17.85 L9.07 17.85 L8.11 15.80 L7.23 15.44 L5.11 16.20 L3.80 14.89 L4.56 12.77 L4.20 11.89 L2.15 10.93 L2.15 9.07 L4.20 8.11 L4.56 7.23 L3.80 5.11 L5.11 3.80 L7.23 4.56Z" />
      <circle cx="10" cy="10" r="2.2" />
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
  documentName,
  canExport,
  savedProjectCount = 0,
  canUndo = false,
  canRedo = false,
  labelPreviewMeasurement = null,
  measurementDecimalPlaces = null,
  viewSettings = null,
  classificationDimensions,
  keyboardAuthoringEnabled = false,
  confirmMeasurementDeletion = true,
  confirmValueDeletion = true,
  confirmDimensionDeletion = true,
  confirmScaleDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onExport,
  onOpenProjects,
  onUndo,
  onRedo,
  onMeasurementDecimalPlacesChange,
  onViewSettingsChange,
  onKeyboardAuthoringEnabledChange,
  onConfirmMeasurementDeletionChange,
  onConfirmValueDeletionChange,
  onConfirmDimensionDeletionChange,
  onConfirmScaleDeletionChange,
  onRecoveredPlanStartupWorkspaceChange,
}: AppBarProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsFocus = useRovingFocusGroup(actionsRef, { orientation: "horizontal" });

  return (
    <header
      className={styles.appBar}
      aria-label="Application bar"
    >
      <div className={styles.identityGroup}>
        <div className={styles.brand}>Plan Measure</div>
        <span className={styles.identityDivider} aria-hidden="true" />
        <div className={styles.documentName} title={documentName ?? undefined}>
          {documentName ?? "No PDF loaded"}
        </div>
      </div>

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
            tooltip="Undo (Ctrl+Z / ⌘Z)"
            tooltipPosition="bottom"
            disabled={!canUndo}
            onClick={onUndo}
          />
          <IconButton
            className={styles.iconAction}
            icon={<RedoIcon />}
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            tooltip="Redo (Ctrl+Shift+Z / ⌘⇧Z)"
            tooltipPosition="bottom"
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
            placement="bottom-end"
          />
          <SettingsButton
            trigger={<SettingsIcon />}
            triggerClassName={styles.iconAction}
            labelPreviewMeasurement={labelPreviewMeasurement}
            measurementDecimalPlaces={measurementDecimalPlaces}
            viewSettings={viewSettings}
            classificationDimensions={classificationDimensions}
            keyboardAuthoringEnabled={keyboardAuthoringEnabled}
            confirmMeasurementDeletion={confirmMeasurementDeletion}
            confirmValueDeletion={confirmValueDeletion}
            confirmDimensionDeletion={confirmDimensionDeletion}
            confirmScaleDeletion={confirmScaleDeletion}
            recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
            onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
            onViewSettingsChange={onViewSettingsChange}
            onKeyboardAuthoringEnabledChange={onKeyboardAuthoringEnabledChange}
            onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
            onConfirmValueDeletionChange={onConfirmValueDeletionChange}
            onConfirmDimensionDeletionChange={onConfirmDimensionDeletionChange}
            onConfirmScaleDeletionChange={onConfirmScaleDeletionChange}
            onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
          />
        </div>
      </div>
    </header>
  );
}
