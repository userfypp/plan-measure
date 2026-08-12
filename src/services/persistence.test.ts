import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptySession } from "../app/state";
import {
  discardSavedSession,
  loadSavedSession,
  replaceSavedSession,
  resetPersistenceForTests,
  saveSessionMetadata,
} from "./persistence";
import { deserializeSession, serializeSession } from "./persistenceCodec";

beforeEach(resetPersistenceForTests);
afterEach(resetPersistenceForTests);

describe("session persistence", () => {
  it("serializes and validates the complete session model", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 2);
    session.settings.displayUnit = "cm";
    session.settings.showLabels = false;
    session.pages[2]!.calibration = {
      start: { x: 5, y: 6 },
      end: { x: 7, y: 8 },
      referenceDistanceMm: 900,
    };
    session.pages[2]!.measurements.push({
      id: "custom",
      type: "line",
      name: "Custom name",
      points: [
        { x: 5, y: 6 },
        { x: 9, y: 10 },
      ],
    });
    expect(deserializeSession(serializeSession(session))).toEqual(session);
  });

  it("round trips PDF blob and metadata through IndexedDB", async () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 1);
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    await replaceSavedSession(session, blob);
    session.settings.showMeasurements = false;
    await saveSessionMetadata(session);
    const restored = await loadSavedSession();
    expect(restored?.session.settings.showMeasurements).toBe(false);
    expect(await restored?.pdfBlob.text()).toBe("pdf");
  });

  it("does not save orphaned metadata without its PDF record", async () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 1);
    await expect(saveSessionMetadata(session)).rejects.toThrow("without its PDF");
    expect(await loadSavedSession()).toBeNull();
  });

  it("discards both records", async () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 1);
    await replaceSavedSession(session, new Blob(["pdf"]));
    await discardSavedSession();
    expect(await loadSavedSession()).toBeNull();
  });

  it("rejects blank persisted names", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 1);
    session.pages[1]!.calibration = {
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      referenceDistanceMm: 1,
    };
    session.pages[1]!.measurements.push({
      id: "bad",
      type: "line",
      name: " ",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    expect(() => deserializeSession(serializeSession(session))).toThrow("invalid");
  });
});
