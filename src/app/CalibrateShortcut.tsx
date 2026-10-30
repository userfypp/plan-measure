import { isBlockingOverlayOpen, useShortcutHandlers } from "../utils/shortcuts/dispatcher";
import { useWorkspaceDrawerPresentation } from "./WorkspaceDrawerContext";

interface CalibrateShortcutProps {
  /** A scale workflow is running. */
  disabled: boolean;
  onAddScale: (mode: "uniform") => void;
}

/**
 * Renders nothing. The Calibrate key starts a Uniform scale with the guards of the Add scale
 * option. It lives here, not in the Scales panel, because inactive panels skip re-rendering and
 * would keep a stale page and workflow state.
 */
export function CalibrateShortcut({ disabled, onAddScale }: CalibrateShortcutProps) {
  const workspace = useWorkspaceDrawerPresentation();
  useShortcutHandlers((action, event) => {
    if (
      action !== "tool.calibrate" ||
      disabled ||
      !workspace.precisionActionAvailable ||
      isBlockingOverlayOpen()
    ) {
      return false;
    }
    if (!workspace.requestPrecisionAuthoring(() => onAddScale("uniform"))) return false;
    event.preventDefault();
    return true;
  });
  return null;
}
