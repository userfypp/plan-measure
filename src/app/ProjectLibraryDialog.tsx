import { Badge, Button, Dialog } from "../components/ui";
import type { SavedProjectSummary } from "../services/persistence";
import styles from "./ProjectLibraryDialog.module.css";

interface ProjectLibraryDialogProps {
  open: boolean;
  projects: SavedProjectSummary[];
  currentSessionLoaded: boolean;
  opening: boolean;
  confirmDiscard: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenPdf: () => void;
  onRequestDiscard: () => void;
  onCancelDiscard: () => void;
  onConfirmDiscard: () => void;
  onClose: () => void;
}

function savedDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp);
}

export function ProjectLibraryDialog({
  open,
  projects,
  currentSessionLoaded,
  opening,
  confirmDiscard,
  onOpenProject,
  onOpenPdf,
  onRequestDiscard,
  onCancelDiscard,
  onConfirmDiscard,
  onClose,
}: ProjectLibraryDialogProps) {
  if (!open) return null;

  return (
    <Dialog
      open
      title={confirmDiscard ? "Discard saved project?" : "Your projects"}
      size="large"
      trapFocus
      onClose={confirmDiscard ? onCancelDiscard : onClose}
    >
      {confirmDiscard ? (
        <div className={styles.discardConfirmation}>
          <p>
            This removes the current project and its PDF from this device. Other saved projects will
            remain available.
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onCancelDiscard}>
              Keep project
            </Button>
            <Button variant="danger" onClick={onConfirmDiscard}>
              Discard project
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.intro}>
            Projects are saved on this device. Open one to continue where you left off, or start a
            new project from a PDF.
          </p>
          {projects.length > 0 ? (
            <ul className={styles.projectList} aria-label="Saved projects">
              {projects.map((project) => {
                const isOpen = project.isCurrent && currentSessionLoaded;
                return (
                  <li className={styles.project} key={project.id}>
                    <div className={styles.projectInfo}>
                      <div className={styles.projectName}>
                        <h3 title={project.name}>{project.name}</h3>
                        {project.isCurrent && <Badge variant="info">Current</Badge>}
                      </div>
                      <p>
                        {project.pageCount} {project.pageCount === 1 ? "page" : "pages"}
                        <span aria-hidden="true"> · </span>
                        Saved {savedDate(project.savedAt)}
                      </p>
                    </div>
                    <Button
                      size="compact"
                      variant={project.isCurrent ? "secondary" : "primary"}
                      disabled={opening || isOpen}
                      aria-label={`${isOpen ? "Current project" : project.isCurrent ? "Continue project" : "Open project"} ${project.name}`}
                      onClick={() => onOpenProject(project.id)}
                    >
                      {isOpen ? "Open" : project.isCurrent ? "Continue" : "Open"}
                    </Button>
                    {project.isCurrent && !currentSessionLoaded && (
                      <Button
                        size="compact"
                        variant="dangerSecondary"
                        disabled={opening}
                        onClick={onRequestDiscard}
                      >
                        Discard
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M5 4.75h11.5a2 2 0 0 1 2 2v12.5H7a2 2 0 0 1-2-2V4.75Z" />
                  <path d="M8 8.25h7M8 11.75h7M8 15.25h4" />
                  <path d="M18.5 8.25H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" />
                </svg>
              </span>
              <h3>No saved projects yet</h3>
              <p>Open a PDF to create your first project. Your work will be saved in this browser.</p>
            </div>
          )}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onOpenPdf} disabled={opening}>
              Open PDF
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
