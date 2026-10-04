import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";

/**
 * Runtime shell state that is not part of the persisted session.
 *
 * Persistent domain data belongs to SessionState. This provider only carries
 * transient coordinator feedback such as PDF/runtime errors.
 */
export interface AppState {
  error: string | null;
  errorNotifications: AppErrorNotification[];
  nextNotificationId: number;
}

export interface AppErrorNotification {
  id: number;
  message: string;
}

type AppShellAction =
  | { type: "SET_ERROR"; message: string | null }
  | { type: "DISMISS_ERROR"; id: number };

export const initialAppState: AppState = {
  error: null,
  errorNotifications: [],
  nextNotificationId: 0,
};

export function appReducer(state: AppState, action: AppShellAction): AppState {
  switch (action.type) {
    case "SET_ERROR":
      return action.message === null
        ? { ...state, error: null }
        : {
            ...state,
            error: action.message,
            errorNotifications: [
              ...state.errorNotifications,
              { id: state.nextNotificationId, message: action.message },
            ],
            nextNotificationId: state.nextNotificationId + 1,
          };
    case "DISMISS_ERROR":
      return {
        ...state,
        error: state.errorNotifications.at(-1)?.id === action.id ? null : state.error,
        errorNotifications: state.errorNotifications.filter(({ id }) => id !== action.id),
      };
  }
}

interface AppContextValue {
  state: AppState;
  setError: (message: string | null) => void;
  clearError: () => void;
  dismissError: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const setError = useCallback(
    (message: string | null) => dispatch({ type: "SET_ERROR", message }),
    [],
  );
  const clearError = useCallback(() => dispatch({ type: "SET_ERROR", message: null }), []);
  const dismissError = useCallback((id: number) => dispatch({ type: "DISMISS_ERROR", id }), []);
  const value = useMemo(
    () => ({
      state,
      setError,
      clearError,
      dismissError,
    }),
    [clearError, dismissError, setError, state],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used inside AppProvider.");
  return context;
}
