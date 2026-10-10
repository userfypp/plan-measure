import { describe, expect, it } from "vitest";
import { read, utils } from "xlsx";
import { createEmptySession, sessionReducer } from "../app/sessionState";
import { canDuplicateMeasurement } from "../app/measurementClipboard";
import type { CountMeasurement, CurrentSession } from "../types/domain";
import { createMeasurementTotals } from "../features/measurements/measurementTotals";
import { createMeasurementViewModel } from "../features/measurements/measurementViewModels";
import { keyboardHitMeasurement } from "../features/viewer/keyboardGeometry";
import { hasValidMeasurementPoints } from "../utils/geometry";
import {
  buildCsv,
  buildCsvInBatches,
  buildMeasurementTable,
  createCsvExportSettingsPreset,
} from "./csv";
import { buildDataJson } from "./dataJson";
import { deserializeSession, serializeSession } from "./persistenceCodec";
import { createProjectFile, readProjectFile } from "./projectFile";
import { buildSpreadsheet } from "./spreadsheetExport";
import { buildTakeoffTables } from "./takeoffExport";

const marker: CountMeasurement = {
  id: "socket",
  name: "Socket",
  type: "count",
  calibrationId: null,
  points: [
    { x: 20, y: 30 },
    { x: 60, y: 70 },
    { x: 100, y: 110 },
  ],
  visible: false,
  note: "Check on site",
  classificationValueIds: ["electrical"],
};
const selection = { breakdowns: ["page", "type"] as const, classificationDimensionIds: ["trade"] };

function countedSession(): CurrentSession {
  const session = createEmptySession({ name: "Count.pdf", size: 8, lastModified: 1 }, 2);
  session.classificationCatalog.dimensions = [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [{ id: "electrical", name: "Electrical", archived: true }],
    },
  ];
  session.pages[1]!.measurements = [structuredClone(marker)];
  session.pages[1]!.nextMeasurementNumber.count = 2;
  session.pages[2]!.measurements = [
    { ...structuredClone(marker), id: "light", name: "Light", visible: true },
  ];
  return session;
}

