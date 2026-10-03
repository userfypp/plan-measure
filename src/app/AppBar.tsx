import { useRef } from "react";
import { AnchoredMenu, Button, type AnchoredMenuItem } from "../components/ui";
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
  documentName: string | null;
  canExport: boolean;
  savedProjectCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  confirmMeasurementDeletion?: boolean;
  confirmValueDeletion?: boolean;
  confirmDimensionDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onExport: () => void;
  onOpenProjects?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onConfirmValueDeletionChange?: (enabled: boolean) => void;
  onConfirmDimensionDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g transform="translate(0 1.8)">
        <path d="M10.35 2.75h3.3l.56 2.14a7.6 7.6 0 0 1 1.4.81l2.08-.75 1.65 2.86-1.52 1.59a7.8 7.8 0 0 1 0 1.62l1.52 1.59-1.65 2.86-2.08-.75a7.6 7.6 0 0 1-1.4.81l-.56 2.14h-3.3l-.56-2.14a7.6 7.6 0 0 1-1.4-.81l-2.08.75-1.65-2.86 1.52-1.59a7.8 7.8 0 0 1 0-1.62L4.66 7.81l1.65-2.86 2.08.75a7.6 7.6 0 0 1 1.4-.81l.56-2.14Z" />
        <circle cx="12" cy="10.2" r="3.05" />
      </g>
    </svg>
  );
}

export function AppBar({
  documentName,
  canExport,
  savedProjectCount = 0,
  canUndo = false,
  canRedo = false,
  measurementDecimalPlaces = null,
  confirmMeasurementDeletion = true,
  confirmValueDeletion = true,
  confirmDimensionDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onExport,
  onOpenProjects,
  onUndo,
  onRedo,
  onMeasurementDecimalPlacesChange,
  onConfirmMeasurementDeletionChange,
  onConfirmValueDeletionChange,
  onConfirmDimensionDeletionChange,
  onRecoveredPlanStartupWorkspaceChange,
}: AppBarProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsFocus = useRovingFocusGroup(actionsRef, { orientation: "horizontal" });

  return (
    <header className={styles.appBar} aria-label="Application bar">
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
        {canExport && (
          <Button
            variant="ghost"
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
        <Button
          variant="ghost"
          size="compact"
          aria-label="Undo"
          aria-keyshortcuts="Control+Z Meta+Z"
          title="Undo (Ctrl+Z / ⌘Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          Undo
        </Button>
        <Button
          variant="ghost"
          size="compact"
          aria-label="Redo"
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          title="Redo (Ctrl+Shift+Z / ⌘⇧Z)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          Redo
        </Button>
        <AnchoredMenu
          trigger="Feedback"
          triggerProps={{ className: styles.feedbackAction, "aria-label": "Feedback" }}
          label="Feedback options"
          items={FEEDBACK_ITEMS}
          showMarkerColumn={false}
          placement="bottom-end"
        />
        <SettingsPopover
          trigger={<SettingsIcon />}
          triggerClassName={styles.iconTrigger}
          measurementDecimalPlaces={measurementDecimalPlaces}
          confirmMeasurementDeletion={confirmMeasurementDeletion}
          confirmValueDeletion={confirmValueDeletion}
          confirmDimensionDeletion={confirmDimensionDeletion}
          recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
          onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
          onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
          onConfirmValueDeletionChange={onConfirmValueDeletionChange}
          onConfirmDimensionDeletionChange={onConfirmDimensionDeletionChange}
          onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
        />
      </div>
    </header>
  );
}
