import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueAutosave, isSessionPersistable } from "../app/autosave";
import { createEmptySession, initialSessionState, sessionReducer } from "../app/sessionState";
import type {
  CurrentSession,
  Point,
  SessionV1,
  SessionV2,
  SessionV3,
  SessionV4,
  SessionV5,
  SessionV6,
  SessionV7,
} from "../types/domain";
import { lineLengthMm, polygonResultsMm } from "../utils/geometry";
import {
  discardSavedSession,
  loadSavedSession,
  PersistenceConflictError,
  PersistenceLoadError,
  replaceSavedSession,
  resetPersistenceForTests,
  saveSessionMetadata,
} from "./persistence";
import {
  deserializeSession,
  deserializeSessionForRecovery,
  serializeSession,
} from "./persistenceCodec";

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

function currentMeasuredSession(): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 2);
  session.settings.displayUnit = "cm";
  session.settings.showLabels = false;
  session.pages[2]!.calibrations.push({
    id: "custom-scale",
    name: "Detail A",
    mode: "uniform",
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
    classificationValueIds: [],
    visible: true,
  });
  return session;
}

function legacySettings(session: CurrentSession): SessionV1["settings"] {
  return {
    displayUnit: session.settings.displayUnit,
    showLabels: session.settings.showLabels,
    showMeasurements: session.settings.showMeasurements,
    showCalibration: session.settings.showCalibration,
  };
}

function v5MeasuredSession(): SessionV5 {
  const current = currentMeasuredSession();
  const classificationCatalog: SessionV5["classificationCatalog"] = {
    dimensions: [
      {
        id: "discipline",
        name: "Discipline",
        values: [{ id: "electrical", name: "Electrical", archived: false }],
      },
    ],
  };
  current.pages[2]!.measurements[0]!.classificationValueIds = ["electrical"];
  const pages: SessionV5["pages"] = {};
  for (let pageNumber = 1; pageNumber <= current.pageCount; pageNumber += 1) {
    const page = current.pages[pageNumber]!;
    pages[pageNumber] = {
      ...page,
      measurements: page.measurements.map((measurement) => {
        const legacyMeasurement = { ...measurement };
        delete (legacyMeasurement as { visible?: boolean }).visible;
        return legacyMeasurement;
      }),
    };
  }
  return {
    schemaVersion: 5,
    pdf: { ...current.pdf },
    pageCount: current.pageCount,
    currentPage: current.currentPage,
    pages,
    settings: legacySettings(current),
    classificationCatalog: structuredClone(classificationCatalog),
  };
}

function v6MeasuredSession(): SessionV6 {
  const current = currentMeasuredSession();
  current.pages[2]!.measurements[0]!.classificationValueIds = ["electrical"];
  current.pages[2]!.measurements[0]!.visible = false;
  return {
    ...current,
    schemaVersion: 6,
    settings: legacySettings(current),
    classificationCatalog: {
      dimensions: [
        {
          id: "discipline",
          name: "Discipline",
          values: [{ id: "electrical", name: "Electrical", archived: true }],
        },
      ],
    },
  };
}

function v7MeasuredSession(): SessionV7 {
  const current = currentMeasuredSession();
  return {
    ...current,
    schemaVersion: 7,
    settings: legacySettings(current),
  };
}

function archivedCurrentSession(): CurrentSession {
  const session = currentMeasuredSession();
  session.classificationCatalog = {
    dimensions: [
      {
        id: "discipline",
        name: "Discipline",
        archived: true,
        values: [
          { id: "electrical", name: "Electrical", archived: false },
          { id: "legacy", name: "Legacy", archived: true },
        ],
      },
    ],
  };
  session.pages[2]!.measurements[0]!.classificationValueIds = ["legacy"];
  return session;
}

function withMockDefaultLocale<T>(locale: string, run: () => T): T {
  const original = String.prototype.toLocaleLowerCase;
  const mocked = vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (
    this: string,
    locales?: Intl.LocalesArgument,
  ) {
    return original.call(this, locales ?? locale);
  });
  try {
    return run();
  } finally {
    mocked.mockRestore();
  }
}

function v2MeasuredSession(): SessionV2 {
  return {
    schemaVersion: 2,
    pdf: { name: "v2-plan.pdf", size: 4, lastModified: 2 },
    pageCount: 1,
    currentPage: 1,
    pages: {
      1: {
        pageNumber: 1,
        calibrations: [
          {
            id: "v2-scale",
            name: "V2 scale",
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
            referenceDistanceMm: 1000,
          },
        ],
        activeCalibrationId: "v2-scale",
        nextCalibrationNumber: 2,
        measurements: [
          {
            id: "v2-line",
            type: "line",
            name: "V2 line",
            calibrationId: "v2-scale",
            points: [
              { x: 0, y: 0 },
              { x: 3, y: 4 },
            ],
          },
        ],
        nextLineNumber: 2,
        nextPolygonNumber: 1,
      },
    },
    settings: { displayUnit: "m", showLabels: true, showMeasurements: true, showCalibration: true },
  };
}