describe("native item counts", () => {
  it("creates counts without calibration and preserves the scale requirement for paths", () => {
    const initial = {
      session: createEmptySession({ name: "Count.pdf", size: 8, lastModified: 1 }, 1),
      error: null,
    };
    const action = {
      type: "ADD_MEASUREMENT" as const,
      pageNumber: 1,
      id: "count",
      measurementType: "count" as const,
      points: [{ x: 0, y: 0 }],
    };
    const added = sessionReducer(initial, action);
    expect(added.error).toBeNull();
    expect(added.session!.pages[1]!.measurements[0]).toMatchObject({
      type: "count",
      calibrationId: null,
      name: "Count 1",
      points: action.points,
    });
    expect(added.session!.pages[1]!.nextMeasurementNumber.count).toBe(2);
    for (const points of [[], [{ x: NaN, y: 0 }]]) {
      expect(sessionReducer(initial, { ...action, points }).session).toBe(initial.session);
    }
    const path = sessionReducer(initial, {
      ...action,
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(path.session).toBe(initial.session);
    expect(path.error).toContain("scale");
  });

  it("edits, duplicates and pastes counts across unscaled pages", () => {
    const session = countedSession();
    expect(canDuplicateMeasurement(session.pages[1]!, marker)).toBe(true);
    const pasted = sessionReducer(
      { session, error: null },
      {
        type: "PASTE_MEASUREMENT",
        pageNumber: 2,
        sourcePageNumber: 1,
        id: "copy",
        measurement: marker,
      },
    );
    expect(pasted.error).toBeNull();
    expect(pasted.session!.pages[2]!.measurements[1]).toMatchObject({
      ...marker,
      id: "copy",
      visible: true,
    });
    const moved = sessionReducer(pasted, {
      type: "UPDATE_MEASUREMENT",
      pageNumber: 2,
      id: "copy",
      points: [{ x: 100, y: 200 }],
    });
    expect(moved.session!.pages[2]!.measurements[1]!.points).toEqual([{ x: 100, y: 200 }]);
    expect(
      hasValidMeasurementPoints("count", moved.session!.pages[2]!.measurements[1]!.points),
    ).toBe(true);
    const view = createMeasurementViewModel(session.pages[1]!, marker, "ft-in", false, 6);
    expect(view.valueLabel).toBe("3 items");
    expect(view.calibrationSummary).toBe("No scale required");
    expect(keyboardHitMeasurement([{ ...marker, visible: true }], { x: 20, y: 30 }, 2)?.id).toBe(
      marker.id,
    );
    expect(keyboardHitMeasurement([{ ...marker, visible: true }], marker.points[2]!, 2)?.id).toBe(
      marker.id,
    );
  });

  it("round trips counts, notes, archived assignments and numbering in session and project files", async () => {
    const session = countedSession();
    expect(deserializeSession(serializeSession(session))).toEqual(session);
    const project = await readProjectFile(createProjectFile(session, new Blob(["%PDF-1.7"])));
    expect(project.session).toEqual(session);
    expect(await project.pdfBlob.text()).toBe("%PDF-1.7");
  });

  it("moves an item between counts atomically without changing positions, properties or totals", () => {
    const session = countedSession();
    const source = session.pages[1]!.measurements[0]!;
    const target = {
      ...structuredClone(marker),
      id: "target",
      name: "Lights",
      note: "Target note",
      classificationValueIds: [],
      visible: true,
      points: [{ x: 300, y: 400 }],
    };
    session.pages[1]!.measurements.push(target);
    const before = structuredClone(session);
    const result = sessionReducer(
      { session, error: null },
      {
        type: "MOVE_COUNT_ITEM",
        pageNumber: 1,
        sourceId: source.id,
        targetId: target.id,
        itemIndex: 1,
      },
    );
    expect(result.error).toBeNull();
    expect(session).toEqual(before);
    const moved = result.session!.pages[1]!.measurements;
    expect(moved[0]).toEqual({ ...source, points: [source.points[0], source.points[2]] });
    expect(moved[1]).toEqual({ ...target, points: [...target.points, source.points[1]] });
    expect(result.session!.pages[2]).toBe(session.pages[2]);
    expect(deserializeSession(serializeSession(result.session!))).toEqual(result.session);
    const options = {
      catalog: session.classificationCatalog,
      grouping: "overall" as const,
      classificationDimensionId: null,
      pageLabelOverrides: session.pageLabelOverrides,
      sourcePageLabels: null,
    };
    expect(
      createMeasurementTotals({ ...options, pages: result.session!.pages }).groups[0]!.count,
    ).toEqual(createMeasurementTotals({ ...options, pages: session.pages }).groups[0]!.count);
  });

  it("removes an empty source count when its last item is moved", () => {
    const session = countedSession();
    const source = session.pages[1]!.measurements[0]!;
    source.points = [source.points[0]!];
    const target = { ...structuredClone(marker), id: "target" };
    session.pages[1]!.measurements.push(target);
    const result = sessionReducer(
      { session, error: null },
      {
        type: "MOVE_COUNT_ITEM",
        pageNumber: 1,
        sourceId: source.id,
        targetId: target.id,
        itemIndex: 0,
      },
    );
    expect(result.error).toBeNull();
    expect(result.session!.pages[1]!.measurements).toEqual([
      { ...target, points: [...target.points, source.points[0]] },
    ]);
    expect(deserializeSession(serializeSession(result.session!))).toEqual(result.session);
  });

  it("rejects unavailable counts, paths and invalid item indices without partial edits", () => {
    const session = countedSession();
    session.pages[1]!.measurements.push({
      id: "line",
      name: "Line",
      type: "line",
      calibrationId: "scale",
      visible: true,
      classificationValueIds: [],
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    session.pages[1]!.measurements.push({ ...structuredClone(marker), id: "target" });
    const command = {
      type: "MOVE_COUNT_ITEM" as const,
      pageNumber: 1,
      sourceId: marker.id,
      targetId: "target",
      itemIndex: 0,
    };
    for (const overrides of [
      { itemIndex: -1 },
      { itemIndex: 3 },
      { itemIndex: 0.5 },
      { itemIndex: NaN },
      { sourceId: "missing" },
      { targetId: "missing" },
      { targetId: "light" },
      { sourceId: "line" },
      { targetId: "line" },
      { targetId: marker.id },
      { pageNumber: 3 },
    ]) {
      const result = sessionReducer({ session, error: null }, { ...command, ...overrides });
      expect(result.error).toContain("another count");
      expect(result.session).toBe(session);
    }
  });

  it("migrates V11 defaults and rejects malformed or calibrated count markers", () => {
    const session = createEmptySession({ name: "Old.pdf", size: 8, lastModified: 1 }, 1);
    const old = JSON.parse(JSON.stringify(session));
    old.schemaVersion = 11;
    delete old.pages[1].nextMeasurementNumber.count;
    expect(deserializeSession(JSON.stringify(old))).toEqual(session);
    for (const invalid of [
      { ...marker, calibrationId: "scale" },
      { ...marker, points: [] },
      { ...marker, points: [{ x: Infinity, y: 0 }] },
    ]) {
      const corrupted = countedSession();
      const raw = JSON.parse(JSON.stringify(corrupted));
      raw.pages[1].measurements = [invalid];
      expect(() => deserializeSession(JSON.stringify(raw))).toThrow();
    }
    const legacyCount = { ...countedSession(), schemaVersion: 11 };
    expect(() => deserializeSession(JSON.stringify(legacyCount))).toThrow();
  });

  it("totals only Count items separately from path records in every grouping, including hidden and archived entries", () => {
    const session = countedSession();
    session.pages[2]!.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    ];
    session.pages[2]!.activeCalibrationId = "scale";
    session.pages[2]!.measurements.push({
      id: "line",
      name: "Wall",
      type: "line",
      calibrationId: "scale",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      visible: true,
      classificationValueIds: ["electrical"],
    });
    const options = {
      pages: session.pages,
      catalog: session.classificationCatalog,
      pageLabelOverrides: {},
      sourcePageLabels: null,
      classificationDimensionId: "trade",
    };
    const overall = createMeasurementTotals({ ...options, grouping: "overall" }).groups[0]!;
    expect(overall).toMatchObject({
      measurementCount: 3,
      excludedCount: 0,
      count: { kind: "value", value: 6 },
      length: { kind: "value", value: 1000 },
      area: { kind: "absent" },
    });
    const byPage = createMeasurementTotals({ ...options, grouping: "page" });
    expect(byPage.groups.map((group) => group.count)).toEqual([
      { kind: "value", value: 3 },
      { kind: "value", value: 3 },
    ]);
    const byType = createMeasurementTotals({ ...options, grouping: "type" });
    expect(byType.groups.find((group) => group.label === "Count")?.count).toEqual({
      kind: "value",
      value: 6,
    });
    expect(byType.groups.find((group) => group.label === "Line")?.count).toEqual({
      kind: "absent",
    });
    const classified = createMeasurementTotals({ ...options, grouping: "classification" })
      .groups[0]!;
    expect(classified).toMatchObject({ archived: true, count: { kind: "value", value: 6 } });
  });

  it("exports numeric counts and blank physical quantities and scale fields in CSV and Takeoff", async () => {
    const session = countedSession();
    const table = buildMeasurementTable(
      session,
      null,
      createCsvExportSettingsPreset(session, "all"),
    );
    const row = Object.fromEntries(
      table.headers.map((header, index) => [header, table.rows[0]![index]]),
    );
    expect(row).toMatchObject({
      type: "Count",
      count: 3,
      length: null,
      perimeter: null,
      area: null,
      length_mm: null,
      calibration_id: null,
      calibration_scale_x_mm_per_page_unit: null,
      unit: "",
      area_unit: "",
      note: "Check on site",
      "classification:Trade": "Electrical",
    });
    expect(await buildCsvInBatches(session)).toBe(buildCsv(session));
    const totals = buildTakeoffTables(session, selection);
    expect(totals.excludedCount).toBe(0);
    expect(totals.project.rows[0]![totals.project.headers.indexOf("count")]).toBe(6);
    expect(totals.project.rows[0]![totals.project.headers.indexOf("count_status")]).toBe("value");
  });

  it.each(["xlsx", "ods"] as const)("stores counts as numeric cells in %s", async (format) => {
    const session = countedSession();
    const bytes = await buildSpreadsheet(format, session);
    const sheet = read(bytes, { type: "array" }).Sheets.Measurements!;
    const rows = utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
    const index = rows[0]!.indexOf("count");
    expect(rows[1]![index]).toBe(3);
    expect(sheet[utils.encode_cell({ r: 1, c: index })]!.t).toBe("n");
  });

  it("exports JSON schema 3 with scale-free counts and optional Takeoff", () => {
    const session = countedSession();
    const data = JSON.parse(buildDataJson(session, null, selection));
    expect(data.schemaVersion).toBe(3);
    expect(data.pages[0].measurements[0]).toMatchObject({
      ...marker,
      count: 3,
      lengthMm: null,
      perimeterMm: null,
      areaMm2: null,
    });
    expect(data.takeoff.projectTotals.count).toEqual({ kind: "value", value: 6 });
    expect(JSON.parse(buildDataJson(session)).schemaVersion).toBe(3);
  });
});
