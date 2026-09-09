import type { DragEventHandler, ReactNode } from "react";
import { Button } from "../components/ui";
import { ViewerShell } from "./ViewerShell";
import styles from "./WorkspaceShell.module.css";

interface WorkspaceShellProps {
  isEmpty?: boolean;
  dragActive: boolean;
  onDragEnter: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
  workspacePanel?: ReactNode;
  toolRail?: ReactNode;
  viewerContext?: ReactNode;
  viewer?: ReactNode;
  emptyState?: ReactNode;
  dropOverlay?: ReactNode;
}

export function WorkspaceShell({
  isEmpty = false,
  dragActive,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  workspacePanel,
  toolRail,
  viewerContext,
  viewer,
  emptyState,
  dropOverlay = "Drop PDF to replace current session",
}: WorkspaceShellProps) {
  const dropZoneProps = {
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  };

  if (isEmpty) {
    return (
      <main
        className={`${styles.emptyState} ${dragActive ? styles.dragActive : ""}`}
        {...dropZoneProps}
      >
        {emptyState}
      </main>
    );
  }

  return (
    <main
      className={`${styles.workspace} ${dragActive ? styles.dragActive : ""}`}
      {...dropZoneProps}
    >
      <div className={styles.workspacePanel} data-layout-slot="workspace-panel-host">
        {workspacePanel}
      </div>
      <div className={styles.leftRail} data-layout-slot="left-rail">
        {toolRail}
      </div>
      <ViewerShell contextBar={viewerContext}>{viewer}</ViewerShell>
      {dragActive && <div className={styles.dropOverlay}>{dropOverlay}</div>}
    </main>
  );
}

export function EmptyWorkspaceState({ onOpenPdf }: { onOpenPdf: () => void }) {
  return (
    <div className={styles.dropCard}>
      <div className={styles.documentMark} aria-hidden="true">
        PDF
      </div>
      <h1>Drop a PDF here</h1>
      <p>or</p>
      <Button onClick={onOpenPdf}>Open PDF</Button>
      <small>PDF files up to 100 MB · Your plan stays in this browser</small>
    </div>
  );
}
