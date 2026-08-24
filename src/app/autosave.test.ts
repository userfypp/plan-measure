import { describe, expect, it, vi } from "vitest";
import { createEmptySession } from "./sessionState";
import { enqueueAutosave, isAutosaveReady } from "./autosave";

const session = createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1);

describe("autosave boundary", () => {
  it("requires only a SessionV5 snapshot, a valid PDF runtime, a blob, and persistence availability", () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });

    expect(
      isAutosaveReady({
        snapshot: session,
        pdfRuntimeReady: true,
        pdfBlob: blob,
        enabled: true,
      }),
    ).toBe(true);
    expect(
      isAutosaveReady({
        snapshot: session,
        pdfRuntimeReady: false,
        pdfBlob: blob,
        enabled: true,
      }),
    ).toBe(false);
    expect(
      isAutosaveReady({
        snapshot: null,
        pdfRuntimeReady: true,
        pdfBlob: blob,
        enabled: true,
      }),
    ).toBe(false);
  });

  it("skips stale generations and saves the current snapshot after the queue", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const previous = Promise.resolve();

    await enqueueAutosave(previous, session, 2, (generation) => generation === 3, save);
    expect(save).not.toHaveBeenCalled();

    await enqueueAutosave(previous, session, 3, (generation) => generation === 3, save);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(session);
  });

  it("continues after a failed previous save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const previous = Promise.reject(new Error("old save failed"));

    await enqueueAutosave(previous, session, 1, () => true, save);

    expect(save).toHaveBeenCalledOnce();
  });
});
