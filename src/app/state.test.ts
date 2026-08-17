import { describe, expect, it } from "vitest";
import { appReducer, createEmptySession, initialAppState, type AppState } from "./state";

function loadedState(): AppState {
  return {
    ...initialAppState,
    session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 2),
  };
}

describe("application reducer", () => {
  it("rejects measurement tools on an uncalibrated page", () => {
    const line = appReducer(loadedState(), { type: "SET_TOOL", tool: "line" });
    expect(line.tool).toBe("select");
    expect(line.error).toContain("Calibrate");
  });

  it("rejects programmatic measurement creation without calibration", () => {
    const lineResult = appReducer(loadedState(), {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(lineResult.session?.pages[1]?.measurements).toHaveLength(0);
    expect(lineResult.tool).toBe("select");

    const polygonResult = appReducer(loadedState(), {
      type: "ADD_POLYGON",
      pageNumber: 1,
      id: "polygon-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    expect(polygonResult.session?.pages[1]?.measurements).toHaveLength(0);
    expect(polygonResult.error).toContain("Calibrate");
  });

  it("creates measurements with persistent page-local counters", () => {
    let state = appReducer(loadedState(), {
      type: "SET_CALIBRATION",
      pageNumber: 1,
      calibration: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = appReducer(state, { type: "DELETE_MEASUREMENT", pageNumber: 1, id: "line-1" });
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-2",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Line 2");
  });

  it("trims names and retains the last valid name for blank edits", () => {
    let state = loadedState();
    state = appReducer(state, {
      type: "SET_CALIBRATION",
      pageNumber: 1,
      calibration: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = appReducer(state, {
      type: "RENAME_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      name: "  Hallway  ",
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Hallway");
    state = appReducer(state, {
      type: "RENAME_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      name: "   ",
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Hallway");
    expect(state.error).toContain("cannot be empty");
  });

  it("cancels drafts and stale tools on page navigation", () => {
    const state: AppState = {
      ...loadedState(),
      tool: "calibrate",
      draft: { type: "calibrate", points: [{ x: 1, y: 1 }], pointer: null },
    };
    const result = appReducer(state, { type: "SET_PAGE", pageNumber: 2 });
    expect(result.tool).toBe("select");
    expect(result.draft).toBeNull();
  });

  it("clears transient selection and drawing state when loading a replacement session", () => {
    const state: AppState = {
      ...loadedState(),
      tool: "polygon",
      selectedMeasurementId: "stale-measurement",
      draft: { type: "polygon", points: [{ x: 1, y: 1 }], pointer: null },
    };
    const result = appReducer(state, {
      type: "LOAD_SESSION",
      session: createEmptySession({ name: "replacement.pdf", size: 200, lastModified: 2 }, 1),
    });
    expect(result.tool).toBe("select");
    expect(result.selectedMeasurementId).toBeNull();
    expect(result.draft).toBeNull();
  });

  it("ignores stale throttled pointer updates after a draft is cancelled", () => {
    const state = appReducer(loadedState(), {
      type: "UPDATE_DRAFT_POINTER",
      draftType: "polygon",
      pointer: { x: 20, y: 20 },
    });
    expect(state.draft).toBeNull();
  });

  it("rejects invalid calibration data in domain state", () => {
    const identicalPoints = appReducer(loadedState(), {
      type: "SET_CALIBRATION",
      pageNumber: 1,
      calibration: {
        start: { x: 10, y: 10 },
        end: { x: 10, y: 10 },
        referenceDistanceMm: 1000,
      },
    });
    expect(identicalPoints.session?.pages[1]?.calibration).toBeNull();
    expect(identicalPoints.error).toContain("distinct points");

    const infiniteDistance = appReducer(loadedState(), {
      type: "SET_CALIBRATION",
      pageNumber: 1,
      calibration: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: Number.POSITIVE_INFINITY,
      },
    });
    expect(infiniteDistance.session?.pages[1]?.calibration).toBeNull();
    expect(infiniteDistance.error).toContain("valid distance");
  });
});
