import { Badge, Button, Dialog } from "../components/ui";
import type { SavedProjectSummary } from "../services/persistence";
import styles from "./ProjectLibraryDialog.module.css";

interface ProjectLibraryDialogProps {
  open: boolean;
  projects: SavedProjectSummary[];
  currentSessionLoaded: boolean;
  activeProjectId: string | null;
  opening: boolean;
  pendingDiscardProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onOpenPdf: () => void;
  onImportProject: () => void;
  onExportProject: (projectId?: string) => void;
  onRequestDiscard: (projectId: string) => void;
  onCancelDiscard: () => void;
  onConfirmDiscard: (projectId: string) => void;
  onClose: () => void;
}

function savedDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp);
}

export function ProjectLibraryDialog({
  open,
  projects,
  currentSessionLoaded,
  activeProjectId,
  opening,
  pendingDiscardProjectId,
  onOpenProject,
  onOpenPdf,
  onImportProject,
  onExportProject,
  onRequestDiscard,
  onCancelDiscard,
  onConfirmDiscard,
  onClose,
}: ProjectLibraryDialogProps) {
  if (!open) return null;
  const pendingProject = projects.find((project) => project.id === pendingDiscardProjectId);
  const confirmingDiscard = pendingDiscardProjectId !== null;

  return (
    <Dialog
      open
      title={confirmingDiscard ? "Discard project?" : "Projects"}
      size={confirmingDiscard ? "medium" : "large"}
      trapFocus
      onClose={confirmingDiscard ? onCancelDiscard : onClose}
    >
      {confirmingDiscard ? (
        <div className={styles.discardConfirmation}>
          <p>
            Remove <strong>{pendingProject?.name ?? "this project"}</strong> and its PDF from this
            device? Other projects stay saved.
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" disabled={opening} onClick={onCancelDiscard}>
              Keep project
            </Button>
            <Button
              variant="danger"
              disabled={opening}
              onClick={() => {
                if (pendingDiscardProjectId) onConfirmDiscard(pendingDiscardProjectId);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <>
          {projects.length > 0 ? (
            <ul className={styles.projectList} aria-label="Saved projects">
              {projects.map((project) => {
                const isCurrent = currentSessionLoaded
                  ? project.id === activeProjectId
                  : project.isCurrent;
                const isOpen = isCurrent && currentSessionLoaded;
                return (
                  <li className={styles.project} key={project.id}>
                    <div className={styles.projectInfo}>
                      <div className={styles.projectName}>
                        <h3 title={project.name}>{project.name}</h3>
                        {isCurrent && <Badge variant="info">Current</Badge>}
                      </div>
                      <p>
                        {project.pageCount} {project.pageCount === 1 ? "page" : "pages"}
                        <span aria-hidden="true"> · </span>
                        Saved {savedDate(project.savedAt)}
                      </p>
                    </div>
                    <div className={styles.projectActions}>
                      <Button
                        size="compact"
                        variant="secondary"
                        disabled={opening}
                        aria-label={`Export project ${project.name}`}
                        onClick={() => onExportProject(project.id)}
                      >
                        Export
                      </Button>
                      <Button
                        size="compact"
                        variant={isCurrent ? "primary" : "secondary"}
                        disabled={opening || isOpen}
                        disabledReason={isOpen ? "This project is already open." : undefined}
                        aria-label={`${isOpen ? "Current project" : isCurrent ? "Continue project" : "Open project"} ${project.name}`}
                        onClick={() => onOpenProject(project.id)}
                      >
                        {isOpen ? "Current" : isCurrent ? "Continue" : "Open"}
                      </Button>
                      <Button
                        size="compact"
                        variant="dangerSecondary"
                        disabled={opening}
                        onClick={() => onRequestDiscard(project.id)}
                      >
                        Discard
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <svg viewBox="0 0 20 20" focusable="false">
                  <path d="M4.17 3.96h9.58a1.67 1.67 0 0 1 1.67 1.67v10.42H5.83a1.67 1.67 0 0 1 -1.67 -1.67V3.96Z" />
                  <path d="M6.67 6.88h5.83M6.67 9.79h5.83M6.67 12.71h3.33" />
                  <path d="M15.42 6.88H16.67a0.83 0.83 0 0 1 0.83 0.83v7.5a0.83 0.83 0 0 1 -0.83 0.83h-1.67" />
                </svg>
              </span>
              <h3>No saved projects</h3>
              <p>Open a PDF to start a project.</p>
            </div>
          )}
          <div className={styles.actions}>
            <Button size="compact" variant="ghost" onClick={onClose}>
              Close
            </Button>
            {currentSessionLoaded &&
              !projects.some((project) => project.id === activeProjectId) && (
                <Button
                  size="compact"
                  variant="secondary"
                  disabled={opening}
                  onClick={() => onExportProject()}
                >
                  Export current project
                </Button>
              )}
            <Button size="compact" variant="secondary" disabled={opening} onClick={onImportProject}>
              Import project
            </Button>
            <Button size="compact" onClick={onOpenPdf} disabled={opening}>
              Open PDF
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
