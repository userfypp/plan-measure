import { Badge, Button, Dialog } from "../components/ui";
import type { SavedProjectSummary } from "../services/persistence";
import styles from "./ProjectLibraryDialog.module.css";

interface ProjectLibraryDialogProps {
  open: boolean;
  projects: SavedProjectSummary[];
  currentSessionLoaded: boolean;
  opening: boolean;
  pendingDiscardProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onOpenPdf: () => void;
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
  opening,
  pendingDiscardProjectId,
  onOpenProject,
  onOpenPdf,
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
      size="medium"
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
          <p className={styles.localNote}>Saved on this device</p>
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
                    <div className={styles.projectActions}>
                      <Button
                        size="compact"
                        variant={project.isCurrent ? "primary" : "secondary"}
                        disabled={opening || isOpen}
                        disabledReason={isOpen ? "This project is already open." : undefined}
                        aria-label={`${isOpen ? "Current project" : project.isCurrent ? "Continue project" : "Open project"} ${project.name}`}
                        onClick={() => onOpenProject(project.id)}
                      >
                        {isOpen ? "Current" : project.isCurrent ? "Continue" : "Open"}
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
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M5 4.75h11.5a2 2 0 0 1 2 2v12.5H7a2 2 0 0 1-2-2V4.75Z" />
                  <path d="M8 8.25h7M8 11.75h7M8 15.25h4" />
                  <path d="M18.5 8.25H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" />
                </svg>
              </span>
              <h3>No saved projects</h3>
              <p>Open a PDF to start a project.</p>
            </div>
          )}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose}>
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
