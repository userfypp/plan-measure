import { useEffect, useState } from "react";
import { Badge, Button } from "../components/ui";
import type { SavedProjectSummary } from "../services/persistence";
import { useAppPreferences } from "../utils/appPreferences";
import { formatSavedDate } from "../utils/dateFormat";
import { preloadWhenIdle } from "./idlePreload";
import { recoverableLazy } from "./recoverableLazy";
import { retryableImport } from "./retryableImport";
import styles from "./EmptyWorkspaceState.module.css";

const LazyWhatsNew = recoverableLazy(
  retryableImport(() => import("./WhatsNew")),
  "What's new",
);

/**
 * The release notes are a small chunk fetched while the browser is idle. The "What's new" button
 * renders only once it has arrived, at the end of the action row, so a slow or failed download never
 * shows a loading state or an error on the start screen, and nothing the screen already shows moves.
 */
function useWhatsNewReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const cancel = preloadWhenIdle([
      () =>
        LazyWhatsNew.preload().then(() => {
          if (mounted) setReady(true);
        }),
    ]);
    return () => {
      mounted = false;
      cancel();
    };
  }, []);
  return ready;
}

interface EmptyWorkspaceStateProps {
  onOpenPdf: () => void;
  onOpenSample: () => void;
  disabled: boolean;
  projects?: SavedProjectSummary[];
  onOpenProject?: (projectId: string) => void;
  onShowAllProjects?: () => void;
}

export function EmptyWorkspaceState({
  onOpenPdf,
  onOpenSample,
  disabled,
  projects = [],
  onOpenProject,
  onShowAllProjects,
}: EmptyWorkspaceStateProps) {
  const { dateFormat } = useAppPreferences();
  const whatsNewReady = useWhatsNewReady();
  return (
    <section className={styles.start} aria-labelledby="start-title">
      <div className={styles.open}>
        <div className={styles.openText}>
          <h1 id="start-title" className={styles.title}>
            Open a plan to start measuring
          </h1>
          <p className={styles.note}>Drop a PDF anywhere. Files stay in this browser.</p>
        </div>
        <div className={styles.actions}>
          <Button size="compact" onClick={onOpenPdf} disabled={disabled}>
            Open PDF
          </Button>
          <Button variant="ghost" size="compact" onClick={onOpenSample} disabled={disabled}>
            Try a sample
          </Button>
          {whatsNewReady && <LazyWhatsNew />}
        </div>
      </div>
      {projects.length > 0 && (
        <section className={styles.projects} aria-labelledby="start-projects-title">
          <header className={styles.projectsHeader}>
            <h2 id="start-projects-title" className={styles.projectsTitle}>
              Recent projects
            </h2>
            <Button variant="ghost" size="compact" onClick={onShowAllProjects} disabled={disabled}>
              All projects
            </Button>
          </header>
          <ul className={styles.list}>
            {projects.slice(0, 5).map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={styles.project}
                  disabled={disabled || !project.pdfAvailable}
                  onClick={() => onOpenProject?.(project.id)}
                >
                  <span className={styles.projectText}>
                    <span className={styles.projectName}>
                      <span className={styles.projectLabel}>{project.name}</span>
                    </span>
                    <span className={styles.projectMeta}>
                      {project.pageCount} {project.pageCount === 1 ? "page" : "pages"}
                      {" · Saved "}
                      {formatSavedDate(project.savedAt, dateFormat)}
                    </span>
                  </span>
                  <span className={styles.projectTrail}>
                    {project.isCurrent && <Badge variant="info">Current</Badge>}
                    {!project.pdfAvailable && <Badge variant="warning">PDF unavailable</Badge>}
                    <span className={styles.chevron} aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
