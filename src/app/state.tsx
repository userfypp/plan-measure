import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";

/**
 * Runtime shell state that is not part of SessionV6.
 *
 * Persistent domain data belongs to SessionState. This provider only carries
 * transient coordinator feedback such as PDF/runtime errors.
 */
export interface AppState {
  error: string | null;
}

type AppShellAction = { type: "SET_ERROR"; message: string | null };

export const initialAppState: AppState = {
  error: null,
};

export function appReducer(state: AppState, action: AppShellAction): AppState {
  switch (action.type) {
    case "SET_ERROR":
      return { ...state, error: action.message };
  }
}

interface AppContextValue {
  state: AppState;
  setError: (message: string | null) => void;
  clearError: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const setError = useCallback(
    (message: string | null) => dispatch({ type: "SET_ERROR", message }),
    [],
  );
  const clearError = useCallback(() => dispatch({ type: "SET_ERROR", message: null }), []);
  const value = useMemo(
    () => ({
      state,
      setError,
      clearError,
    }),
    [clearError, setError, state],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used inside AppProvider.");
  return context;
}
