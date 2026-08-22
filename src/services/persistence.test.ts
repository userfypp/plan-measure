import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptySession } from "../app/state";
import type { SessionV1, SessionV2 } from "../types/domain";
import { lineLengthMm, polygonResultsMm } from "../utils/geometry";
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

function legacySession(withCalibration: boolean): SessionV1 {
  return {
    schemaVersion: 1,
    pdf: { name: "legacy-plan.pdf", size: 3, lastModified: 1 },
    pageCount: 1,
    currentPage: 1,
    pages: {
      1: {
        pageNumber: 1,
        calibration: withCalibration
          ? {
              start: { x: 0, y: 0 },
              end: { x: 10, y: 0 },
              referenceDistanceMm: 1000,
            }
          : null,
        measurements: withCalibration
          ? [
              {
                id: "legacy-line",
                type: "line",
                name: "Legacy line",
                points: [
                  { x: 0, y: 0 },
                  { x: 25, y: 0 },
                ],
              },
              {
                id: "legacy-polygon",
                type: "polygon",
                name: "Legacy room",
                points: [
                  { x: 0, y: 0 },
                  { x: 10, y: 0 },
                  { x: 10, y: 10 },
                  { x: 0, y: 10 },
                ],
              },
            ]
          : [],
        nextLineNumber: withCalibration ? 2 : 1,
        nextPolygonNumber: withCalibration ? 2 : 1,
      },
    },
    settings: {
      displayUnit: "m",
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
    },
  };
}

function currentMeasuredSession(): SessionV2 {
  const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 2);
  session.settings.displayUnit = "cm";
  session.settings.showLabels = false;
  session.pages[2]!.calibrations.push({
    id: "custom-scale",
    name: "Detail A",
    start: { x: 5, y: 6 },
    end: { x: 7, y: 8 },
    referenceDistanceMm: 900,
  });
  session.pages[2]!.activeCalibrationId = "custom-scale";
  session.pages[2]!.nextCalibrationNumber = 2;
  session.pages[2]!.measurements.push({
    id: "custom",
    type: "line",
    name: "Custom name",
    calibrationId: "custom-scale",
    points: [
      { x: 5, y: 6 },
      { x: 9, y: 10 },
    ],
  });
  return session;
}

