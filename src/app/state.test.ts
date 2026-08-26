import { describe, expect, it } from "vitest";
import { appReducer, initialAppState } from "./state";

describe("application state reducer", () => {
  it("starts without a visible error", () => {
    expect(initialAppState).toEqual({ error: null });
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
