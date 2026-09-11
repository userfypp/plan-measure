import { createContext, useContext, type ReactNode } from "react";
import type { AuthoringCapability } from "../features/viewer/AuthoringCapability";

interface WorkspaceDrawerPresentation {
  isNarrow: boolean;
  narrowVersion: number;
  open: boolean;
  close: (returnFocus?: boolean) => void;
  currentCapability: AuthoringCapability | null;
  capabilityWithoutDrawer: AuthoringCapability | null;
  canRecoverAuthoringByClosingWorkspace: boolean;
  precisionActionAvailable: boolean;
  precisionDisabledReason: string;
  requestPrecisionAuthoring: (start: () => void) => boolean;
}

const WorkspaceDrawerContext = createContext<WorkspaceDrawerPresentation>({
  isNarrow: false,
  narrowVersion: 0,
  open: false,
  close: () => undefined,
  currentCapability: null,
  capabilityWithoutDrawer: null,
  canRecoverAuthoringByClosingWorkspace: false,
  precisionActionAvailable: true,
  precisionDisabledReason:
    "Precision drawing and editing are not available in the current viewer area.",
  requestPrecisionAuthoring: (start) => {
    start();
    return true;
  },
});

export function WorkspaceDrawerProvider({
  value,
  children,
}: {
  value: WorkspaceDrawerPresentation;
  children: ReactNode;
}) {
  return <WorkspaceDrawerContext.Provider value={value}>{children}</WorkspaceDrawerContext.Provider>;
}

export function useWorkspaceDrawerPresentation(): WorkspaceDrawerPresentation {
  return useContext(WorkspaceDrawerContext);
}
