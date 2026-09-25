import { useRef, type ReactNode } from "react";
import type { MeasurementDecimalPlaces } from "../types/domain";
import { AppBar } from "./AppBar";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { useManagedTabNavigation } from "../components/ui/tabNavigation";
import styles from "./AppShell.module.css";

type StatusTone = "error" | "warning";

interface AppShellProps {
  children: ReactNode;
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
  statusMessage?: string | null;
  statusTone?: StatusTone;
  onDismissStatus?: () => void;
}

export function AppShell({
  children,
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
  statusMessage,
  statusTone = "error",
  onDismissStatus,
}: AppShellProps) {
  const tabNavigationRootRef = useRef<HTMLDivElement>(null);
  useManagedTabNavigation(tabNavigationRootRef);

  return (
    <div
      ref={tabNavigationRootRef}
      className={styles.appShell}
      data-tab-navigation-root
    >
      <AppBar
        documentName={documentName}
        canExport={canExport}
        measurementDecimalPlaces={measurementDecimalPlaces}
        confirmMeasurementDeletion={confirmMeasurementDeletion}
        recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
        onOpenPdf={onOpenPdf}
        onExport={onExport}
        onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
        onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
        onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
      />
      <div className={styles.statusRow}>
        {statusMessage ? (
          <div className={`${styles.status} ${styles[statusTone]}`} role="alert">
            <span>{statusMessage}</span>
            {onDismissStatus && (
              <button type="button" aria-label="Dismiss message" onClick={onDismissStatus}>
                Dismiss
              </button>
            )}
          </div>
        ) : (
          <div className={styles.statusPlaceholder} aria-hidden="true" />
        )}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export function LoadingOverlay({ children }: { children: ReactNode }) {
  return <div className={styles.loadingOverlay}>{children}</div>;
}
