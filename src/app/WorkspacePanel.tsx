import { memo, type ReactNode } from "react";
import { AnchoredMenu, ChevronDownIcon, CloseIcon, IconButton } from "../components/ui";
import { useWorkspaceState, type WorkspaceModule } from "./workspaceState";
import { WORKSPACE_MODULES } from "./workspaceModules";
import { useWorkspaceDrawerPresentation } from "./WorkspaceDrawerContext";
import styles from "./WorkspacePanel.module.css";

export function workspaceModuleLabel(module: WorkspaceModule): string {
  return WORKSPACE_MODULES.find((candidate) => candidate.id === module)?.label ?? module;
}

export interface WorkspacePanelProps {
  measurements: ReactNode;
  takeoff: ReactNode;
  classifications: ReactNode;
  scales: ReactNode;
  details?: ReactNode;
}

const WorkspaceModulePane = memo(
  function WorkspaceModulePane({ active, children }: { active: boolean; children: ReactNode }) {
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
  const { workspaceModule, measurementDetailsOpen, setWorkspaceModule } = useWorkspaceState();
  const activeLabel = workspaceModuleLabel(workspaceModule);

  return (
    <aside className={styles.panel} aria-label="Workspace panel" data-layout-slot="workspace-panel">
      <header className={styles.header}>
        <AnchoredMenu
          trigger={
            <span className={styles.switcherContent}>
              <span>{activeLabel}</span>
              <ChevronDownIcon />
            </span>
          }
          triggerProps={{
            className: styles.switcher,
            "aria-label": `Workspace module: ${activeLabel}`,
          }}
          label="Workspace modules"
          items={WORKSPACE_MODULES.map((module) => ({
            id: module.id,
            label: module.label,
            role: "menuitemradio" as const,
            checked: workspaceModule === module.id,
            onSelect: () => setWorkspaceModule(module.id),
          }))}
          placement="bottom-start"
          matchTriggerWidth
        />
        {drawer.isNarrow && (
          <IconButton
            icon={<CloseIcon />}
            aria-label="Close workspace"
            tooltip="Close workspace"
            tooltipPosition="bottom"
            onClick={() => drawer.close(true)}
          />
        )}
      </header>
      <div className={styles.body}>
        <WorkspaceModulePane active={!measurementDetailsOpen && workspaceModule === "measurements"}>
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
