import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import styles from "./AppShell.module.css";

type StatusTone = "error" | "warning";

interface AppShellProps {
  children: ReactNode;
  onOpenPdf: () => void;
  onExport: () => void;
  statusMessage?: string | null;
  statusTone?: StatusTone;
  onDismissStatus?: () => void;
}

export function AppShell({
  children,
  onOpenPdf,
  onExport,
  statusMessage,
  statusTone = "error",
  onDismissStatus,
}: AppShellProps) {
  return (
    <div className={styles.appShell}>
      <TopBar onOpenPdf={onOpenPdf} onExport={onExport} />
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
