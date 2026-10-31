// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../types/domain";
import type { UndoHistory } from "../services/undoHistoryStorage";
import { createEmptySession } from "./sessionState";
import {
  createUndoHistoryWriter,
  estimateHistoryLoad,
  scheduleWhenIdle,
  trimToBudget,
  type SavedHistoryEntry,
} from "./undoHistoryPersistence";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const base = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 2);

/** A session whose page 1 holds `count` measurements; page 2 is shared with `base`. */
function withMeasurements(count: number): CurrentSession {
  return {
    ...base,
    pages: {
      ...base.pages,
      1: {
        ...base.pages[1]!,
        measurements: Array.from({ length: count }, (_, index) => ({
          id: `m-${count}-${index}`,
          name: "",
          type: "line" as const,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          calibrationId: null,
          classificationValueIds: [],
          visible: true,
        })),
      },
    },
  };
}

type Write = (projectId: string, revision: string, history: UndoHistory | null) => Promise<boolean>;

function setup(write = vi.fn<Write>(async () => true)) {
  const scheduled: Array<() => void> = [];
  let cancelled = 0;
  const writer = createUndoHistoryWriter({
    write,
    idle: (callback) => {
      scheduled.push(callback);
      return () => {
        cancelled += 1;
        scheduled.splice(scheduled.indexOf(callback), 1);
      };
    },
  });
  let generation = 0;
  const entry = (
    undo: readonly CurrentSession[],
    redo: readonly CurrentSession[],
    revision = "r1",
    projectId = "p1",
  ): SavedHistoryEntry => {
    const own = generation;
    return { projectId, revision, isCurrent: () => own === generation, undo, redo };
  };
  return {
    writer,
    write,
    scheduled,
    entry,
    cancelled: () => cancelled,
    supersede: () => (generation += 1),
    runIdle: async () => {
      scheduled.shift()?.();
      await vi.waitFor(() => undefined);
    },
  };
}

describe("history size", () => {
  it("counts the measurements of each distinct page once", () => {
    const shared = withMeasurements(10);
    expect(estimateHistoryLoad([shared, shared, { ...shared }])).toBe(10);
    expect(estimateHistoryLoad([withMeasurements(10), withMeasurements(5)])).toBe(15);
  });

  it("returns the same stacks when they fit", () => {
    const undo = [withMeasurements(3), withMeasurements(4)];
    const redo = [withMeasurements(2)];
    const trimmed = trimToBudget(undo, redo, 100);
    expect(trimmed.undo).toBe(undo);
    expect(trimmed.redo).toBe(redo);
  });

  it("drops the oldest undo steps first", () => {
    const [oldest, middle, newest] = [
      withMeasurements(10),
      withMeasurements(11),
      withMeasurements(12),
    ];
    const redo = [withMeasurements(5)];
    const trimmed = trimToBudget([oldest, middle, newest], redo, 30);
    expect(trimmed.undo).toEqual([middle, newest]);
    expect(trimmed.redo).toBe(redo);
  });

  it("drops the farthest redo steps only after every undo step", () => {
    const nearest = withMeasurements(10);
    const farthest = withMeasurements(11);
    const trimmed = trimToBudget([withMeasurements(1)], [farthest, nearest], 15);
    expect(trimmed.undo).toEqual([]);
    expect(trimmed.redo).toEqual([nearest]);
  });
});

