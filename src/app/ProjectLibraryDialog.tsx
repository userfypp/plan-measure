import type { ReactNode } from "react";
import { Badge, Button, Dialog, IconButton } from "../components/ui";
import type { SavedProjectSummary } from "../services/persistence";
import { useAppPreferences } from "../utils/appPreferences";
import { formatSavedDate } from "../utils/dateFormat";
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
    <path d="M3.25 5.5h13.5M7.75 5.5V4.25A1.25 1.25 0 0 1 9 3h2a1.25 1.25 0 0 1 1.25 1.25V5.5M5.25 5.5v10A1.75 1.75 0 0 0 7 17.25h6a1.75 1.75 0 0 0 1.75-1.75v-10M8.25 8.75v5M11.75 8.75v5" />
  </Icon>
);

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
  const { dateFormat } = useAppPreferences();
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
                        Saved {formatSavedDate(project.savedAt, dateFormat)}
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
            <Button variant="ghost" size="compact" onClick={onClose}>
              Close
            </Button>
            {currentSessionLoaded &&
              !projects.some((project) => project.id === activeProjectId) && (
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={opening}
                  onClick={() => onExportProject()}
                >
                  Export current project
                </Button>
              )}
            <Button variant="secondary" size="compact" disabled={opening} onClick={onImportProject}>
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
