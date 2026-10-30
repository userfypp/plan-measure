import { isBlockingOverlayOpen, useShortcutHandlers } from "../utils/shortcuts/dispatcher";
import { requestSettingsDialog } from "./settingsDialogRequest";
import { workspaceModuleForAction } from "./workspaceModules";
import type { WorkspaceModule } from "./workspaceState";

interface AppShortcutsDeps {
  /** A project is open: Export and the workspace panel exist only then. */
  hasProject: boolean;
  workspaceModule: WorkspaceModule;
  openExportDialog: () => void;
  openProjectLibrary: () => void;
  setWorkspaceModule: (module: WorkspaceModule) => void;
}

/** Keys for the app bar's Projects, Export and Settings and for the workspace module switcher. */
export function useAppShortcuts({
  hasProject,
  workspaceModule,
  openExportDialog,
  openProjectLibrary,
  setWorkspaceModule,
}: AppShortcutsDeps) {
  useShortcutHandlers((action, event) => {
    let run: (() => void) | null = null;
    if (action === "app.projects") run = openProjectLibrary;
    else if (action === "app.export") run = hasProject ? openExportDialog : null;
    else if (action === "app.settings") run = requestSettingsDialog;
    else {
      const module = hasProject ? workspaceModuleForAction(action, workspaceModule) : null;
      if (module) run = () => setWorkspaceModule(module);
    }
    if (!run || isBlockingOverlayOpen()) return false;
    event.preventDefault();
    run();
    return true;
  });
}
