import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

export interface ViewerInteractionCommands {
  completeCurrentDraft: () => void;
}

export type ViewerInteractionCommandRegistration = (
  commands: ViewerInteractionCommands,
) => () => void;

interface RegisteredCommands {
  owner: object;
  commands: ViewerInteractionCommands;
}

interface ViewerInteractionCommandContextValue {
  registerCommands: ViewerInteractionCommandRegistration;
  completeCurrentDraft: () => void;
}

const ViewerInteractionCommandContext =
  createContext<ViewerInteractionCommandContextValue | null>(null);

export function ViewerInteractionCommandsProvider({ children }: { children: ReactNode }) {
  const registeredRef = useRef<RegisteredCommands | null>(null);
  const registerCommands = useCallback<ViewerInteractionCommandRegistration>((commands) => {
    const owner = {};
    registeredRef.current = { owner, commands };
    return () => {
      if (registeredRef.current?.owner === owner) registeredRef.current = null;
    };
  }, []);
  const completeCurrentDraft = useCallback(() => {
    registeredRef.current?.commands.completeCurrentDraft();
  }, []);
  const value = useMemo(
    () => ({ registerCommands, completeCurrentDraft }),
    [completeCurrentDraft, registerCommands],
  );

  return (
    <ViewerInteractionCommandContext.Provider value={value}>
      {children}
    </ViewerInteractionCommandContext.Provider>
  );
}

export function useViewerInteractionCommandRegistration(): ViewerInteractionCommandRegistration | null {
  return useContext(ViewerInteractionCommandContext)?.registerCommands ?? null;
}

export function useViewerInteractionCommands(): Pick<
  ViewerInteractionCommandContextValue,
  "completeCurrentDraft"
> {
  const context = useContext(ViewerInteractionCommandContext);
  if (!context) {
    throw new Error("useViewerInteractionCommands must be used inside ViewerInteractionCommandsProvider.");
  }
  return { completeCurrentDraft: context.completeCurrentDraft };
}
