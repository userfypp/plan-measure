import { Button } from "../components/ui";
import { useSessionState } from "./sessionState";
import styles from "./TopBar.module.css";

interface TopBarProps {
  onOpenPdf: () => void;
  onExport: () => void;
}

export function TopBar({ onOpenPdf, onExport }: TopBarProps) {
  const { session } = useSessionState();

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
          <Button size="compact" onClick={onExport}>
            Export CSV
          </Button>
        )}
      </div>
    </header>
  );
}