describe("undo history writer", () => {
  it("waits for idle time and writes the stacks with the saved revision", async () => {
    const { writer, write, scheduled, entry, runIdle } = setup();
    const undo = [withMeasurements(1)];

    writer.recordSaved(entry(undo, []));
    expect(write).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await runIdle();

    expect(write).toHaveBeenCalledWith("p1", "r1", { undo, redo: [] });
  });

  it("writes only the label when the stacks are the ones last written", async () => {
    const { writer, write, scheduled, entry, runIdle } = setup();
    const undo = [withMeasurements(1)];
    const redo: CurrentSession[] = [];
    writer.recordSaved(entry(undo, redo));
    await runIdle();

    writer.recordSaved(entry(undo, redo, "r2"));
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));

    expect(write).toHaveBeenLastCalledWith("p1", "r2", null);
    expect(scheduled).toHaveLength(0);
  });

  it("writes the stacks again for another project or after they change", async () => {
    const { writer, write, entry, runIdle } = setup();
    const undo = [withMeasurements(1)];
    writer.recordSaved(entry(undo, []));
    await runIdle();

    writer.recordSaved(entry(undo, [], "r2", "p2"));
    await runIdle();
    writer.recordSaved(entry([...undo, withMeasurements(2)], [], "r3", "p2"));
    await runIdle();

    expect(write.mock.calls.map((call) => call[2] !== null)).toEqual([true, true, true]);
  });

  it("keeps only the last pending entry", async () => {
    const { writer, write, scheduled, entry, runIdle, cancelled } = setup();
    const first = [withMeasurements(1)];
    const last = [withMeasurements(1), withMeasurements(2)];

    writer.recordSaved(entry(first, [], "r1"));
    writer.recordSaved(entry(last, [], "r2"));
    expect(cancelled()).toBe(1);
    expect(scheduled).toHaveLength(1);
    await runIdle();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("p1", "r2", { undo: last, redo: [] });
  });

  it("trims the persisted copy only", async () => {
    const { writer, write, entry, runIdle } = setup();
    const huge = [withMeasurements(200_000), withMeasurements(100_000)];

    writer.recordSaved(entry(huge, []));
    await runIdle();

    const written = write.mock.calls[0]![2]!;
    expect(written.undo).toEqual([huge[1]]);
    expect(huge).toHaveLength(2);
  });

  it("flushNow writes the pending entry without waiting", async () => {
    const { writer, write, entry, scheduled, cancelled } = setup();

    writer.recordSaved(entry([withMeasurements(1)], []));
    await writer.flushNow();

    expect(write).toHaveBeenCalledTimes(1);
    expect(cancelled()).toBe(1);
    expect(scheduled).toHaveLength(0);
    await writer.flushNow();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("only warns when a write fails, and writes the stacks again next time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const write = vi.fn<Write>();
    write.mockRejectedValueOnce(new Error("quota"));
    write.mockResolvedValue(true);
    const { writer, entry, runIdle } = setup(write);
    const undo = [withMeasurements(1)];

    writer.recordSaved(entry(undo, []));
    await runIdle();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    writer.recordSaved(entry(undo, [], "r2"));
    await runIdle();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![2]).not.toBeNull();
  });

  it("treats a write that reports failure like one that throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { writer, entry, runIdle } = setup(vi.fn<Write>(async () => false));

    writer.recordSaved(entry([withMeasurements(1)], []));
    await runIdle();

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
  });

  it("writes nothing for an entry whose save generation has passed", async () => {
    const { writer, write, entry, runIdle, supersede } = setup();

    writer.recordSaved(entry([withMeasurements(1)], []));
    supersede();
    await runIdle();

    expect(write).not.toHaveBeenCalled();
  });

  it("reset cancels the pending entry and forgets what was written", async () => {
    const { writer, write, scheduled, entry, runIdle } = setup();
    const undo = [withMeasurements(1)];
    writer.recordSaved(entry(undo, []));
    await runIdle();

    writer.recordSaved(entry([...undo, withMeasurements(2)], [], "r2"));
    writer.reset();
    expect(scheduled).toHaveLength(0);
    await writer.flushNow();
    expect(write).toHaveBeenCalledTimes(1);

    writer.recordSaved(entry(undo, [], "r3"));
    expect(scheduled).toHaveLength(1);
  });
});

describe("scheduleWhenIdle", () => {
  it("runs after the delay and can be cancelled", () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    const cancel = scheduleWhenIdle(ran, 1000);
    vi.advanceTimersByTime(999);
    expect(ran).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ran).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    scheduleWhenIdle(cancelled, 1000)();
    vi.advanceTimersByTime(5000);
    expect(cancelled).not.toHaveBeenCalled();
    cancel();
  });
});