describe("session persistence", () => {
  it("migrates a V1 page without calibration to an empty V2 page", () => {
    const migrated = deserializeSession(JSON.stringify(legacySession(false)));
    const page = migrated.pages[1]!;

    expect(migrated.schemaVersion).toBe(2);
    expect(page.calibrations).toEqual([]);
    expect(page.activeCalibrationId).toBeNull();
    expect(page.nextCalibrationNumber).toBe(1);
    expect(page.measurements).toEqual([]);
    expect(page.nextLineNumber).toBe(1);
    expect(page.nextPolygonNumber).toBe(1);
  });

  it("migrates V1 measurements to one deterministic Scale 1 without changing results", () => {
    const legacy = legacySession(true);
    const legacyPage = legacy.pages[1]!;
    const legacyCalibration = legacyPage.calibration!;
    const legacyLine = legacyPage.measurements[0]!;
    const legacyPolygon = legacyPage.measurements[1]!;
    const beforeLine = lineLengthMm(
      legacyLine.points as [{ x: number; y: number }, { x: number; y: number }],
      legacyCalibration,
    );
    const beforePolygon = polygonResultsMm(legacyPolygon, legacyCalibration);

    const migrated = deserializeSession(JSON.stringify(legacy));
    const page = migrated.pages[1]!;
    const calibration = page.calibrations[0]!;

    expect(calibration).toMatchObject({
      id: "legacy-page-1-scale-1",
      name: "Scale 1",
      ...legacyCalibration,
    });
    expect(page.activeCalibrationId).toBe(calibration.id);
    expect(page.nextCalibrationNumber).toBe(2);
    expect(page.nextLineNumber).toBe(legacyPage.nextLineNumber);
    expect(page.nextPolygonNumber).toBe(legacyPage.nextPolygonNumber);
    expect(migrated.pdf).toEqual(legacy.pdf);
    expect(migrated.currentPage).toBe(legacy.currentPage);
    expect(migrated.settings).toEqual(legacy.settings);
    expect(page.measurements.map((measurement) => measurement.calibrationId)).toEqual([
      calibration.id,
      calibration.id,
    ]);
    expect(page.measurements.map((measurement) => measurement.id)).toEqual([
      "legacy-line",
      "legacy-polygon",
    ]);
    expect(page.measurements.map((measurement) => measurement.name)).toEqual([
      "Legacy line",
      "Legacy room",
    ]);
    expect(page.measurements.map((measurement) => measurement.points)).toEqual(
      legacyPage.measurements.map((measurement) => measurement.points),
    );
    expect(
      lineLengthMm(
        page.measurements[0]!.points as [{ x: number; y: number }, { x: number; y: number }],
        calibration,
      ),
    ).toBe(beforeLine);
    expect(polygonResultsMm(page.measurements[1]!, calibration)).toEqual(beforePolygon);
  });

  it("uses the same migrated calibration ID every time the identical V1 JSON is decoded", () => {
    const serialized = JSON.stringify(legacySession(true));
    const first = deserializeSession(serialized);
    const second = deserializeSession(serialized);

    expect(first.pages[1]!.calibrations[0]!.id).toBe("legacy-page-1-scale-1");
    expect(second.pages[1]!.calibrations[0]!.id).toBe(first.pages[1]!.calibrations[0]!.id);
  });

  it("serializes only V2 and round trips calibrations and measurement references", () => {
    const session = currentMeasuredSession();
    const serialized = serializeSession(session);

    expect(JSON.parse(serialized).schemaVersion).toBe(2);
    expect(deserializeSession(serialized)).toEqual(session);
  });

  it("rejects corrupt V2 calibration references and duplicate calibration IDs", () => {
    const base = currentMeasuredSession();

    const missingMeasurementCalibration = structuredClone(base);
    missingMeasurementCalibration.pages[2]!.measurements[0]!.calibrationId = "missing";
    expect(() => deserializeSession(JSON.stringify(missingMeasurementCalibration))).toThrow(
      "missing calibration",
    );

    const missingActiveCalibration = structuredClone(base);
    missingActiveCalibration.pages[2]!.activeCalibrationId = "missing";
    expect(() => deserializeSession(JSON.stringify(missingActiveCalibration))).toThrow(
      "active calibration",
    );

    const duplicateCalibration = structuredClone(base);
    duplicateCalibration.pages[2]!.calibrations.push({
      ...duplicateCalibration.pages[2]!.calibrations[0]!,
      name: "Duplicate",
    });
    expect(() => deserializeSession(JSON.stringify(duplicateCalibration))).toThrow(
      "duplicate calibration IDs",
    );

    const blankCalibrationId = structuredClone(base);
    blankCalibrationId.pages[2]!.calibrations[0]!.id = " ";
    expect(() => deserializeSession(JSON.stringify(blankCalibrationId))).toThrow("invalid");
  });

  it("rejects blank or untrimmed calibration names", () => {
    const blankName = currentMeasuredSession();
    blankName.pages[2]!.calibrations[0]!.name = " ";
    expect(() => deserializeSession(JSON.stringify(blankName))).toThrow("invalid");

    const untrimmedName = currentMeasuredSession();
    untrimmedName.pages[2]!.calibrations[0]!.name = " Detail A ";
    expect(() => deserializeSession(JSON.stringify(untrimmedName))).toThrow("invalid");
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

  it("rejects blank persisted measurement names", () => {
    const session = currentMeasuredSession();
    session.pages[2]!.measurements[0]!.name = " ";
    expect(() => deserializeSession(serializeSession(session))).toThrow("invalid");
  });
});
