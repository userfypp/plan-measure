import type { ReactNode } from "react";
import type { MeasurementDecimalPlaces } from "../types/domain";
import { AppBar } from "./AppBar";
import styles from "./AppShell.module.css";

type StatusTone = "error" | "warning";

interface AppShellProps {
  children: ReactNode;
  documentName: string | null;
  canExport: boolean;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  onOpenPdf: () => void;
  onExport: () => void;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  statusMessage?: string | null;
  statusTone?: StatusTone;
  onDismissStatus?: () => void;
}

export function AppShell({
  children,
  documentName,
  canExport,
  measurementDecimalPlaces = null,
  onOpenPdf,
  onExport,
  onMeasurementDecimalPlacesChange,
  statusMessage,
  statusTone = "error",
  onDismissStatus,
}: AppShellProps) {
  return (
    <div className={styles.appShell}>
      <AppBar
        documentName={documentName}
        canExport={canExport}
        measurementDecimalPlaces={measurementDecimalPlaces}
        onOpenPdf={onOpenPdf}
        onExport={onExport}
        onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
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
