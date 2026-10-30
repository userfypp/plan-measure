import { isBlockingOverlayOpen, useShortcutHandlers } from "../utils/shortcuts/dispatcher";
import { useTheme } from "./themeState";

/**
 * Renders nothing. It owns the theme key so that a theme change re-renders
 * this component alone instead of the whole app.
 */
export function ThemeShortcut() {
  const { resolvedTheme, setPreference } = useTheme();
  useShortcutHandlers((action, event) => {
    if (action !== "app.toggleTheme" || isBlockingOverlayOpen()) return false;
    event.preventDefault();
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
    return true;
  });
  return null;
}
