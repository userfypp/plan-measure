import { describe, expect, it } from "vitest";
import { appReducer, initialAppState } from "./state";

describe("application state reducer", () => {
  it("starts without a visible error", () => {
    expect(initialAppState).toEqual({ error: null, errorNotifications: [], nextNotificationId: 0 });
  });

  it("queues every error, including repeated messages and errors in the same update", () => {
    let state = initialAppState;
    for (const message of ["First", "First", "Second"]) {
      state = appReducer(state, { type: "SET_ERROR", message });
    }
    expect(state.errorNotifications).toEqual([
      { id: 0, message: "First" },
      { id: 1, message: "First" },
      { id: 2, message: "Second" },
    ]);
    const dismissed = appReducer(state, { type: "DISMISS_ERROR", id: 0 });
    expect(dismissed.error).toBe("Second");
    expect(dismissed.errorNotifications.map(({ id }) => id)).toEqual([1, 2]);
  });

  it("keeps queued feedback when another action clears the current command error", () => {
    const state = appReducer(initialAppState, { type: "SET_ERROR", message: "Error" });
    const cleared = appReducer(state, { type: "SET_ERROR", message: null });
    expect(cleared.error).toBeNull();
    expect(cleared.errorNotifications).toEqual([{ id: 0, message: "Error" }]);
    expect(appReducer(cleared, { type: "DISMISS_ERROR", id: 0 }).errorNotifications).toEqual([]);
  });

  it("keeps X/Y orientation errors visible until dismissed", () => {
    for (const message of [
      "X reference must be primarily horizontal (|dx| > |dy|).",
      "Y reference must be primarily vertical (|dy| > |dx|).",
    ]) {
      const state = appReducer(initialAppState, { type: "SET_ERROR", message });

      expect(state.error).toBe(message);

      const dismissed = appReducer(state, { type: "SET_ERROR", message: null });
      expect(dismissed.error).toBeNull();
    }
  });
});
