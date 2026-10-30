import { Badge, Button } from "../components/ui";
import type { SavedProjectSummary } from "../services/persistence";
import { useAppPreferences } from "../utils/appPreferences";
import { formatSavedDate } from "../utils/dateFormat";
import styles from "./EmptyWorkspaceState.module.css";

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
                  disabled={disabled}
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
