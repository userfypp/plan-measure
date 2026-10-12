import { describe, expect, it, vi } from "vitest";
import { createEmptySession } from "./sessionState";
import { enqueueAutosave, isAutosaveReady, shouldConfirmClose } from "./autosave";

const session = createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1);

describe("autosave boundary", () => {
  it("requires only a CurrentSession snapshot, a valid PDF runtime, a blob, and persistence availability", () => {
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

  it("confirms closing only when enabled and the open project differs from the saved one", () => {
    const edited = { ...session };
    expect(shouldConfirmClose(true, edited, session)).toBe(true);
    expect(shouldConfirmClose(true, edited, null)).toBe(true);
    expect(shouldConfirmClose(true, session, session)).toBe(false);
    expect(shouldConfirmClose(true, null, null)).toBe(false);
    expect(shouldConfirmClose(false, edited, session)).toBe(false);
  });
});
