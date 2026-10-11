import type { ReactNode } from "react";
import { Badge, Button, Dialog, IconButton } from "../components/ui";
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

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const openIcon = (
  <Icon>
    <path d="M8 4.5H5.5A1.5 1.5 0 0 0 4 6v8.5A1.5 1.5 0 0 0 5.5 16H14a1.5 1.5 0 0 0 1.5-1.5V12" />
    <path d="M11.5 4H16v4.5M16 4l-6 6" />
  </Icon>
);
const exportIcon = (
  <Icon>
    <path d="M10 3.5v9M6.5 9.5l3.5 3.5 3.5-3.5M4 16h12" />
  </Icon>
);
const discardIcon = (
  <Icon>
    <path d="M4 5.5h12M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10M8.5 9v4.5M11.5 9v4.5" />
  </Icon>
);
const importIcon = (
  <Icon>
    <path d="M10 13V4M6.5 7 10 3.5 13.5 7M4 12.5V15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2.5" />
  </Icon>
);
const openPdfIcon = (
  <Icon>
    <path d="M11.5 3H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V7L11.5 3Z" />
    <path d="M11.5 3v4h4M10 9.5v4M8 11.5h4" />
  </Icon>
);

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
                      <IconButton
                        icon={openIcon}
                        disabled={opening || isOpen}
                        disabledReason={isOpen ? "This project is already open." : undefined}
                        tooltip={isCurrent && !isOpen ? "Continue" : "Open"}
                        aria-label={`${isOpen ? "Current project" : isCurrent ? "Continue project" : "Open project"} ${project.name}`}
                        onClick={() => onOpenProject(project.id)}
                      />
                      <IconButton
                        icon={exportIcon}
                        disabled={opening}
                        tooltip="Export"
                        aria-label={`Export project ${project.name}`}
                        onClick={() => onExportProject(project.id)}
                      />
                      <IconButton
                        icon={discardIcon}
                        tone="danger"
                        disabled={opening}
                        tooltip="Discard"
                        aria-label={`Discard project ${project.name}`}
                        onClick={() => onRequestDiscard(project.id)}
                      />
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
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {currentSessionLoaded &&
              !projects.some((project) => project.id === activeProjectId) && (
                <Button
                  variant="secondary"
                  disabled={opening}
                  onClick={() => onExportProject()}
                >
                  <span className={styles.buttonIcon} aria-hidden="true">{exportIcon}</span>
                  Export current project
                </Button>
              )}
            <Button variant="secondary" disabled={opening} onClick={onImportProject}>
              <span className={styles.buttonIcon} aria-hidden="true">{importIcon}</span>
              Import project
            </Button>
            <Button onClick={onOpenPdf} disabled={opening}>
              <span className={styles.buttonIcon} aria-hidden="true">{openPdfIcon}</span>
              Open PDF
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
