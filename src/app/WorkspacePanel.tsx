import { memo, type ReactNode } from "react";
import { AnchoredMenu } from "../components/ui";
import { useWorkspaceState, type WorkspaceModule } from "./workspaceState";
import { useWorkspaceDrawerPresentation } from "./WorkspaceDrawerContext";
import styles from "./WorkspacePanel.module.css";

const MODULES: Array<{ id: WorkspaceModule; label: string }> = [
  { id: "measurements", label: "Measurements" },
  { id: "takeoff", label: "Takeoff" },
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

export interface WorkspacePanelProps {
  measurements: ReactNode;
  takeoff: ReactNode;
  classifications: ReactNode;
  scales: ReactNode;
  details?: ReactNode;
}

const WorkspaceModulePane = memo(
  function WorkspaceModulePane({
    active,
    children,
  }: {
    active: boolean;
    children: ReactNode;
  }) {
    return (
      <div className={styles.modulePane} hidden={!active}>
        {children}
      </div>
    );
  },
  (previous, next) =>
    (!previous.active && !next.active) ||
    (previous.active === next.active && previous.children === next.children),
);

export function WorkspacePanel({
  measurements,
  takeoff,
  classifications,
  scales,
  details,
}: WorkspacePanelProps) {
  const drawer = useWorkspaceDrawerPresentation();
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
        {drawer.isNarrow && (
          <button
            type="button"
            className={styles.drawerClose}
            aria-label="Close workspace"
            title="Close workspace"
            onClick={() => drawer.close(true)}
          >
            <CloseIcon />
          </button>
        )}
      </header>
      <div className={styles.body}>
        <WorkspaceModulePane
          active={!measurementDetailsOpen && workspaceModule === "measurements"}
        >
          {measurements}
        </WorkspaceModulePane>
        <WorkspaceModulePane active={!measurementDetailsOpen && workspaceModule === "takeoff"}>
          {takeoff}
        </WorkspaceModulePane>
        <WorkspaceModulePane
          active={!measurementDetailsOpen && workspaceModule === "classifications"}
        >
          {classifications}
        </WorkspaceModulePane>
        <WorkspaceModulePane active={!measurementDetailsOpen && workspaceModule === "scales"}>
          {scales}
        </WorkspaceModulePane>
        {details && (
          <div className={styles.detailsPane} hidden={!measurementDetailsOpen}>
            {details}
          </div>
        )}
      </div>
    </aside>
  );
}
