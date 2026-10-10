import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, Popover } from "../components/ui";
import { SAVE_STATUS_TEXT, type SaveStatusStore } from "./saveStatus";
import styles from "./SaveStatusIndicator.module.css";

interface SaveStatusIndicatorProps {
  store: SaveStatusStore;
  pending: boolean;
  canRetry: boolean;
  onExport: () => void;
  onRetry: () => void;
  onReload: () => void;
}

export function SaveStatusIndicator({
  store,
  pending,
  canRetry,
  onExport,
  onRetry,
  onReload,
}: SaveStatusIndicatorProps) {
  const { state, announcement, savingStartedAt } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const [clock, setClock] = useState(Date.now);
  // Keep a brief Saving label readable, without ever displaying Saved before confirmation.
  const holdSaving = state === "saved" && savingStartedAt !== null && clock < savingStartedAt + 500;
  const label = holdSaving ? SAVE_STATUS_TEXT.saving : SAVE_STATUS_TEXT[state];
  useEffect(() => {
    if (!holdSaving || savingStartedAt === null) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.max(0, savingStartedAt + 500 - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [holdSaving, savingStartedAt]);

  return (
    <div className={styles.indicator}>
      <span role="status" aria-live="polite" aria-atomic="true" className={styles.visuallyHidden}>
        {announcement}
      </span>
      <Popover
        trigger={
          <>
            {label}
            <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="m6 8 4 4 4-4" />
            </svg>
          </>
        }
        triggerProps={{
          className: styles.trigger,
          "aria-label": `${label}. Save status and backups`,
          "aria-haspopup": "dialog",
        }}
        placement="bottom-end"
        role="dialog"
        aria-label="Save status and backups"
        dismissOnFocusLeave
        className={styles.details}
      >
        <div className={styles.autosave}>
          <h2 className={styles.heading}>Local autosave</h2>
          <p>Stored only in this browser. Clearing site data removes saved projects.</p>
          {state === "unavailable" && <p>Browser recovery is unavailable.</p>}
          {state === "repair-required" && (
            <p>Repair the reported data to resume autosave automatically.</p>
          )}
          {state === "conflict" && <p>Export your edits before reloading saved projects.</p>}
          {canRetry && (
            <Button
              className={styles.action}
              size="compact"
              variant="secondary"
              disabled={pending}
              onClick={onRetry}
            >
              Retry saving
            </Button>
          )}
          {state === "conflict" && (
            <Button
              className={styles.action}
              size="compact"
              variant="secondary"
              disabled={pending}
              onClick={onReload}
            >
              Reload saved projects
            </Button>
          )}
        </div>
        <div className={styles.backup}>
          <Button
            className={styles.action}
            size="compact"
            variant="secondary"
            disabled={pending}
            onClick={onExport}
          >
            Export backup (.planmeasure)
          </Button>
          <p>A downloaded file with the PDF and editable project data.</p>
        </div>
      </Popover>
    </div>
  );
}
