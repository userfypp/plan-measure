import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AppErrorNotification } from "./state";
import type { ClassificationDimension, MeasurementDecimalPlaces } from "../types/domain";
import type { LabelPreviewMeasurement, ProjectViewSettings } from "./SettingsDialog";
import { AppBar } from "./AppBar";
import { Button } from "../components/ui";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { useManagedTabNavigation } from "../components/ui/tabNavigation";
import styles from "./AppShell.module.css";

type StatusTone = "error" | "warning";

interface AppShellProps {
  interactionBlocked?: boolean;
  saveStatus?: ReactNode;
  children: ReactNode;
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
  onCloseProject?: () => void;
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
  statusMessage?: string | null;
  statusTone?: StatusTone;
  statusActions?: ReactNode;
  onDismissStatus?: () => void;
  errorNotifications?: readonly AppErrorNotification[];
  onDismissError?: (id: number) => void;
}

export function AppShell({
  interactionBlocked = false,
  saveStatus,
  children,
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
  onCloseProject,
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
      inert={interactionBlocked}
      aria-busy={interactionBlocked || undefined}
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
        onExport={onExport}
        onOpenProjects={onOpenProjects}
        onCloseProject={onCloseProject}
        onUndo={onUndo}
        onRedo={onRedo}
        onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
        onViewSettingsChange={onViewSettingsChange}
        onKeyboardAuthoringEnabledChange={onKeyboardAuthoringEnabledChange}
        onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
        onConfirmValueDeletionChange={onConfirmValueDeletionChange}
        onConfirmDimensionDeletionChange={onConfirmDimensionDeletionChange}
        onConfirmScaleDeletionChange={onConfirmScaleDeletionChange}
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
        {saveStatus && <div className={styles.saveStatus}>{saveStatus}</div>}
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
        <Button variant="ghost" size="compact" className={styles.dismiss} onClick={onDismiss}>
          Dismiss
        </Button>
      )}
      {actions && <div className={styles.statusActions}>{actions}</div>}
    </div>
  );
}

export function LoadingOverlay({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    // Keep browser shortcuts native while preventing application handlers from editing a loading project.
    const blockApplicationKey = (event: KeyboardEvent) => event.stopImmediatePropagation();
    window.addEventListener("keydown", blockApplicationKey, true);
    return () => window.removeEventListener("keydown", blockApplicationKey, true);
  }, []);
  return <div role="status" className={styles.loadingOverlay} data-app-loading><span className={styles.loadingMessage}>{children}</span></div>;
}
