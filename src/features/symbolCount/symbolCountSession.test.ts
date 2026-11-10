import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reloadAppPreferencesFromStorage,
  resetAppPreferences,
  setAppPreference,
} from "../../utils/appPreferences";
import {
  EMPTY_BOX_MESSAGE,
  SMALL_BOX_MESSAGE,
  acceptedPoints,
  createSymbolCountSession,
  hitMatch,
  matchStatus,
  type SymbolSearchStart,
  stopSymbolCount,
} from "./symbolCountSession";
import { getSymbolCount, startSymbolCount } from "./symbolCountStore";
import type { CreateSymbolSearch, SymbolSearchCallbacks } from "./symbolSearch";
import type { SymbolMatch } from "./templateMatch";

function match(x: number, y: number, score: number): SymbolMatch {
  return { x, y, width: 20, height: 20, score };
}

function setup() {
  let callbacks!: SymbolSearchCallbacks;
  const search = vi.fn();
  const terminate = vi.fn();
  const create: CreateSymbolSearch = (_image, given) => {
    callbacks = given;
    return { search, terminate };
  };
  const session = createSymbolCountSession(create);
  const start = (existing: SymbolSearchStart["existing"] = []) =>
    session.startSearch({
      image: { data: new Uint8Array(4), width: 2, height: 2 },
      scale: 2,
      box: { x: 0, y: 0, width: 2, height: 2 },
      existing,
    });
  return { session, search, terminate, start, callbacks: () => callbacks };
}

beforeEach(() => stopSymbolCount());
afterEach(() => {
  resetAppPreferences();
  reloadAppPreferencesFromStorage();
});

