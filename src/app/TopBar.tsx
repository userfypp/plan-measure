import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../components/ui";
import { getGlobalViewerKeyboardAction } from "../utils/keyboard";
import { useSessionState } from "./sessionState";
import styles from "./TopBar.module.css";

interface TopBarProps {
  onOpenPdf: () => void;
  onExport: () => void;
}

export function TopBar({ onOpenPdf, onExport }: TopBarProps) {
  const { session, updateSettings } = useSessionState();
  const [viewOpen, setViewOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const viewTriggerRef = useRef<HTMLButtonElement>(null);
  const viewMenuId = useId();

  useEffect(() => {
    if (!viewOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!viewMenuRef.current?.contains(event.target as Node)) setViewOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.defaultPrevented ||
        target?.closest("dialog, [role='dialog']")
      ) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setViewOpen(false);
        viewTriggerRef.current?.focus();
      } else if (!target?.matches("select") && getGlobalViewerKeyboardAction(event)) {
        setViewOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewOpen]);

  return (
    <header className={styles.topBar}>
      <div className={styles.documentGroup}>
        <div className={styles.brand}>Plan Measure</div>
        <Button variant="secondary" size="compact" onClick={onOpenPdf}>
          Open PDF
        </Button>
        <div className={styles.fileName} title={session?.pdf.name}>
          {session?.pdf.name ?? "No PDF loaded"}
        </div>
        <a
          className={styles.feedback}
          href="https://github.com/userfypp/plan-measure/discussions/1"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Feedback"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4.5 4.5h11v7.75h-6L6 15v-2.75H4.5z" />
          </svg>
          <span>Feedback</span>
        </a>
      </div>
      <div className={styles.actions}>
        {session && (
          <div className={styles.viewMenu} ref={viewMenuRef}>
            <Button
              ref={viewTriggerRef}
              variant="secondary"
              size="compact"
              className={viewOpen ? styles.viewTriggerOpen : undefined}
              aria-expanded={viewOpen}
              aria-controls={viewMenuId}
              onClick={() => setViewOpen((open) => !open)}
            >
              <svg className={styles.viewIcon} viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2.5 10s2.7-4.25 7.5-4.25S17.5 10 17.5 10 14.8 14.25 10 14.25 2.5 10 2.5 10Z" />
                <circle cx="10" cy="10" r="2" />
              </svg>
              View
            </Button>
            {viewOpen && (
              <div id={viewMenuId} className={styles.viewOptions} aria-label="View options">
                <div className={styles.menuHeader}>
                  <strong>View settings</strong>
                  <span>Control plan annotations and units.</span>
                </div>
                <label className={styles.unit}>
                  <span>Display unit</span>
                  <select
                    value={session.settings.displayUnit}
                    onChange={(event) => updateSettings({ displayUnit: event.target.value as "mm" | "cm" | "m" })}
                  >
                    <option value="mm">Millimetres</option>
                    <option value="cm">Centimetres</option>
                    <option value="m">Metres</option>
                  </select>
                </label>
                <div className={styles.menuDivider} />
                <ViewToggle label="Labels" description="Show calculated values" checked={session.settings.showLabels} onChange={(checked) => updateSettings({ showLabels: checked })} />
                <ViewToggle label="Measurements" description="Show drawn geometry" checked={session.settings.showMeasurements} onChange={(checked) => updateSettings({ showMeasurements: checked })} />
                <ViewToggle label="Calibration" description="Show scale references" checked={session.settings.showCalibration} onChange={(checked) => updateSettings({ showCalibration: checked })} />
              </div>
            )}
          </div>
        )}
        {session && <Button size="compact" onClick={onExport}>Export CSV</Button>}
      </div>
    </header>
  );
}

function ViewToggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <span className={styles.toggleText}><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