function v3MeasuredSession(): SessionV3 {
  return {
    schemaVersion: 3,
    pdf: { name: "v3-plan.pdf", size: 5, lastModified: 3 },
    pageCount: 1,
    currentPage: 1,
    pages: {
      1: {
        pageNumber: 1,
        calibrations: [
          {
            id: "v3-scale",
            name: "V3 scale",
            mode: "uniform",
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
            referenceDistanceMm: 1000,
          },
        ],
        activeCalibrationId: "v3-scale",
        nextCalibrationNumber: 2,
        measurements: [
          {
            id: "v3-line",
            type: "line",
            name: "V3 line",
            calibrationId: "v3-scale",
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ],
        nextLineNumber: 2,
        nextPolygonNumber: 1,
      },
    },
    settings: { displayUnit: "m", showLabels: true, showMeasurements: true, showCalibration: true },
  };
}

function v4MeasuredSession(): SessionV4 {
  return {
    schemaVersion: 4,
    pdf: { name: "v4-plan.pdf", size: 6, lastModified: 4 },
    pageCount: 1,
    currentPage: 1,
    pages: {
      1: {
        pageNumber: 1,
        calibrations: [
          {
            id: "v4-scale",
            name: "V4 scale",
            mode: "uniform",
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
            referenceDistanceMm: 1000,
          },
        ],
        activeCalibrationId: "v4-scale",
        nextCalibrationNumber: 2,
        measurements: [
          {
            id: "v4-line",
            type: "line",
            name: "V4 line",
            calibrationId: "v4-scale",
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ],
        nextMeasurementNumber: { line: 2, polyline: 1, polygon: 1 },
      },
    },
    settings: { displayUnit: "m", showLabels: true, showMeasurements: true, showCalibration: true },
  };
}

function openPersistenceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("plan-measure", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("sessions", { keyPath: "key" });
      request.result.createObjectStore("pdfs", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function writeLegacyActiveSession(session: CurrentSession, pdfBlob: Blob): Promise<void> {
  const database = await openPersistenceDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  transaction.objectStore("sessions").put({
    key: "active",
    serialized: serializeSession(session),
    savedAt: Date.now(),
  });
  transaction.objectStore("pdfs").put({ key: "active", blob: pdfBlob });
  await completeTransaction(transaction);
  database.close();
}

async function writeRawActiveSession(
  session: SessionV1 | SessionV2 | SessionV3 | SessionV4 | CurrentSession,
  pdfBlob: Blob,
): Promise<string> {
  const revision = `historical-v${session.schemaVersion}`;
  const database = await openPersistenceDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  transaction.objectStore("sessions").put({
    key: "active-v2",
    serialized: JSON.stringify(session),
    savedAt: Date.now(),
    revision,
  });
  transaction.objectStore("pdfs").put({ key: "active-v2", blob: pdfBlob, revision });
  transaction
    .objectStore("sessions")
    .put({ key: "persistence-v2", activeRevision: revision });
  await completeTransaction(transaction);
  database.close();
  return revision;
}

async function deleteProtectedPdf(): Promise<void> {
  const database = await openPersistenceDatabase();
  const transaction = database.transaction("pdfs", "readwrite");
  transaction.objectStore("pdfs").delete("active-v2");
  await completeTransaction(transaction);
  database.close();
}

describe("session persistence", () => {
  const incompatibleHistoricalSessions = [
    {
      version: 1,
      create() {
        const session = legacySession(true);
        session.pages[1]!.measurements[0]!.points = [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ];
        return session;
      },
      incompatibleId: "legacy-line",
      validId: "legacy-polygon",
      calibrationId: "legacy-page-1-scale-1",
    },
    {
      version: 2,
      create() {
        const session = v2MeasuredSession();
        session.pages[1]!.measurements[0]!.points = [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ];
        session.pages[1]!.measurements.push({
          id: "valid-v2-line",
          type: "line",
          name: "Valid V2 line",
          calibrationId: "v2-scale",
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        });
        return session;
      },
      incompatibleId: "v2-line",
      validId: "valid-v2-line",
      calibrationId: "v2-scale",
    },
    {
      version: 3,
      create() {
        const session = v3MeasuredSession();
        session.pages[1]!.measurements[0]!.points = [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ];
        session.pages[1]!.measurements.push({
          id: "valid-v3-line",
          type: "line",
          name: "Valid V3 line",
          calibrationId: "v3-scale",
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        });
        return session;
      },
      incompatibleId: "v3-line",
      validId: "valid-v3-line",
      calibrationId: "v3-scale",
    },
  ] as const;

  it.each(incompatibleHistoricalSessions)(
    "recovers and persists repaired incompatible V$version geometry without data loss",
    async ({ create, incompatibleId, validId, calibrationId }) => {
      const historical = create();
      const historicalPage = historical.pages[1]!;
      const expectedCalibration =
        historical.schemaVersion === 1
          ? {
              id: calibrationId,
              name: "Scale 1",
              mode: "uniform" as const,
              ...historical.pages[1]!.calibration!,
            }
          : historical.schemaVersion === 2
            ? { ...historical.pages[1]!.calibrations[0]!, mode: "uniform" as const }
            : structuredClone(historical.pages[1]!.calibrations[0]!);
      const originalIncompatible = structuredClone(
        historicalPage.measurements.find((measurement) => measurement.id === incompatibleId)!,
      );
      const originalValid = structuredClone(
        historicalPage.measurements.find((measurement) => measurement.id === validId)!,
      );
      const pdfBlob = new Blob([`pdf-v${historical.schemaVersion}`]);
      const originalRevision = await writeRawActiveSession(historical, pdfBlob);

      const recovered = await loadSavedSession();
      if (!recovered) throw new Error("Expected the historical session to be recovered.");
      const recoveredPage = recovered.session.pages[1]!;
      const incompatible = recoveredPage.measurements.find(
        (measurement) => measurement.id === incompatibleId,
      )!;
      const valid = recoveredPage.measurements.find((measurement) => measurement.id === validId)!;

      expect(recovered.compatibility).toBe("historical-repair-required");
      expect(recovered.incompatibleMeasurementIds).toEqual([incompatibleId]);
      expect(recovered.revision).toBe(originalRevision);
      expect(incompatible).toMatchObject({
        id: originalIncompatible.id,
        type: originalIncompatible.type,
        name: originalIncompatible.name,
        points: originalIncompatible.points,
        calibrationId,
        classificationValueIds: [],
        visible: true,
      });
      expect(valid).toMatchObject({
        id: originalValid.id,
        type: originalValid.type,
        name: originalValid.name,
        points: originalValid.points,
        calibrationId,
        classificationValueIds: [],
        visible: true,
      });
      expect(recoveredPage.calibrations[0]).toEqual(expectedCalibration);
      expect(recovered.session.classificationCatalog).toEqual({ dimensions: [] });
      expect(await recovered.pdfBlob.text()).toBe(`pdf-v${historical.schemaVersion}`);
      expect(isSessionPersistable(recovered.session)).toBe(false);
      expect(() => serializeSession(recovered.session)).toThrow("invalid");
      expect(() => deserializeSession(JSON.stringify(historical))).toThrow("require repair");

      let state = sessionReducer(initialSessionState, {
        type: "LOAD_SESSION",
        session: recovered.session,
      });
      state = sessionReducer(state, {
        type: "UPDATE_MEASUREMENT",
        pageNumber: 1,
        id: incompatibleId,
        points: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      });
      if (!state.session) throw new Error("Expected the repaired session to remain loaded.");
      expect(state.session.pages[1]!.measurements.map((measurement) => measurement.id)).toEqual(
        recoveredPage.measurements.map((measurement) => measurement.id),
      );
      expect(isSessionPersistable(state.session)).toBe(true);

      let savedRevision = recovered.revision;
      await enqueueAutosave(Promise.resolve(), state.session, 1, () => true, async (snapshot) => {
        savedRevision = await saveSessionMetadata(snapshot, savedRevision);
      });
      const restored = await loadSavedSession();
      expect(savedRevision).not.toBe(originalRevision);
      expect(restored?.compatibility).toBe("current");
      expect(restored?.session).toEqual(state.session);
      expect(await restored?.pdfBlob.text()).toBe(`pdf-v${historical.schemaVersion}`);
    },
  );

  it("preserves historically producible consecutive Polygon points for repair", () => {
    const historical = v3MeasuredSession();
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    historical.pages[1]!.measurements[0] = {
      id: "historical-polygon",
      type: "polygon",
      name: "Historical polygon",
      calibrationId: "v3-scale",
      points,
    };

    const decoded = deserializeSessionForRecovery(JSON.stringify(historical));

    expect(decoded.compatibility).toBe("historical-repair-required");
    expect(decoded.incompatibleMeasurementIds).toEqual(["historical-polygon"]);
    expect(decoded.session.pages[1]!.measurements[0]).toMatchObject({
      id: "historical-polygon",
      name: "Historical polygon",
      calibrationId: "v3-scale",
      points,
    });
    expect(isSessionPersistable(decoded.session)).toBe(false);
  });

  it("preserves a historical self-intersecting Polygon until it is repaired", () => {
    const historical = v3MeasuredSession();
    const points = [
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ];
    historical.pages[1]!.measurements[0] = {
      id: "historical-crossing-polygon",
      type: "polygon",
      name: "Historical crossing polygon",
      calibrationId: "v3-scale",
      points,
    };

    const decoded = deserializeSessionForRecovery(JSON.stringify(historical));

    expect(decoded.compatibility).toBe("historical-repair-required");
    expect(decoded.incompatibleMeasurementIds).toEqual(["historical-crossing-polygon"]);
    expect(decoded.session.pages[1]!.measurements[0]!.points).toEqual(points);
    expect(isSessionPersistable(decoded.session)).toBe(false);
    expect(() => serializeSession(decoded.session)).toThrow("invalid");

    const repaired = sessionReducer(
      { session: decoded.session, error: null },
      {
        type: "UPDATE_MEASUREMENT",
        pageNumber: 1,
        id: "historical-crossing-polygon",
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 },
        ],
      },
    );

    expect(repaired.session?.pages[1]!.measurements[0]!.id).toBe(
      "historical-crossing-polygon",
    );
    expect(isSessionPersistable(repaired.session!)).toBe(true);
    expect(() => serializeSession(repaired.session!)).not.toThrow();
  });

  it.each([
    [1, () => legacySession(true)],
    [2, v2MeasuredSession],
    [3, v3MeasuredSession],
  ] as const)("classifies valid V%d sessions as current and saveable", (_version, create) => {
    const decoded = deserializeSessionForRecovery(JSON.stringify(create()));

    expect(decoded.compatibility).toBe("current");
    expect(decoded.incompatibleMeasurementIds).toEqual([]);
    expect(() => serializeSession(decoded.session)).not.toThrow();
  });

  it("does not treat invalid current geometry as historical compatibility data", async () => {
    const invalidV4 = v4MeasuredSession();
    invalidV4.pages[1]!.measurements[0]!.points = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    await writeRawActiveSession(invalidV4, new Blob(["pdf-v4"]));

    await expect(loadSavedSession()).rejects.toBeInstanceOf(PersistenceLoadError);

    const invalidV8 = currentMeasuredSession();
    invalidV8.pages[2]!.measurements[0]!.points = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(() => serializeSession(invalidV8)).toThrow("invalid");
    expect(() => deserializeSessionForRecovery(JSON.stringify(invalidV8))).toThrow("invalid");

    const malformedPolygonV8 = currentMeasuredSession();
    malformedPolygonV8.pages[2]!.measurements[0] = {
      ...malformedPolygonV8.pages[2]!.measurements[0]!,
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    };
    expect(() => deserializeSessionForRecovery(JSON.stringify(malformedPolygonV8))).toThrow(
      "invalid",
    );
  });

  it("recovers a previously saved V8 self-intersecting Polygon for repair", async () => {
    const crossingV8 = currentMeasuredSession();
    const points = [
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ];
    crossingV8.pages[2]!.measurements[0] = {
      ...crossingV8.pages[2]!.measurements[0]!,
      type: "polygon",
      points,
    };

    const originalRevision = await writeRawActiveSession(crossingV8, new Blob(["pdf-v8"]));
    const decoded = await loadSavedSession();
    if (!decoded) throw new Error("Expected the V8 session to be recovered.");

    expect(() => serializeSession(crossingV8)).toThrow("invalid");
    expect(() => deserializeSession(JSON.stringify(crossingV8))).toThrow("require repair");
    expect(decoded.compatibility).toBe("historical-repair-required");
    expect(decoded.incompatibleMeasurementIds).toEqual(["custom"]);
    expect(decoded.revision).toBe(originalRevision);
    expect(decoded.session.pages[2]!.measurements[0]!.points).toEqual(points);
    expect(await decoded.pdfBlob.text()).toBe("pdf-v8");
  });

  it("migrates V7 to V8 with empty CSV overrides without changing other data", () => {
    const v7 = v7MeasuredSession();
    const migrated = deserializeSession(JSON.stringify(v7));

    expect(migrated).toEqual({
      ...v7,
      schemaVersion: 8,
      settings: {
        ...v7.settings,
        csvExport: { columnOverrides: {} },
      },
    });
  });

  it("migrates a V1 page without calibration to an empty V8 page", () => {
    const migrated = deserializeSession(JSON.stringify(legacySession(false)));
    const page = migrated.pages[1]!;

    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.classificationCatalog).toEqual({ dimensions: [] });
    expect(migrated.settings.csvExport).toEqual({ columnOverrides: {} });
    expect(page.calibrations).toEqual([]);
    expect(page.activeCalibrationId).toBeNull();
    expect(page.nextCalibrationNumber).toBe(1);
    expect(page.measurements).toEqual([]);
    expect(page.nextMeasurementNumber).toEqual({ line: 1, polyline: 1, polygon: 1 });
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
      mode: "uniform",
      ...legacyCalibration,
    });
    expect(page.activeCalibrationId).toBe(calibration.id);
    expect(page.nextCalibrationNumber).toBe(2);
    expect(page.nextMeasurementNumber).toEqual({
      line: legacyPage.nextLineNumber,
      polyline: 1,
      polygon: legacyPage.nextPolygonNumber,
    });
    expect(migrated.pdf).toEqual(legacy.pdf);
    expect(migrated.currentPage).toBe(legacy.currentPage);
    expect(migrated.settings).toEqual({
      ...legacy.settings,
      csvExport: { columnOverrides: {} },
    });
    expect(page.measurements.map((measurement) => measurement.calibrationId)).toEqual([
      calibration.id,
      calibration.id,
    ]);
    expect(page.measurements.map((measurement) => measurement.id)).toEqual([
      "legacy-line",
      "legacy-polygon",
    ]);
    expect(page.measurements.map((measurement) => measurement.visible)).toEqual([true, true]);
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

  it("migrates V2 calibrations through V3 to V4 without changing IDs or results", () => {
    const v2 = v2MeasuredSession();
    const before = lineLengthMm(
      v2.pages[1]!.measurements[0]!.points,
      v2.pages[1]!.calibrations[0]!,
    );
    const migrated = deserializeSession(JSON.stringify(v2));
    const page = migrated.pages[1]!;
    expect(migrated.schemaVersion).toBe(8);
    expect(page.calibrations[0]).toMatchObject({
      id: "v2-scale",
      name: "V2 scale",
      mode: "uniform",
    });
    expect(page.activeCalibrationId).toBe("v2-scale");
    expect(page.measurements[0]!.calibrationId).toBe("v2-scale");
    expect(page.measurements[0]!.visible).toBe(true);
    expect(lineLengthMm(page.measurements[0]!.points, page.calibrations[0]!)).toBe(before);
  });

  it("migrates V3 counters and measurements to V4 without changing geometry", () => {
    const v3 = v3MeasuredSession();
    const migrated = deserializeSession(JSON.stringify(v3));

    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.pages[1]!.measurements).toEqual(
      v3.pages[1]!.measurements.map((measurement) => ({
        ...measurement,
        classificationValueIds: [],
        visible: true,
      })),
    );
    expect(migrated.pages[1]!.nextMeasurementNumber).toEqual({
      line: 2,
      polyline: 1,
      polygon: 1,
    });
  });

  it("migrates V4 measurements to V8 with visibility enabled", () => {
    const v4 = v4MeasuredSession();
    const migrated = deserializeSession(JSON.stringify(v4));

    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.pages[1]!.measurements).toEqual([
      {
        ...v4.pages[1]!.measurements[0],
        classificationValueIds: [],
        visible: true,
      },
    ]);
  });

  it("serializes V8 and round trips settings with uniform/X/Y calibrations", () => {
    const session = currentMeasuredSession();
    session.pages[1]!.calibrations.push({
      id: "xy-scale",
      name: "Scanned detail",
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 1 }, referenceDistanceMm: 100 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 1, y: 10 }, referenceDistanceMm: 200 },
    });
    session.pages[1]!.activeCalibrationId = "xy-scale";
    session.pages[1]!.measurements.push({
      id: "polyline-v4",
      type: "polyline",
      name: "V4 service run",
      calibrationId: "xy-scale",
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ],
      classificationValueIds: [],
      visible: false,
    });
    session.settings.csvExport.columnOverrides = {
      name: false,
      calibration_reference_mm: true,
      "future-column": false,
    };
    const serialized = serializeSession(session);
    expect(JSON.parse(serialized).schemaVersion).toBe(8);
    expect(deserializeSession(serialized)).toEqual(session);
  });

  it("migrates V5 measurements to visible by default without changing their data", () => {
    const v5 = v5MeasuredSession();
    const migrated = deserializeSession(JSON.stringify(v5));

    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.pages[2]!.measurements[0]).toMatchObject({
      id: "custom",
      name: "Custom name",
      calibrationId: "custom-scale",
      points: v5.pages[2]!.measurements[0]!.points,
      classificationValueIds: ["electrical"],
      visible: true,
    });
    expect(migrated.pages[2]!.calibrations).toEqual(v5.pages[2]!.calibrations);
    expect(migrated.classificationCatalog).toEqual({
      dimensions: v5.classificationCatalog.dimensions.map((dimension) => ({
        ...dimension,
        archived: false,
      })),
    });
  });

  it("migrates a real V6 catalog to V8 without losing historical state", () => {
    const v6 = v6MeasuredSession();
    const migrated = deserializeSession(JSON.stringify(v6));
    const migratedDimension = migrated.classificationCatalog.dimensions[0]!;
    const migratedMeasurement = migrated.pages[2]!.measurements[0]!;

    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.pdf).toEqual(v6.pdf);
    expect(migrated.settings).toEqual({
      ...v6.settings,
      csvExport: { columnOverrides: {} },
    });
    expect(migratedDimension).toEqual({
      id: "discipline",
      name: "Discipline",
      archived: false,
      values: [{ id: "electrical", name: "Electrical", archived: true }],
    });
    expect(migratedMeasurement.classificationValueIds).toEqual(["electrical"]);
    expect(migratedMeasurement.visible).toBe(false);
    expect(migratedMeasurement.points).toEqual(v6.pages[2]!.measurements[0]!.points);
    expect(migratedMeasurement.calibrationId).toBe("custom-scale");
  });

  it("round trips an archived V8 dimension, value flags, and assignments", () => {
    const session = archivedCurrentSession();
    const restored = deserializeSession(serializeSession(session));

    expect(restored.schemaVersion).toBe(8);
    expect(restored.classificationCatalog).toEqual(session.classificationCatalog);
    expect(restored.pages[2]!.measurements[0]!.classificationValueIds).toEqual(["legacy"]);
  });

  it("round trips unknown CSV column overrides without rejecting the session", () => {
    const session = currentMeasuredSession();
    session.settings.csvExport.columnOverrides = {
      "classification:removed-dimension:value": false,
      "future-column": true,
    };

    const restored = deserializeSession(serializeSession(session));

    expect(restored.settings.csvExport).toEqual(session.settings.csvExport);
  });

  it("requires valid V8 CSV export settings", () => {
    const base = JSON.parse(serializeSession(currentMeasuredSession())) as Record<string, unknown>;
    const settings = base.settings as Record<string, unknown>;
    const invalidCases = [
      { ...base, settings: { ...settings, csvExport: null } },
      { ...base, settings: { ...settings, csvExport: { columnOverrides: null } } },
      {
        ...base,
        settings: { ...settings, csvExport: { columnOverrides: { name: "yes" } } },
      },
    ];

    for (const invalid of invalidCases) {
      expect(() => deserializeSession(JSON.stringify(invalid))).toThrow("CSV export settings");
    }
  });

  it("requires a boolean archived flag on every V8 dimension", () => {
    const missing = JSON.parse(serializeSession(archivedCurrentSession())) as {
      classificationCatalog: { dimensions: Array<Record<string, unknown>> };
    };
    delete missing.classificationCatalog.dimensions[0]!.archived;
    expect(() =>
      deserializeSession(
        JSON.stringify({
          ...archivedCurrentSession(),
          classificationCatalog: missing.classificationCatalog,
        }),
      ),
    ).toThrow("classification catalog");

    const nonBoolean = JSON.parse(serializeSession(archivedCurrentSession())) as {
      classificationCatalog: { dimensions: Array<Record<string, unknown>> };
    };
    nonBoolean.classificationCatalog.dimensions[0]!.archived = "yes";
    expect(() =>
      deserializeSession(
        JSON.stringify({
          ...archivedCurrentSession(),
          classificationCatalog: nonBoolean.classificationCatalog,
        }),
      ),
    ).toThrow("classification catalog");
  });

  it("keeps the same dotted-I catalog recoverable under en-US and tr-TR", () => {
    const session = currentMeasuredSession();
    session.classificationCatalog = {
      dimensions: [
        { id: "dotted-dimension", name: "İ", archived: true, values: [] },
        {
          id: "latin-dimension",
          name: "i",
          archived: false,
          values: [
            { id: "dotted-value", name: "İ", archived: true },
            { id: "latin-value", name: "i", archived: false },
          ],
        },
      ],
    };
    session.pages[2]!.measurements[0]!.classificationValueIds = ["dotted-value"];
    const serializedByLocale = ["en-US", "tr-TR"].map((locale) =>
      withMockDefaultLocale(locale, () => serializeSession(session)),
    );
    expect(new Set(serializedByLocale).size).toBe(1);

    for (const locale of ["en-US", "tr-TR"]) {
      const decoded = withMockDefaultLocale(locale, () =>
        deserializeSessionForRecovery(serializedByLocale[0]!),
      );

      expect(decoded.compatibility).toBe("current");
      expect(decoded.session).toEqual(session);
      expect(
        decoded.session.classificationCatalog.dimensions.map(({ id, name, archived }) => ({
          id,
          name,
          archived,
        })),
      ).toEqual([
        { id: "dotted-dimension", name: "İ", archived: true },
        { id: "latin-dimension", name: "i", archived: false },
      ]);
      expect(decoded.session.classificationCatalog.dimensions[1]!.values).toEqual([
        { id: "dotted-value", name: "İ", archived: true },
        { id: "latin-value", name: "i", archived: false },
      ]);
      expect(decoded.session.pages[2]!.measurements[0]!.classificationValueIds).toEqual([
        "dotted-value",
      ]);
    }
  });

  it("recovers deterministic classification conflicts without rewriting data and persists repair", async () => {
    const historical = currentMeasuredSession();
    historical.classificationCatalog = {
      dimensions: [
        {
          id: "upper-dimension",
          name: "I",
          archived: false,
          values: [
            { id: "upper-value", name: "I", archived: true },
            { id: "lower-value", name: "i", archived: false },
          ],
        },
        { id: "lower-dimension", name: "i", archived: true, values: [] },
      ],
    };
    historical.pages[2]!.measurements[0]!.classificationValueIds = ["upper-value"];
    expect("I".toLocaleLowerCase("tr-TR")).not.toBe("i".toLocaleLowerCase("tr-TR"));
    expect(() => serializeSession(historical)).toThrow("classification catalog");

    const originalRevision = await writeRawActiveSession(historical, new Blob(["pdf"]));
    const recovered = await loadSavedSession();
    if (!recovered) throw new Error("Expected the classification catalog to be recovered.");

    expect(recovered.compatibility).toBe("classification-repair-required");
    expect(recovered.incompatibleMeasurementIds).toEqual([]);
    expect(recovered.revision).toBe(originalRevision);
    expect(recovered.session).toEqual(historical);
    expect(isSessionPersistable(recovered.session)).toBe(false);
    expect(() => deserializeSession(JSON.stringify(historical))).toThrow(
      "classification names that require repair",
    );

    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: recovered.session,
    });
    state = sessionReducer(state, {
      type: "RENAME_CLASSIFICATION_VALUE",
      dimensionId: "upper-dimension",
      id: "lower-value",
      name: "Lowercase",
    });
    state = sessionReducer(state, {
      type: "RESTORE_CLASSIFICATION_DIMENSION",
      id: "lower-dimension",
    });
    state = sessionReducer(state, {
      type: "RENAME_CLASSIFICATION_DIMENSION",
      id: "lower-dimension",
      name: "Area",
    });
    state = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_DIMENSION",
      id: "lower-dimension",
    });
    if (!state.session) throw new Error("Expected the repaired session to remain loaded.");

    expect(isSessionPersistable(state.session)).toBe(true);
    expect(state.session.classificationCatalog.dimensions).toEqual([
      {
        id: "upper-dimension",
        name: "I",
        archived: false,
        values: [
          { id: "upper-value", name: "I", archived: true },
          { id: "lower-value", name: "Lowercase", archived: false },
        ],
      },
      { id: "lower-dimension", name: "Area", archived: true, values: [] },
    ]);
    expect(state.session.pages[2]!.measurements[0]!.classificationValueIds).toEqual([
      "upper-value",
    ]);

    const savedRevision = await saveSessionMetadata(state.session, recovered.revision);
    const restored = await loadSavedSession();
    expect(savedRevision).not.toBe(originalRevision);
    expect(restored?.compatibility).toBe("current");
    expect(restored?.session).toEqual(state.session);
  });

  it("migrates a V5 locale-dependent conflict into the same repair path", () => {
    const historical = v5MeasuredSession();
    historical.classificationCatalog.dimensions[0]!.name = "I";
    historical.classificationCatalog.dimensions.push({
      id: "area",
      name: "i",
      values: [],
    });

    const recovered = deserializeSessionForRecovery(JSON.stringify(historical));

    expect(recovered.compatibility).toBe("classification-repair-required");
    expect(recovered.session.schemaVersion).toBe(8);
    expect(recovered.session.classificationCatalog.dimensions).toEqual([
      {
        id: "discipline",
        name: "I",
        archived: false,
        values: [{ id: "electrical", name: "Electrical", archived: false }],
      },
      { id: "area", name: "i", archived: false, values: [] },
    ]);
    expect(recovered.session.pages[2]!.measurements[0]!.classificationValueIds).toEqual([
      "electrical",
    ]);
    expect(isSessionPersistable(recovered.session)).toBe(false);
  });

  it("keeps V8 classification reference and uniqueness validation strict", () => {
    const missingValue = archivedCurrentSession();
    missingValue.pages[2]!.measurements[0]!.classificationValueIds = ["missing"];
    expect(() => serializeSession(missingValue)).toThrow("missing classification value");

    const multipleValues = archivedCurrentSession();
    multipleValues.pages[2]!.measurements[0]!.classificationValueIds = ["electrical", "legacy"];
    expect(() => serializeSession(multipleValues)).toThrow("multiple values");

    const duplicateId = archivedCurrentSession();
    duplicateId.classificationCatalog.dimensions.push({
      id: "electrical",
      name: "Other",
      archived: false,
      values: [],
    });
    expect(() => serializeSession(duplicateId)).toThrow("classification catalog");

    const duplicateDimensionName = archivedCurrentSession();
    duplicateDimensionName.classificationCatalog.dimensions.push({
      id: "other-dimension",
      name: "dIsCiPlInE",
      archived: false,
      values: [],
    });
    expect(() => serializeSession(duplicateDimensionName)).toThrow("classification catalog");
    expect(() => deserializeSession(JSON.stringify(duplicateDimensionName))).toThrow(
      "require repair",
    );

    const identicalDimensionName = archivedCurrentSession();
    identicalDimensionName.classificationCatalog.dimensions.push({
      id: "identical-dimension",
      name: "Discipline",
      archived: false,
      values: [],
    });
    expect(() => deserializeSessionForRecovery(JSON.stringify(identicalDimensionName))).toThrow(
      "classification catalog",
    );

    const duplicateValueName = archivedCurrentSession();
    duplicateValueName.classificationCatalog.dimensions[0]!.values.push({
      id: "other-value",
      name: "eLeCtRiCaL",
      archived: false,
    });
    expect(() => serializeSession(duplicateValueName)).toThrow("classification catalog");
    expect(() => deserializeSession(JSON.stringify(duplicateValueName))).toThrow("require repair");

    const duplicateArchivedValueName = archivedCurrentSession();
    duplicateArchivedValueName.classificationCatalog.dimensions[0]!.values.push({
      id: "other-archived-value",
      name: "lEgAcY",
      archived: false,
    });
    expect(() => serializeSession(duplicateArchivedValueName)).toThrow("classification catalog");
  });

  it("rejects missing or non-boolean visibility in V8 sessions", () => {
    const missing = JSON.parse(serializeSession(currentMeasuredSession())) as Record<
      string,
      unknown
    >;
    const missingPage = (
      missing.pages as Record<string, { measurements: Array<Record<string, unknown>> }>
    )["2"];
    delete missingPage!.measurements[0]!.visible;
    expect(() => deserializeSession(JSON.stringify(missing))).toThrow("visibility");

    const nonBoolean = JSON.parse(serializeSession(currentMeasuredSession())) as Record<
      string,
      unknown
    >;
    const nonBooleanPage = (
      nonBoolean.pages as Record<string, { measurements: Array<Record<string, unknown>> }>
    )["2"];
    nonBooleanPage!.measurements[0]!.visible = "yes";
    expect(() => deserializeSession(JSON.stringify(nonBoolean))).toThrow("visibility");
  });

  it("persists classification IDs and rejects references outside the catalog", () => {
    const session = currentMeasuredSession();
    session.classificationCatalog.dimensions.push({
      id: "room",
      name: "Room",
      archived: false,
      values: [{ id: "kitchen", name: "Kitchen", archived: true }],
    });
    session.pages[2]!.measurements[0]!.classificationValueIds = ["kitchen"];

    expect(deserializeSession(serializeSession(session))).toEqual(session);

    const invalid = structuredClone(session);
    invalid.pages[2]!.measurements[0]!.classificationValueIds = ["missing"];
    expect(() => deserializeSession(serializeSession(invalid))).toThrow(
      "missing classification value",
    );
  });

  it("rejects more than one assigned value from the same classification dimension", () => {
    const session = currentMeasuredSession();
    session.classificationCatalog.dimensions.push({
      id: "room",
      name: "Room",
      archived: false,
      values: [
        { id: "kitchen", name: "Kitchen", archived: false },
        { id: "bathroom", name: "Bathroom", archived: false },
      ],
    });
    session.pages[2]!.measurements[0]!.classificationValueIds = ["kitchen", "bathroom"];

    expect(() => serializeSession(session)).toThrow("multiple values");
  });

  it("round trips confirmed edited reference points without changing measurement data", () => {
    const session = currentMeasuredSession();
    const calibration = session.pages[2]!.calibrations[0]!;
    if (calibration.mode !== "uniform") throw new Error("Expected a uniform calibration.");
    session.pages[2]!.calibrations[0] = {
      ...calibration,
      start: { x: 15, y: 16 },
      end: { x: 35, y: 16 },
    };
    const restored = deserializeSession(serializeSession(session));

    expect(restored.schemaVersion).toBe(8);
    expect(restored.pages[2]!.calibrations[0]).toMatchObject({
      id: "custom-scale",
      start: { x: 15, y: 16 },
      end: { x: 35, y: 16 },
    });
    expect(restored.pages[2]!.measurements[0]!.calibrationId).toBe("custom-scale");
  });

  it("rejects corrupt measurement IDs and canonicalizes restored session data", () => {
    const duplicate = currentMeasuredSession();
    duplicate.pages[2]!.measurements.push({ ...duplicate.pages[2]!.measurements[0]! });
    expect(() => deserializeSession(serializeSession(duplicate))).toThrow(
      "duplicate measurement IDs",
    );

    const invalidId = currentMeasuredSession();
    invalidId.pages[2]!.measurements[0]!.id = " measurement-id ";
    expect(() => deserializeSession(serializeSession(invalidId))).toThrow("invalid");

    const raw = JSON.parse(serializeSession(currentMeasuredSession())) as Record<string, unknown>;
    raw.orthogonal = true;
    const restored = deserializeSession(JSON.stringify(raw));
    expect(restored).not.toHaveProperty("orthogonal");
    expect(restored).toEqual(currentMeasuredSession());
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

  it("rejects corrupt V3 X/Y references", () => {
    const base = currentMeasuredSession();
    const page = base.pages[2]!;
    page.calibrations[0] = {
      id: "xy",
      name: "X/Y",
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 1 }, referenceDistanceMm: 100 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 1, y: 10 }, referenceDistanceMm: 200 },
    };
    page.activeCalibrationId = "xy";
    page.measurements[0]!.calibrationId = "xy";
    const corrupt = (mutate: (value: Record<string, unknown>) => void) => {
      const value = JSON.parse(serializeSession(base)) as Record<string, unknown>;
      mutate(value);
      expect(() => deserializeSession(JSON.stringify(value))).toThrow("invalid");
    };
    corrupt((value) => {
      (value.pages as Record<string, { calibrations: Array<{ xReference: { end: Point } }> }>)[
        "2"
      ]!.calibrations[0]!.xReference.end = { x: 0, y: 10 };
    });
    corrupt((value) => {
      (value.pages as Record<string, { calibrations: Array<{ yReference: { end: Point } }> }>)[
        "2"
      ]!.calibrations[0]!.yReference.end = { x: 10, y: 0 };
    });
    corrupt((value) => {
      (
        value.pages as Record<
          string,
          { calibrations: Array<{ xReference: { referenceDistanceMm: number } }> }
        >
      )["2"]!.calibrations[0]!.xReference.referenceDistanceMm = 0;
    });
    corrupt((value) => {
      (
        value.pages as Record<
          string,
          { calibrations: Array<{ yReference: { referenceDistanceMm: number } }> }
        >
      )["2"]!.calibrations[0]!.yReference.referenceDistanceMm = Number.POSITIVE_INFINITY;
    });
  });

  it("round trips PDF blob and metadata through IndexedDB", async () => {
    const session = currentMeasuredSession();
    session.classificationCatalog.dimensions.push({
      id: "room",
      name: "Room",
      archived: false,
      values: [{ id: "kitchen", name: "Kitchen", archived: false }],
    });
    session.pages[2]!.measurements[0]!.classificationValueIds = ["kitchen"];
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    let revision = await replaceSavedSession(session, blob, null);
    session.settings.showMeasurements = false;
    revision = await saveSessionMetadata(session, revision);
    const restored = await loadSavedSession();
    expect(restored?.revision).toBe(revision);
    expect(restored?.session.settings.showMeasurements).toBe(false);
    expect(restored?.session.pages[2]!.measurements[0]!.classificationValueIds).toEqual([
      "kitchen",
    ]);
    expect(restored?.session.classificationCatalog.dimensions[0]!.values[0]!.name).toBe("Kitchen");
    expect(await restored?.pdfBlob.text()).toBe("pdf");
  });

  it("keeps the revision for an unchanged recovery autosave", async () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 1);
    const revision = await replaceSavedSession(session, new Blob(["pdf"]), null);

    expect(await saveSessionMetadata(session, revision)).toBe(revision);
  });

  it("does not save orphaned metadata without its PDF record", async () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 1);
    const revision = await replaceSavedSession(session, new Blob(["pdf"]), null);
    await deleteProtectedPdf();

    await expect(saveSessionMetadata(session, revision)).rejects.toThrow("without its PDF");
    await expect(loadSavedSession()).rejects.toThrow("incomplete");
  });

  it("discards both records", async () => {
    const session = createEmptySession({ name: "plan.pdf", size: 3, lastModified: 1 }, 1);
    const revision = await replaceSavedSession(session, new Blob(["pdf"]), null);
    await discardSavedSession(revision);
    expect(await loadSavedSession()).toBeNull();
  });

  it("rejects a pending stale autosave after another tab replaces the active PDF", async () => {
    const sessionA = createEmptySession({ name: "a.pdf", size: 5, lastModified: 1 }, 1);
    const sessionB = createEmptySession({ name: "b.pdf", size: 5, lastModified: 2 }, 1);
    await replaceSavedSession(sessionA, new Blob(["pdf-a"]), null);
    const tabA = await loadSavedSession();
    const tabB = await loadSavedSession();
    if (!tabA || !tabB) throw new Error("Expected both tabs to recover session A.");

    let releaseAutosave!: () => void;
    const precedingSave = new Promise<void>((resolve) => {
      releaseAutosave = resolve;
    });
    tabA.session.settings.showLabels = false;
    const staleAutosave = enqueueAutosave(
      precedingSave,
      tabA.session,
      1,
      () => true,
      (snapshot) => saveSessionMetadata(snapshot, tabA.revision).then(() => undefined),
    );

    await replaceSavedSession(sessionB, new Blob(["pdf-b"]), tabB.revision);
    releaseAutosave();

    await expect(staleAutosave).rejects.toBeInstanceOf(PersistenceConflictError);
    const restored = await loadSavedSession();
    expect(restored?.session.pdf.name).toBe("b.pdf");
    expect(restored?.session.settings.showLabels).toBe(true);
    expect(await restored?.pdfBlob.text()).toBe("pdf-b");
  });

  it("rejects divergent metadata from the second writer of one logical session", async () => {
    const session = createEmptySession({ name: "shared.pdf", size: 3, lastModified: 1 }, 1);
    await replaceSavedSession(session, new Blob(["shared-pdf"]), null);
    const tabA = await loadSavedSession();
    const tabB = await loadSavedSession();
    if (!tabA || !tabB) throw new Error("Expected both tabs to recover the shared session.");

    tabA.session.settings.showLabels = false;
    tabB.session.settings.showMeasurements = false;
    await saveSessionMetadata(tabB.session, tabB.revision);

    await expect(saveSessionMetadata(tabA.session, tabA.revision)).rejects.toBeInstanceOf(
      PersistenceConflictError,
    );
    const restored = await loadSavedSession();
    expect(restored?.session.settings.showLabels).toBe(true);
    expect(restored?.session.settings.showMeasurements).toBe(false);
    expect(await restored?.pdfBlob.text()).toBe("shared-pdf");
  });

  it("rejects a stale discard after another tab replaces the active session", async () => {
    const sessionA = createEmptySession({ name: "a.pdf", size: 3, lastModified: 1 }, 1);
    const sessionB = createEmptySession({ name: "b.pdf", size: 3, lastModified: 2 }, 1);
    await replaceSavedSession(sessionA, new Blob(["pdf-a"]), null);
    const tabA = await loadSavedSession();
    const tabB = await loadSavedSession();
    if (!tabA || !tabB) throw new Error("Expected both tabs to recover session A.");

    await replaceSavedSession(sessionB, new Blob(["pdf-b"]), tabB.revision);

    await expect(discardSavedSession(tabA.revision)).rejects.toBeInstanceOf(
      PersistenceConflictError,
    );
    const restored = await loadSavedSession();
    expect(restored?.session.pdf.name).toBe("b.pdf");
    expect(await restored?.pdfBlob.text()).toBe("pdf-b");
  });

  it("migrates legacy active records and isolates them from already-open old writers", async () => {
    const legacy = currentMeasuredSession();
    await writeLegacyActiveSession(legacy, new Blob(["legacy-pdf"]));

    const migrated = await loadSavedSession();
    if (!migrated) throw new Error("Expected the legacy session to be recovered.");
    expect(migrated.session).toEqual(legacy);
    expect(await migrated.pdfBlob.text()).toBe("legacy-pdf");

    const staleOldSession = createEmptySession(
      { name: "stale-old-tab.pdf", size: 3, lastModified: 2 },
      legacy.pageCount,
    );
    await writeLegacyActiveSession(staleOldSession, new Blob(["stale-old-pdf"]));
    migrated.session.settings.showLabels = false;
    await saveSessionMetadata(migrated.session, migrated.revision);

    const restored = await loadSavedSession();
    expect(restored?.session.pdf.name).toBe(legacy.pdf.name);
    expect(restored?.session.settings.showLabels).toBe(false);
    expect(await restored?.pdfBlob.text()).toBe("legacy-pdf");
  });

  it("rejects blank persisted measurement names", () => {
    const session = currentMeasuredSession();
    session.pages[2]!.measurements[0]!.name = " ";
    expect(() => deserializeSession(serializeSession(session))).toThrow("invalid");
  });
});
