export type SaveState =
  "inactive" | "saving" | "saved" | "failed" | "conflict" | "repair-required" | "unavailable";

export const SAVE_STATUS_TEXT: Record<SaveState, string> = {
  inactive: "Saving…",
  saving: "Saving…",
  saved: "Saved on this device",
  failed: "Couldn't save",
  conflict: "Changed in another tab",
  "repair-required": "Autosave paused: repair needed",
  unavailable: "Storage unavailable",
};

/** Runtime-only selector: status updates notify the indicator, never the workspace. */
export function createSaveStatusStore() {
  let snapshot = {
    state: "inactive" as SaveState,
    announcement: "",
    savingStartedAt: null as number | null,
  };
  let recoveryPending = false;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (state: SaveState) => {
      if (snapshot.state === state) return;
      const problem =
        state === "failed" ||
        state === "conflict" ||
        state === "repair-required" ||
        state === "unavailable";
      let announcement = snapshot.announcement;
      if (problem) {
        announcement = SAVE_STATUS_TEXT[state];
        recoveryPending = true;
      } else if (state === "saved" && recoveryPending) {
        announcement = "Saving recovered. Saved on this device.";
        recoveryPending = false;
      } else if (state === "inactive") {
        announcement = "";
        recoveryPending = false;
      }
      snapshot = {
        state,
        announcement,
        savingStartedAt:
          state === "saving" ? Date.now() : state === "saved" ? snapshot.savingStartedAt : null,
      };
      listeners.forEach((listener) => listener());
    },
  };
}

export type SaveStatusStore = ReturnType<typeof createSaveStatusStore>;
