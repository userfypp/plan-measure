import { describe, expect, it } from "vitest";
import {
  createEmptySession,
  sessionReducer,
  type CalibrationInput,
  type SessionAction,
  type SessionCommandResult,
} from "./sessionState";

const PAGE_UNAVAILABLE = "The selected page is no longer available.";
const INVALID_PAGE_LABEL = "Page labels must be single-line text without control characters.";
const EMPTY_SCALE_NAME = "Scale name cannot be empty.";
const INVALID_NEW_SCALE =
  "Scale requires a unique ID, two distinct points, and a valid distance greater than zero.";
const INVALID_RECALIBRATION =
  "Scale requires two distinct points and a valid distance greater than zero.";
const SCALE_UNAVAILABLE = "The selected scale is no longer available.";
const SCALE_IN_USE = "Cannot delete a scale that is used by measurements.";
const MEASUREMENT_UNAVAILABLE = "The selected measurement is no longer available.";

/** Freezes the whole fixture, so a command that mutates its input throws instead of passing. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function uniform(endX: number, referenceDistanceMm = 1000): CalibrationInput {
  return { mode: "uniform", start: { x: 0, y: 0 }, end: { x: endX, y: 0 }, referenceDistanceMm };
}

function apply(state: SessionCommandResult, actions: SessionAction[]): SessionCommandResult {
  return actions.reduce(sessionReducer, state);
}

/** Two pages; page 1 has scale-1 (active, used by line-1), scale-2 (unused) and count-1. */
function frozenState(): SessionCommandResult {
  const empty = createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 2);
  const state = apply({ session: empty, error: null }, [
    {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-2",
      name: "Detail",
      calibration: uniform(20),
    },
    {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Main",
      calibration: uniform(10),
    },
    {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    },
    {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "count-1",
      measurementType: "count",
      points: [{ x: 5, y: 5 }],
    },
    { type: "SET_PAGE_LABEL_OVERRIDE", pageNumber: 2, label: "A-102" },
  ]);
  expect(state.error).toBeNull();
  expect(state.session?.pages[1]?.activeCalibrationId).toBe("scale-1");
  return deepFreeze({ ...state, error: null });
}

/** Applies each action to the same frozen state and expects the session untouched. */
function expectRejected(actions: SessionAction[], error: string) {
  const state = frozenState();
  for (const action of actions) {
    const result = sessionReducer(state, action);
    expect(result.session, action.type).toBe(state.session);
    expect(result.error, JSON.stringify(action)).toBe(error);
  }
}

function expectNoOp(action: SessionAction) {
  const state = frozenState();
  const result = sessionReducer({ ...state, error: "stale" }, action);
  expect(result.session).toBe(state.session);
  expect(result.error).toBeNull();
}

describe("session page commands", () => {
  it("clamps UPDATE_PAGE to an existing whole page", () => {
    const state = frozenState();
    const page = (pageNumber: number) =>
      sessionReducer(state, { type: "UPDATE_PAGE", pageNumber }).session?.currentPage;
    expect(page(2)).toBe(2);
    expect(page(0)).toBe(1);
    expect(page(-3)).toBe(1);
    expect(page(99)).toBe(2);
    expect(page(1.5)).toBe(1);
    expect(page(2.9)).toBe(2);
  });

  it("ignores a non-finite UPDATE_PAGE and keeps the session for the current page", () => {
    const state = frozenState();
    for (const pageNumber of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(sessionReducer(state, { type: "UPDATE_PAGE", pageNumber })).toBe(state);
    }
    expectNoOp({ type: "UPDATE_PAGE", pageNumber: 1 });
  });

  it("rejects page labels for missing pages or with control characters", () => {
    expectRejected(
      [0, 3, Number.NaN, 1.5].flatMap((pageNumber): SessionAction[] => [
        { type: "SET_PAGE_LABEL_OVERRIDE", pageNumber, label: "A" },
        { type: "REMOVE_PAGE_LABEL_OVERRIDE", pageNumber },
      ]),
      PAGE_UNAVAILABLE,
    );
    expectRejected(
      ["A\nB", "A\tB", "A\u007fB"].map((label): SessionAction => ({
        type: "SET_PAGE_LABEL_OVERRIDE",
        pageNumber: 1,
        label,
      })),
      INVALID_PAGE_LABEL,
    );
  });

  it("treats setting the same page label again as a no-op", () => {
    expectNoOp({ type: "SET_PAGE_LABEL_OVERRIDE", pageNumber: 2, label: " A-102 " });
  });
});

