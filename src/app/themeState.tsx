import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export const THEME_STORAGE_KEY = "plan-measure.theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function sanitizeThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function readThemePreference(): ThemePreference {
  try {
    return sanitizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

function applyResolvedTheme(preference: ThemePreference, resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [systemMedia] = useState(() => window.matchMedia(SYSTEM_THEME_QUERY));
  const systemStore = useMemo(
    () => ({
      subscribe: (notify: () => void) => {
        const handleChange = () => notify();
        systemMedia.addEventListener("change", handleChange);
        return () => systemMedia.removeEventListener("change", handleChange);
      },
      getSnapshot: () => systemMedia.matches,
    }),
    [systemMedia],
  );
  const systemDark = useSyncExternalStore(
    systemStore.subscribe,
    systemStore.getSnapshot,
    systemStore.getSnapshot,
  );
  const resolvedTheme = resolveThemePreference(preference, systemDark);

  useLayoutEffect(() => {
    applyResolvedTheme(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      setPreference: (nextPreference) => {
        setPreferenceState(nextPreference);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
        } catch {
          // Theme remains usable for this page even if preference storage is unavailable.
        }
      },
    }),
    [preference, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider.");
  return value;
}
