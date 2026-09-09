import type { ReactNode } from "react";
import { AnchoredMenu } from "../components/ui";
import { useWorkspaceState, type WorkspaceModule } from "./workspaceState";
import styles from "./WorkspacePanel.module.css";

const MODULES: Array<{ id: WorkspaceModule; label: string }> = [
  { id: "measurements", label: "Measurements" },
  { id: "classifications", label: "Classifications" },
  { id: "scales", label: "Scales" },
];

export function workspaceModuleLabel(module: WorkspaceModule): string {
  return MODULES.find((candidate) => candidate.id === module)?.label ?? module;
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m6.5 8 3.5 3.5L13.5 8" />
    </svg>
  );
}

export interface WorkspacePanelProps {
  measurements: ReactNode;
  classifications: ReactNode;
  scales: ReactNode;
  details?: ReactNode;
}

export function WorkspacePanel({
  measurements,
  classifications,
  scales,
  details,
}: WorkspacePanelProps) {
  const {
    workspaceModule,
    measurementDetailsOpen,
    setWorkspaceModule,
  } = useWorkspaceState();
  const activeLabel = workspaceModuleLabel(workspaceModule);

  return (
    <aside className={styles.panel} aria-label="Workspace panel" data-layout-slot="workspace-panel">
      <header className={styles.header}>
        <AnchoredMenu
          trigger={
            <span className={styles.switcherContent}>
              <span>{activeLabel}</span>
              <ChevronIcon />
            </span>
          }
          triggerProps={{
            className: styles.switcher,
            "aria-label": `Workspace module: ${activeLabel}`,
          }}
          label="Workspace modules"
          items={MODULES.map((module) => ({
            id: module.id,
            label: module.label,
            role: "menuitemradio" as const,
            checked: workspaceModule === module.id,
            onSelect: () => setWorkspaceModule(module.id),
          }))}
          placement="bottom-start"
        />
      </header>
      <div className={styles.body}>
        <div
          className={styles.modulePane}
          hidden={measurementDetailsOpen || workspaceModule !== "measurements"}
        >
          {measurements}
        </div>
        <div
          className={styles.modulePane}
          hidden={measurementDetailsOpen || workspaceModule !== "classifications"}
        >
          {classifications}
        </div>
        <div
          className={styles.modulePane}
          hidden={measurementDetailsOpen || workspaceModule !== "scales"}
        >
          {scales}
        </div>
        {details && (
          <div className={styles.detailsPane} hidden={!measurementDetailsOpen}>
            {details}
          </div>
        )}
      </div>
    </aside>
  );
}