describe("session scale commands", () => {
  it("rejects a new scale with a blank name", () => {
    expectRejected(
      [
        {
          type: "ADD_CALIBRATION",
          pageNumber: 1,
          id: "scale-3",
          name: "  ",
          calibration: uniform(5),
        },
      ],
      EMPTY_SCALE_NAME,
    );
  });

  it("rejects a new scale with a bad id, page or geometry", () => {
    const add = (overrides: Partial<Extract<SessionAction, { type: "ADD_CALIBRATION" }>>) =>
      ({
        type: "ADD_CALIBRATION",
        pageNumber: 1,
        id: "scale-3",
        name: "New",
        calibration: uniform(5),
        ...overrides,
      }) as SessionAction;
    expectRejected(
      [
        add({ id: "  " }),
        add({ id: "scale-1" }),
        add({ pageNumber: 3 }),
        add({ calibration: uniform(0) }),
        add({ calibration: uniform(5, 0) }),
        add({ calibration: uniform(5, -1) }),
        add({ calibration: uniform(5, Number.NaN) }),
        add({ calibration: uniform(Number.NaN) }),
      ],
      INVALID_NEW_SCALE,
    );
  });

  it("rejects recalibrating a missing scale, another mode or invalid geometry", () => {
    const xy: CalibrationInput = {
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 1000 },
    };
    expectRejected(
      [
        {
          type: "RECALIBRATE_CALIBRATION",
          pageNumber: 3,
          calibrationId: "scale-1",
          calibration: uniform(5),
        },
        {
          type: "RECALIBRATE_CALIBRATION",
          pageNumber: 1,
          calibrationId: "missing",
          calibration: uniform(5),
        },
        {
          type: "RECALIBRATE_CALIBRATION",
          pageNumber: 1,
          calibrationId: "scale-1",
          calibration: xy,
        },
        {
          type: "RECALIBRATE_CALIBRATION",
          pageNumber: 1,
          calibrationId: "scale-1",
          calibration: uniform(0),
        },
        {
          type: "RECALIBRATE_CALIBRATION",
          pageNumber: 1,
          calibrationId: "scale-1",
          calibration: uniform(5, Number.NaN),
        },
      ],
      INVALID_RECALIBRATION,
    );
  });

  it("treats recalibrating to the same geometry as a no-op", () => {
    expectNoOp({
      type: "RECALIBRATE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
      calibration: uniform(10),
    });
  });

  it("rejects renaming to a blank name or a missing scale", () => {
    expectRejected(
      [{ type: "RENAME_CALIBRATION", pageNumber: 1, calibrationId: "scale-1", name: " " }],
      EMPTY_SCALE_NAME,
    );
    expectRejected(
      [
        { type: "RENAME_CALIBRATION", pageNumber: 1, calibrationId: "missing", name: "New" },
        { type: "RENAME_CALIBRATION", pageNumber: 3, calibrationId: "scale-1", name: "New" },
      ],
      SCALE_UNAVAILABLE,
    );
    expectNoOp({
      type: "RENAME_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
      name: " Main ",
    });
  });

  it("rejects deleting a missing scale or one that measurements use", () => {
    expectRejected(
      [
        { type: "DELETE_CALIBRATION", pageNumber: 1, calibrationId: "missing" },
        { type: "DELETE_CALIBRATION", pageNumber: 2, calibrationId: "scale-2" },
        { type: "DELETE_CALIBRATION", pageNumber: 3, calibrationId: "scale-2" },
      ],
      SCALE_UNAVAILABLE,
    );
    expectRejected(
      [{ type: "DELETE_CALIBRATION", pageNumber: 1, calibrationId: "scale-1" }],
      SCALE_IN_USE,
    );
  });

  it("moves the active scale to the first remaining one when the active scale is deleted", () => {
    const state = apply(frozenState(), [
      { type: "SET_ACTIVE_CALIBRATION", pageNumber: 1, calibrationId: "scale-2" },
      { type: "DELETE_CALIBRATION", pageNumber: 1, calibrationId: "scale-2" },
    ]);
    expect(state.error).toBeNull();
    expect(state.session?.pages[1]?.calibrations.map(({ id }) => id)).toEqual(["scale-1"]);
    expect(state.session?.pages[1]?.activeCalibrationId).toBe("scale-1");

    const unused = apply(state, [
      {
        type: "ADD_CALIBRATION",
        pageNumber: 2,
        id: "scale-3",
        name: "Only",
        calibration: uniform(5),
      },
      { type: "DELETE_CALIBRATION", pageNumber: 2, calibrationId: "scale-3" },
    ]);
    expect(unused.error).toBeNull();
    expect(unused.session?.pages[2]?.calibrations).toEqual([]);
    expect(unused.session?.pages[2]?.activeCalibrationId).toBeNull();
  });

  it("rejects activating a scale on another or missing page", () => {
    expectRejected(
      [
        { type: "SET_ACTIVE_CALIBRATION", pageNumber: 1, calibrationId: "missing" },
        { type: "SET_ACTIVE_CALIBRATION", pageNumber: 2, calibrationId: "scale-1" },
        { type: "SET_ACTIVE_CALIBRATION", pageNumber: 3, calibrationId: "scale-1" },
      ],
      SCALE_UNAVAILABLE,
    );
  });
});