describe("symbol count session", () => {
  it("searches the box and returns matches in page units", () => {
    const { session, search, start, callbacks } = setup();
    start();
    expect(session.getState().phase).toBe("scanning");
    expect(search).toHaveBeenCalledWith({ x: 0, y: 0, width: 2, height: 2 }, true);
    callbacks().onProgress(0.5);
    expect(session.getState().progress).toBe(50);
    callbacks().onResult({ matches: [{ x: 40, y: 20, width: 10, height: 6, score: 1 }] });
    expect(session.getState().phase).toBe("review");
    expect(session.getState().matches[0]).toEqual({ x: 20, y: 10, width: 5, height: 3, score: 1 });
  });

  it("filters by the similarity preset without searching again", () => {
    const { session, search, start, callbacks } = setup();
    start();
    callbacks().onResult({ matches: [match(0, 0, 0.95), match(50, 0, 0.85), match(100, 0, 0.65)] });
    const accepted = () => acceptedPoints(session.getState()).length;
    expect(accepted()).toBe(2);
    session.setSimilarity("exact");
    expect(accepted()).toBe(1);
    session.setSimilarity("high");
    expect(accepted()).toBe(2);
    session.setSimilarity("loose");
    expect(accepted()).toBe(3);
    session.setSimilarity("balanced");
    expect(matchStatus(session.getState(), 2)).toBe("below");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("lets the user exclude and restore a match", () => {
    const { session, start, callbacks } = setup();
    start();
    callbacks().onResult({ matches: [match(20, 20, 1), match(100, 20, 0.9)] });
    expect(hitMatch(session.getState(), { x: 12, y: 12 }, 0)).toBe(0);
    session.toggleExcluded(0);
    expect(matchStatus(session.getState(), 0)).toBe("excluded");
    expect(acceptedPoints(session.getState())).toEqual([{ x: 50, y: 10 }]);
    session.toggleExcluded(0);
    expect(acceptedPoints(session.getState())).toHaveLength(2);
    expect(hitMatch(session.getState(), { x: 500, y: 500 }, 0)).toBeNull();
  });

  it("skips symbols already counted", () => {
    const { session, start, callbacks } = setup();
    start([{ x: 11, y: 10 }]);
    callbacks().onResult({ matches: [match(20, 20, 1), match(100, 20, 0.9)] });
    expect(matchStatus(session.getState(), 0)).toBe("duplicate");
    expect(acceptedPoints(session.getState())).toEqual([{ x: 50, y: 10 }]);
  });

  it("searches again when the orientation changes and clears exclusions", () => {
    const { session, search, start, callbacks } = setup();
    start();
    callbacks().onResult({ matches: [match(20, 20, 1)] });
    session.toggleExcluded(0);
    session.setOrientations(false);
    expect(search).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 2, height: 2 }, false);
    expect(session.getState().phase).toBe("scanning");
    expect(session.getState().excluded.size).toBe(0);
    callbacks().onResult({ matches: [match(20, 20, 1)] });
    expect(session.getState().phase).toBe("review");
  });

  it("goes back to picking with a message when the box cannot be searched", () => {
    const { session, terminate, start, callbacks } = setup();
    start();
    callbacks().onResult({ matches: [], failure: "empty" });
    expect(session.getState()).toMatchObject({ phase: "pick", message: EMPTY_BOX_MESSAGE });
    expect(terminate).toHaveBeenCalled();
    start();
    callbacks().onResult({ matches: [], failure: "small" });
    expect(session.getState().message).toBe(SMALL_BOX_MESSAGE);
  });

  it("reports a search that cannot start or fails", () => {
    const session = createSymbolCountSession(() => {
      throw new Error("no worker");
    });
    session.startSearch({
      image: { data: new Uint8Array(1), width: 1, height: 1 },
      scale: 1,
      box: { x: 0, y: 0, width: 1, height: 1 },
      existing: [],
    });
    expect(session.getState().phase).toBe("error");
    expect(session.getState().message).toBeTruthy();
    const { session: other, start, callbacks } = setup();
    start();
    callbacks().onError("It broke.");
    expect(other.getState()).toMatchObject({ phase: "error", message: "It broke." });
  });

  it("commits the accepted points once and stops", () => {
    const { session, start, callbacks } = setup();
    const commit = vi.fn();
    session.setCommitHandler(commit);
    startSymbolCount();
    start();
    expect(session.commit()).toBe(false);
    callbacks().onResult({ matches: [match(20, 20, 1), match(100, 20, 0.9), match(200, 20, 0.6)] });
    expect(session.commit()).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith([
      { x: 10, y: 10 },
      { x: 50, y: 10 },
    ]);
    expect(getSymbolCount().active).toBe(false);
  });

  it("does not commit with nothing accepted, and reset ends the search", () => {
    const { session, terminate, start, callbacks } = setup();
    const commit = vi.fn();
    session.setCommitHandler(commit);
    start();
    callbacks().onResult({ matches: [match(20, 20, 0.5)] });
    expect(session.commit()).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    session.reset();
    expect(terminate).toHaveBeenCalled();
    expect(session.getState().phase).toBe("pick");
  });
});

describe("symbol count defaults from Settings", () => {
  it("starts from the default similarity and rotation", () => {
    const { session } = setup();
    expect(session.getState()).toMatchObject({ similarity: "balanced", orientations: true });
  });

  it("starts a new session from the saved similarity and rotation", () => {
    setAppPreference("similarMatch", "high");
    setAppPreference("similarRotated", false);
    const { session, search, start } = setup();
    expect(session.getState()).toMatchObject({ similarity: "high", orientations: false });
    start();
    expect(search).toHaveBeenCalledWith({ x: 0, y: 0, width: 2, height: 2 }, false);
  });

  it("applies a changed setting on reset and drops the previous run's choices", () => {
    const { session, start, callbacks } = setup();
    start();
    callbacks().onResult({ matches: [match(20, 20, 1)] });
    session.setSimilarity("loose");
    setAppPreference("similarMatch", "exact");
    session.reset();
    expect(session.getState()).toMatchObject({ phase: "pick", similarity: "exact", matches: [] });
  });
});
