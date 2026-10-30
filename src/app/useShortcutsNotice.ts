import { useEffect, useState } from "react";
import { markShortcutsNoticeShown, noteSavedProjectsAtStartup } from "../utils/shortcuts/notice";
import { requestSettingsDialog } from "./settingsDialogRequest";

interface ShortcutsNoticeInputs {
  /** The saved-session check has finished and the saved projects are listed. */
  recoveryChecked: boolean;
  /** The app has started and nothing is loading. */
  quiet: boolean;
  hasSavedProjects: boolean;
}

/**
 * The one-time "Shortcuts updated" notification for a browser that used an earlier version. The
 * shortcuts layer is only imported once the notice is due, so nobody else downloads it. The
 * notice is remembered the moment it appears and never comes back.
 */
export function useShortcutsNotice({
  recoveryChecked,
  quiet,
  hasSavedProjects,
}: ShortcutsNoticeInputs) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // The first run after the saved-session check is what tells a new user from a returning one.
    if (!recoveryChecked || !noteSavedProjectsAtStartup(hasSavedProjects) || !quiet) return;
    let cancelled = false;
    void import("../features/shortcuts/updateNotice").then(
      ({ shortcutsUpdatedMessage }) => {
        if (!cancelled && markShortcutsNoticeShown()) setMessage(shortcutsUpdatedMessage());
      },
      // A failed download leaves the notice for the next visit.
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [recoveryChecked, hasSavedProjects, quiet]);

  return {
    message,
    dismiss: () => setMessage(null),
    review: () => {
      setMessage(null);
      requestSettingsDialog("shortcuts");
    },
  };
}
