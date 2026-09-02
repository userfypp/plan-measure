import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptySession } from "../app/sessionState";
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

describe("session persistence", () => {
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

    const duplicateValueName = archivedCurrentSession();
    duplicateValueName.classificationCatalog.dimensions[0]!.values.push({
      id: "other-value",
      name: "eLeCtRiCaL",
      archived: false,
    });
    expect(() => serializeSession(duplicateValueName)).toThrow("classification catalog");
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
    await replaceSavedSession(session, blob);
    session.settings.showMeasurements = false;
    await saveSessionMetadata(session);
    const restored = await loadSavedSession();
    expect(restored?.session.settings.showMeasurements).toBe(false);
    expect(restored?.session.pages[2]!.measurements[0]!.classificationValueIds).toEqual([
      "kitchen",
    ]);
    expect(restored?.session.classificationCatalog.dimensions[0]!.values[0]!.name).toBe("Kitchen");
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
