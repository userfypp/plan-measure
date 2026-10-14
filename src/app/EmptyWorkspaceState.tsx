import { Button } from "../components/ui";
import styles from "./EmptyWorkspaceState.module.css";

function PlanIllustration() {
  return (
    <svg className={styles.illustration} viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <rect className={styles.sheet} x="14" y="4" width="68" height="64" rx="2" />
      <path className={styles.walls} d="M24 14h30v14h18v18H24z" />
      <path className={styles.walls} d="M24 28h12" />
      <path className={styles.dimension} d="M24 55h48M24 51.5v7M72 51.5v7" />
      <rect className={styles.label} x="38" y="49.5" width="20" height="11" rx="2" />
      <path className={styles.labelMark} d="M43 55h10" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className={styles.metaIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

export function EmptyWorkspaceState({
  onOpenPdf,
  onOpenSample,
  disabled,
}: {
  onOpenPdf: () => void;
  onOpenSample: () => void;
  disabled: boolean;
}) {
  return (
    <section className={styles.card} aria-labelledby="start-title">
      <div className={styles.intro}>
        <PlanIllustration />
        <h1 id="start-title" className={styles.title}>
          Open a plan to start measuring
        </h1>
        <p className={styles.lead}>
          Measure distances, perimeters, and areas on architectural PDF plans.
        </p>
        <Button onClick={onOpenPdf} disabled={disabled}>
          Open PDF
        </Button>
        <p className={styles.hint}>or drop a PDF anywhere on this screen</p>
      </div>
      <div className={styles.sample}>
        <div className={styles.sampleText}>
          <h2 className={styles.sampleTitle}>New here?</h2>
          <p className={styles.sampleLead}>Explore a house drawing set with measurements already made.</p>
        </div>
        <Button variant="secondary" size="compact" onClick={onOpenSample} disabled={disabled}>
          Try a sample
        </Button>
      </div>
      <p className={styles.meta}>
        <LockIcon />
        <span>Your plan stays in this browser</span>
        <span className={styles.metaDot} aria-hidden="true">·</span>
        <span>PDF files up to 100 MB</span>
      </p>
    </section>
  );
}