describe("ASSIGN_MEASUREMENT_CALIBRATION", () => {
  it("rejects a missing measurement or page before checking the scale", () => {
    expectRejected(
      [
        {
          type: "ASSIGN_MEASUREMENT_CALIBRATION",
          pageNumber: 1,
          measurementId: "missing",
          calibrationId: "scale-2",
        },
        {
          type: "ASSIGN_MEASUREMENT_CALIBRATION",
          pageNumber: 2,
          measurementId: "line-1",
          calibrationId: "scale-2",
        },
        {
          type: "ASSIGN_MEASUREMENT_CALIBRATION",
          pageNumber: 3,
          measurementId: "line-1",
          calibrationId: "missing",
        },
      ],
      MEASUREMENT_UNAVAILABLE,
    );
  });

  it("rejects a scale that is not on the measurement's page", () => {
    expectRejected(
      [
        {
          type: "ASSIGN_MEASUREMENT_CALIBRATION",
          pageNumber: 1,
          measurementId: "line-1",
          calibrationId: "missing",
        },
      ],
      SCALE_UNAVAILABLE,
    );
  });

  it("leaves count items, which have no scale, unchanged", () => {
    const state = frozenState();
    const result = sessionReducer(state, {
      type: "ASSIGN_MEASUREMENT_CALIBRATION",
      pageNumber: 1,
      measurementId: "count-1",
      calibrationId: "scale-2",
    });
    expect(result).toBe(state);
  });

  it("reassigns a measurement to another scale on its page", () => {
    const result = sessionReducer(frozenState(), {
      type: "ASSIGN_MEASUREMENT_CALIBRATION",
      pageNumber: 1,
      measurementId: "line-1",
      calibrationId: "scale-2",
    });
    expect(result.error).toBeNull();
    expect(result.session?.pages[1]?.measurements.find(({ id }) => id === "line-1")).toMatchObject({
      calibrationId: "scale-2",
    });
  });
});
