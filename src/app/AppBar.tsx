import { useRef } from "react";
import { Button } from "../components/ui";
import { useRovingFocusGroup } from "../components/ui/rovingFocus";
import type { MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { SettingsPopover } from "./SettingsPopover";
import styles from "./AppBar.module.css";

const FEEDBACK_URL = "https://github.com/userfypp/plan-measure/discussions/1";

interface AppBarProps {
  documentName: string | null;
  canExport: boolean;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  confirmMeasurementDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onOpenPdf: () => void;
  onExport: () => void;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
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
  measurementDecimalPlaces = null,
  confirmMeasurementDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onOpenPdf,
  onExport,
  onMeasurementDecimalPlacesChange,
  onConfirmMeasurementDeletionChange,
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
        <Button
          variant="ghost"
          size="compact"
          className={styles.openAction}
          onClick={onOpenPdf}
        >
          Open PDF
        </Button>
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
        <a
          className={styles.feedbackAction}
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Feedback
        </a>
        <SettingsPopover
          trigger={<SettingsIcon />}
          triggerClassName={styles.iconTrigger}
          measurementDecimalPlaces={measurementDecimalPlaces}
          confirmMeasurementDeletion={confirmMeasurementDeletion}
          recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
          onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
          onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
          onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
        />
      </div>
    </header>
  );
}
