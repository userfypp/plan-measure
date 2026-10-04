import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import type { AppErrorNotification } from "./state";
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
  statusMessage?: string | null;
  statusTone?: StatusTone;
  statusActions?: ReactNode;
  onDismissStatus?: () => void;
  errorNotifications?: readonly AppErrorNotification[];
  onDismissError?: (id: number) => void;
}

export function AppShell({
  children,
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
  statusMessage,
  statusTone = "error",
  statusActions,
  onDismissStatus,
  errorNotifications = [],
  onDismissError,
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
        savedProjectCount={savedProjectCount}
        canUndo={canUndo}
        canRedo={canRedo}
        measurementDecimalPlaces={measurementDecimalPlaces}
        confirmMeasurementDeletion={confirmMeasurementDeletion}
        confirmValueDeletion={confirmValueDeletion}
        confirmDimensionDeletion={confirmDimensionDeletion}
        recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
        onExport={onExport}
        onOpenProjects={onOpenProjects}
        onUndo={onUndo}
        onRedo={onRedo}
        onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
        onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
        onConfirmValueDeletionChange={onConfirmValueDeletionChange}
        onConfirmDimensionDeletionChange={onConfirmDimensionDeletionChange}
        onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
      />
      <div className={styles.content}>
        {(statusMessage || errorNotifications.length > 0) && (
          <div className={styles.statusRow}>
            {statusMessage && (
              <StatusNotification
                key={`status:${statusMessage}`}
                message={statusMessage}
                tone={statusTone}
                actions={statusActions}
                onDismiss={onDismissStatus}
              />
            )}
            {errorNotifications.map(({ id, message }) => (
              <StatusNotification
                key={id}
                message={message}
                tone="error"
                onDismiss={onDismissError ? () => onDismissError(id) : undefined}
              />
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function StatusNotification({ message, tone, actions, onDismiss }: {
  message: string;
  tone: StatusTone;
  actions?: ReactNode;
  onDismiss?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const dismissible = Boolean(onDismiss);
  const dismiss = useEffectEvent(() => onDismiss?.());

  useEffect(() => {
    if (!dismissible || hovered || focused) return;
    const timer = window.setTimeout(dismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [dismissible, hovered, focused]);

  return (
    <div
      className={[styles.status, styles[tone], actions ? styles.statusWithActions : ""]
        .filter(Boolean)
        .join(" ")}
      role="alert"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button type="button" aria-label="Dismiss message" onClick={onDismiss}>
          Dismiss
        </button>
      )}
      {actions && <div className={styles.statusActions}>{actions}</div>}
    </div>
  );
}

export function LoadingOverlay({ children }: { children: ReactNode }) {
  return <div className={styles.loadingOverlay}>{children}</div>;
}
