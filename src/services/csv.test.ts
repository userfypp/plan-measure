import { describe, expect, it, vi } from "vitest";
import { createEmptySession, sessionReducer } from "../app/sessionState";
import { createStandardScalePreset } from "../features/calibration/standardScalePresets";
import { createPageCalibrationFromRatio } from "../features/calibration/ratioCalibration";
import { translateMeasurementPoints } from "../features/viewer/measurementDrag";
import type { CurrentSession, MeasurementDisplayUnit } from "../types/domain";
import {
  buildClassificationAssignmentsCsv,
  buildCsv,
  createCsvExportSettingsPreset,
  downloadClassificationAssignmentsCsv,
  downloadCsv,
  getCsvColumnDescriptors,
  normalizeCsvExportSettings,
  NoMeasurementsError,
} from "./csv";

function measuredSession(): CurrentSession {
  const session = createEmptySession({ name: "sample.pdf", size: 10, lastModified: 1 }, 2);
  session.settings.displayUnit = "m";
  session.pages[1]!.calibrations = [
    {
      id: "scale-1",
      name: "Scale 1",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
    {
      id: "scale-2",
      name: "Detail A",
      mode: "xy",
      xReference: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 1 },
        referenceDistanceMm: 5000,
      },
      yReference: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 10 },
        referenceDistanceMm: 10000,
      },
    },
  ];
  session.pages[1]!.activeCalibrationId = "scale-2";
  session.pages[1]!.nextCalibrationNumber = 3;
  session.pages[1]!.measurements.push({
    id: "line-id",
    type: "line",
    name: 'Lobby, "north"',
    calibrationId: "scale-1",
    points: [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
    ],
    classificationValueIds: [],
    visible: true,
  });
  session.pages[1]!.measurements.push({
    id: "polygon-id",
    type: "polygon",
    name: "Room\nA",
    calibrationId: "scale-2",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    classificationValueIds: [],
    visible: true,
  });
  session.pages[2]!.calibrations = [
    {
      id: "scale-3",
      name: "Section",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 20, y: 0 },
      referenceDistanceMm: 500,
    },
  ];
  session.pages[2]!.activeCalibrationId = "scale-3";
  session.pages[2]!.nextCalibrationNumber = 2;
  session.pages[2]!.measurements.push({
    id: "second-line-id",
    type: "line",
    name: "Second measurement",
    calibrationId: "scale-3",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    classificationValueIds: [],
    visible: true,
  });
  return session;
}

function smallMeasuredSession(displayUnit: MeasurementDisplayUnit): CurrentSession {
  const session = createEmptySession({ name: "small.pdf", size: 10, lastModified: 1 }, 1);
  session.settings.displayUnit = displayUnit;
  session.pages[1]!.calibrations = [
    {
      id: "small-scale",
      name: "Small scale",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      referenceDistanceMm: 1,
    },
  ];
  session.pages[1]!.activeCalibrationId = "small-scale";
  session.pages[1]!.measurements.push(
    {
      id: "small-line-id",
      type: "line",
      name: "Small line",
      calibrationId: "small-scale",
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      classificationValueIds: [],
      visible: true,
    },
    {
      id: "small-polygon-id",
      type: "polygon",
      name: "Small polygon",
      calibrationId: "small-scale",
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
      classificationValueIds: [],
      visible: true,
    },
  );
  return session;
}

function classifiedMeasuredSession(): CurrentSession {
  const session = measuredSession();
  session.classificationCatalog = {
    dimensions: [
      {
        id: "trade",
        name: "Trade",
        archived: false,
        values: [
          { id: "electrical-id", name: "Electrical", archived: false },
          { id: "plumbing-id", name: "Plumbing", archived: false },
        ],
      },
      {
        id: "status",
        name: "Status",
        archived: false,
        values: [{ id: "approved-id", name: "Approved", archived: false }],
      },
    ],
  };
  session.pages[1]!.measurements[0]!.classificationValueIds = ["approved-id", "electrical-id"];
  session.pages[1]!.measurements[1]!.classificationValueIds = ["electrical-id"];
  return session;
}

function headerColumns(csv: string): string[] {
  return csv
    .split("\r\n")[0]!
    .replace(/^\uFEFF/, "")
    .split(",");
}

function allColumns(session: CurrentSession) {
  return createCsvExportSettingsPreset(session, "all");
}

const CLASSIFICATION_ASSIGNMENT_HEADER =
  "pdf_name,page,page_label,measurement_id,measurement_name,measurement_type,measurement_visible,classification_dimension,classification_dimension_id,classification_dimension_status,classification_value,classification_value_id,classification_value_status,classification_status";

const NEW_MEASUREMENT_COLUMN_IDS = [
  "pdf_name",
  "measurement_visible",
  "measurement_point_count",
  "length_mm",
  "perimeter_mm",
  "area_mm2",
  "calibration_ratio_denominator",
  "calibration_ratio_x_denominator",
  "calibration_ratio_y_denominator",
  "calibration_x_reference_mm",
  "calibration_x_page_span",
  "calibration_y_reference_mm",
  "calibration_y_page_span",
] as const;

describe("CSV export", () => {
  it("offers notes as an optional CSV column and exports note text when enabled", () => {
    const session = measuredSession();
    session.pages[1]!.measurements[0]!.note = 'Check, "north" wall';
    const noteColumn = getCsvColumnDescriptors(session).find((column) => column.id === "note");
    expect(noteColumn).toMatchObject({ enabled: false, required: false, header: "note" });

    const csv = buildCsv(session, null, allColumns(session));
    expect(headerColumns(csv)).toContain("note");
    expect(csv).toContain('"Check, ""north"" wall"');
  });

  it("exports Polyline as an open accumulated length", () => {
    const session = measuredSession();
    session.pages[1]!.measurements.push({
      id: "polyline-id",
      type: "polyline",
      name: "Service run",
      calibrationId: "scale-1",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 },
      ],
      classificationValueIds: [],
      visible: true,
    });

    expect(buildCsv(session)).toContain(
      "1,,polyline-id,Service run,Polyline,scale-1,Scale 1,uniform,0.70,,,m,",
    );
  });

  it("exports the cleaner default column profile", () => {
    const csv = buildCsv(measuredSession());
    expect(headerColumns(csv)).toEqual([
      "page",
      "page_label",
      "measurement_id",
      "name",
      "type",
      "calibration_id",
      "calibration_name",
      "calibration_mode",
      "length",
      "perimeter",
      "area",
      "unit",
      "area_unit",
    ]);
    expect(csv).not.toContain("calibration_reference_mm");
    expect(csv).toContain('1,,line-id,"Lobby, ""north""",Line,scale-1,Scale 1,uniform,2.50,,,m,');
    expect(csv).toContain('1,,polygon-id,"Room\nA",Polygon,scale-2,Detail A,xy,,30.00,50.00,m,m²');
  });

  it("keeps the default Measurements CSV byte-for-byte compatible", () => {
    expect(buildCsv(measuredSession())).toBe(
      [
        "\uFEFFpage,page_label,measurement_id,name,type,calibration_id,calibration_name,calibration_mode,length,perimeter,area,unit,area_unit",
        '1,,line-id,"Lobby, ""north""",Line,scale-1,Scale 1,uniform,2.50,,,m,',
        '1,,polygon-id,"Room\nA",Polygon,scale-2,Detail A,xy,,30.00,50.00,m,m²',
        "2,,second-line-id,Second measurement,Line,scale-3,Section,uniform,0.25,,,m,",
        "",
      ].join("\r\n"),
    );
  });

  it("does not export a self-intersecting Polygon area", () => {
    const session = measuredSession();
    session.pages[1]!.measurements[1]!.points = [
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ];

    expect(() => buildCsv(session)).toThrow("Repair invalid Polygon measurements");
  });

  it("exports all columns with the established order and calibration metadata", () => {
    const session = measuredSession();
    const csv = buildCsv(session, null, allColumns(session));
    expect(
      csv.startsWith(
        "\uFEFFpage,page_label,measurement_id,name,type,calibration_id,calibration_name,calibration_mode,calibration_reference_mm,calibration_page_distance,calibration_mm_per_page_unit,calibration_scale_x_mm_per_page_unit,calibration_scale_y_mm_per_page_unit,length,perimeter,area,unit,area_unit,pdf_name,measurement_visible,measurement_point_count,length_mm,perimeter_mm,area_mm2,calibration_ratio_denominator,calibration_ratio_x_denominator,calibration_ratio_y_denominator,calibration_x_reference_mm,calibration_x_page_span,calibration_y_reference_mm,calibration_y_page_span,note\r\n",
      ),
    ).toBe(true);
    expect(csv).toContain(
      '1,,line-id,"Lobby, ""north""",Line,scale-1,Scale 1,uniform,1000,10,100,100,100,2.50,,,m,',
    );
    expect(csv).toContain(
      '1,,polygon-id,"Room\nA",Polygon,scale-2,Detail A,xy,,,,500,1000,,30.00,50.00,m,m²',
    );
    expect(csv).toContain(
      "2,,second-line-id,Second measurement,Line,scale-3,Section,uniform,500,20,25,25,25,0.25,,,m,",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exposes column metadata and effective state from the CSV registry", () => {
    const session = classifiedMeasuredSession();
    const descriptors = getCsvColumnDescriptors(session);
    const staticDescriptors = descriptors.filter(
      (descriptor) => descriptor.section !== "classification",
    );

    expect(staticDescriptors.map((descriptor) => descriptor.id)).toEqual([
      "page",
      "page_label",
      "measurement_id",
      "name",
      "type",
      "calibration_id",
      "calibration_name",
      "calibration_mode",
      "calibration_reference_mm",
      "calibration_page_distance",
      "calibration_mm_per_page_unit",
      "calibration_scale_x_mm_per_page_unit",
      "calibration_scale_y_mm_per_page_unit",
      "length",
      "perimeter",
      "area",
      "unit",
      "area_unit",
      ...NEW_MEASUREMENT_COLUMN_IDS,
      "note",
    ]);
    expect(
      staticDescriptors
        .filter((descriptor) => descriptor.required)
        .map((descriptor) => descriptor.id),
    ).toEqual(["page", "measurement_id", "type", "calibration_id", "unit", "area_unit"]);
    expect(
      staticDescriptors
        .filter((descriptor) => descriptor.enabled)
        .map((descriptor) => descriptor.id),
    ).toEqual([
      "page",
      "page_label",
      "measurement_id",
      "name",
      "type",
      "calibration_id",
      "calibration_name",
      "calibration_mode",
      "length",
      "perimeter",
      "area",
      "unit",
      "area_unit",
    ]);
    expect(
      NEW_MEASUREMENT_COLUMN_IDS.map((id) =>
        staticDescriptors.find((descriptor) => descriptor.id === id),
      ),
    ).toEqual(
      NEW_MEASUREMENT_COLUMN_IDS.map((id) =>
        expect.objectContaining({
          id,
          section: "additional",
          defaultEnabled: false,
          required: false,
          enabled: false,
        }),
      ),
    );
    expect(descriptors.find((descriptor) => descriptor.id === "page")?.label).toBe("Page");
    expect(descriptors.find((descriptor) => descriptor.id === "name")?.label).toBe(
      "Measurement name",
    );
    expect(
      descriptors.find((descriptor) => descriptor.id === "calibration_reference_mm")?.label,
    ).toBe("Reference distance (mm)");

    const classificationDescriptors = descriptors.filter(
      (descriptor) => descriptor.classification?.dimensionId === "trade",
    );
    expect(classificationDescriptors.map((descriptor) => descriptor.label)).toEqual([
      "Value",
      "Value ID",
      "Status",
    ]);
    expect(classificationDescriptors.map((descriptor) => descriptor.enabled)).toEqual([
      true,
      false,
      false,
    ]);
    expect(classificationDescriptors[0]?.classification).toEqual({
      dimensionId: "trade",
      dimensionName: "Trade",
      dimensionArchived: false,
      field: "value",
    });
  });

  it("exports canonical measurement audit values without display rounding", () => {
    const session = smallMeasuredSession("ft");
    session.settings.measurementDecimalPlaces = 0;
    const calibration = session.pages[1]!.calibrations[0]!;
    if (calibration.mode !== "uniform") throw new Error("Expected uniform calibration.");
    calibration.end = { x: 3, y: 0 };
    session.pages[1]!.measurements[0]!.visible = false;

    const csv = buildCsv(session, null, allColumns(session));
    const headers = headerColumns(csv);
    const line = csv.split("\r\n")[1]!.split(",");
    const polygon = csv.split("\r\n")[2]!.split(",");
    const cell = (row: string[], id: string) => row[headers.indexOf(id)];

    expect(cell(line, "measurement_visible")).toBe("false");
    expect(cell(polygon, "measurement_visible")).toBe("true");
    expect(cell(line, "measurement_point_count")).toBe("2");
    expect(cell(polygon, "measurement_point_count")).toBe("4");
    expect(cell(line, "length_mm")).toBe("1.3333333333333333");
    expect(cell(line, "perimeter_mm")).toBe("");
    expect(cell(line, "area_mm2")).toBe("");
    expect(cell(polygon, "length_mm")).toBe("");
    expect(cell(polygon, "perimeter_mm")).toBe("2.6666666666666665");
    expect(cell(polygon, "area_mm2")).toBe("0.4444444444444444");
  });

  it("exports the practical Uniform ratio denominator and leaves X/Y-only audit fields blank", () => {
    const session = createEmptySession({ name: "uniform-ratio.pdf", size: 10, lastModified: 1 }, 1);
    const calibration = {
      id: "uniform-60",
      name: "Scale 1",
      ...createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    };
    session.pages[1]!.calibrations = [calibration];
    session.pages[1]!.activeCalibrationId = calibration.id;
    session.pages[1]!.measurements.push({
      id: "line",
      type: "line",
      name: "Line",
      calibrationId: calibration.id,
      points: [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
      ],
      classificationValueIds: [],
      visible: true,
    });

    const csv = buildCsv(session, null, allColumns(session));
    const headers = headerColumns(csv);
    const row = csv.split("\r\n")[1]!.split(",");
    const cell = (id: string) => row[headers.indexOf(id)];

    expect(cell("calibration_ratio_denominator")).toBe("60");
    expect(cell("calibration_ratio_x_denominator")).toBe("");
    expect(cell("calibration_ratio_y_denominator")).toBe("");
    expect(cell("calibration_x_reference_mm")).toBe("");
    expect(cell("calibration_x_page_span")).toBe("");
    expect(cell("calibration_y_reference_mm")).toBe("");
    expect(cell("calibration_y_page_span")).toBe("");
  });

  it("exports practical X/Y ratios and axis reference spans while leaving the Uniform ratio blank", () => {
    const session = createEmptySession({ name: "xy-ratio.pdf", size: 10, lastModified: 1 }, 1);
    const calibration = {
      id: "xy-70-30",
      name: "Scale 1",
      ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: 30 }),
    };
    calibration.xReference.end = { x: 72, y: 9 };
    calibration.yReference.end = { x: 11, y: 72 };
    session.pages[1]!.calibrations = [calibration];
    session.pages[1]!.activeCalibrationId = calibration.id;
    session.pages[1]!.measurements.push({
      id: "line",
      type: "line",
      name: "Line",
      calibrationId: calibration.id,
      points: [
        { x: 0, y: 0 },
        { x: 72, y: 72 },
      ],
      classificationValueIds: [],
      visible: true,
    });

    const csv = buildCsv(session, null, allColumns(session));
    const headers = headerColumns(csv);
    const row = csv.split("\r\n")[1]!.split(",");
    const cell = (id: string) => row[headers.indexOf(id)];

    expect(cell("calibration_ratio_denominator")).toBe("");
    expect(cell("calibration_ratio_x_denominator")).toBe("70");
    expect(cell("calibration_ratio_y_denominator")).toBe("30");
    expect(cell("calibration_x_reference_mm")).toBe("1778");
    expect(cell("calibration_x_page_span")).toBe("72");
    expect(cell("calibration_y_reference_mm")).toBe("762");
    expect(cell("calibration_y_page_span")).toBe("72");
  });

  it("escapes and formula-neutralizes pdf_name through the shared CSV serializer", () => {
    const session = smallMeasuredSession("m");
    session.pdf.name = '=SUM("A",1).pdf';

    const csv = buildCsv(session, null, allColumns(session));

    expect(csv).toContain('"\'=SUM(""A"",1).pdf"');
  });

  it("normalizes overrides and computes the three registry presets", () => {
    const session = classifiedMeasuredSession();
    const normalized = normalizeCsvExportSettings(session, {
      columnOverrides: {
        page: false,
        name: true,
        calibration_reference_mm: true,
        "classification:trade:status": true,
        "unknown-column": false,
      },
    });

    expect(normalized).toEqual({
      columnOverrides: {
        calibration_reference_mm: true,
        "classification:trade:status": true,
      },
    });

    const requiredOnly = getCsvColumnDescriptors(
      session,
      createCsvExportSettingsPreset(session, "required-only"),
    );
    expect(
      requiredOnly.filter((descriptor) => descriptor.enabled).map((descriptor) => descriptor.id),
    ).toEqual(["page", "measurement_id", "type", "calibration_id", "unit", "area_unit"]);

    const all = getCsvColumnDescriptors(session, createCsvExportSettingsPreset(session, "all"));
    expect(all.every((descriptor) => descriptor.enabled)).toBe(true);
  });

  it("keeps required columns enabled even when settings contain false overrides", () => {
    const session = measuredSession();
    session.settings.csvExport.columnOverrides = {
      page: false,
      measurement_id: false,
      type: false,
      calibration_id: false,
      unit: false,
      area_unit: false,
    };

    expect(headerColumns(buildCsv(session))).toEqual([
      "page",
      "page_label",
      "measurement_id",
      "name",
      "type",
      "calibration_id",
      "calibration_name",
      "calibration_mode",
      "length",
      "perimeter",
      "area",
      "unit",
      "area_unit",
    ]);
  });

  it("removes optional columns without shifting the remaining values", () => {
    const session = smallMeasuredSession("m");
    session.settings.csvExport.columnOverrides = { name: false, length: false };
    const csv = buildCsv(session);
    const headers = headerColumns(csv);
    const line = csv.split("\r\n")[1]!.split(",");

    expect(headers).not.toContain("name");
    expect(headers).not.toContain("length");
    expect(line[headers.indexOf("perimeter")]).toBe("");
    expect(line[headers.indexOf("area")]).toBe("");
    expect(line[headers.indexOf("unit")]).toBe("m");
  });

  it("adds a default-off audit column when explicitly enabled", () => {
    const session = measuredSession();
    session.settings.csvExport.columnOverrides = { calibration_reference_mm: true };
    const csv = buildCsv(session);

    expect(headerColumns(csv)).toContain("calibration_reference_mm");
    expect(csv).toContain(",uniform,1000,2.50,,,m,");
  });

  it("exports one ordered default classification value per catalog dimension", () => {
    const csv = buildCsv(classifiedMeasuredSession());
    const rows = csv.split("\r\n");

    expect(rows[0]).toBe(
      "\uFEFFpage,page_label,measurement_id,name,type,calibration_id,calibration_name,calibration_mode,length,perimeter,area,unit,area_unit,classification:Trade,classification:Status",
    );
    expect(rows.find((row) => row.includes("line-id"))).toContain(",Electrical,Approved");
    expect(rows.find((row) => row.includes("polygon-id"))).toContain(",Electrical,");
    expect(rows.find((row) => row.includes("line-id"))).not.toContain("electrical-id");
    expect(rows.find((row) => row.includes("line-id"))).not.toContain("active");
    expect(rows.find((row) => row.includes("polygon-id"))).not.toContain("Unclassified");
  });

  it("exports a pasted measurement with its copied name, scale, and classifications", () => {
    const session = classifiedMeasuredSession();
    const source = session.pages[1]!.measurements[0]!;
    const pasted = sessionReducer(
      { session, error: null },
      {
        type: "PASTE_MEASUREMENT",
        pageNumber: 1,
        id: "pasted-line-id",
        sourcePageNumber: 1,
        measurement: source,
      },
    );
    const csv = buildCsv(pasted.session!);
    const pastedRow = csv.split("\r\n").find((row) => row.includes("pasted-line-id"));

    expect(pasted.error).toBeNull();
    expect(pastedRow).toContain('pasted-line-id,"Lobby, ""north""",Line,scale-1,Scale 1,uniform');
    expect(pastedRow).toContain(",Electrical,Approved");
  });

  it("exports a moved measurement through normal session state without changing derived CSV metadata", () => {
    const session = classifiedMeasuredSession();
    const source = session.pages[1]!.measurements.find(
      (measurement) => measurement.id === "line-id",
    )!;
    const sourceBefore = structuredClone(source);
    const csvBefore = buildCsv(session, null, allColumns(session));
    const movedPoints = translateMeasurementPoints(source.points, { x: 37.5, y: 18.25 });

    const moved = sessionReducer(
      { session, error: null },
      {
        type: "UPDATE_MEASUREMENT",
        pageNumber: 1,
        id: source.id,
        points: movedPoints,
      },
    );
    const movedMeasurement = moved.session!.pages[1]!.measurements.find(
      (measurement) => measurement.id === source.id,
    )!;

    expect(movedMeasurement).toEqual({ ...sourceBefore, points: movedPoints });
    expect(buildCsv(moved.session!, null, allColumns(moved.session!))).toBe(csvBefore);
  });

  it("exports classification IDs and status only when explicitly enabled", () => {
    const session = classifiedMeasuredSession();
    const settings = {
      columnOverrides: {
        "classification:trade:value_id": true,
        "classification:trade:status": true,
      },
    };
    const csv = buildCsv(session, null, settings);
    const headers = headerColumns(csv);

    expect(headers).toContain("classification:Trade");
    expect(headers).toContain("classification_value_id:Trade");
    expect(headers).toContain("classification_status:Trade");
    expect(headers).not.toContain("classification_value_id:Status");
    expect(csv).toContain(",Electrical,electrical-id,active,Approved");
  });

  it("allows classification values to be disabled independently from their IDs", () => {
    const session = classifiedMeasuredSession();
    const csv = buildCsv(session, null, {
      columnOverrides: {
        "classification:trade:value": false,
        "classification:trade:value_id": true,
      },
    });
    const headers = headerColumns(csv);

    expect(headers).not.toContain("classification:Trade");
    expect(headers).toContain("classification_value_id:Trade");
    expect(csv).toContain(",electrical-id,");
  });

  it("keeps classification overrides attached to dimension IDs after a rename", () => {
    const session = classifiedMeasuredSession();
    session.settings.csvExport.columnOverrides = {
      "classification:trade:value_id": true,
    };
    session.classificationCatalog.dimensions[0]!.name = "Renamed trade";

    const csv = buildCsv(session);
    const headers = headerColumns(csv);

    expect(headers).toContain("classification_value_id:Renamed trade");
    expect(csv).toContain(",Electrical,electrical-id,");
  });

  it("uses defaults for a new dimension without mutating CSV settings", () => {
    const session = measuredSession();
    session.settings.csvExport.columnOverrides = {};
    session.classificationCatalog.dimensions.push({
      id: "new-dimension",
      name: "New dimension",
      archived: false,
      values: [{ id: "new-value", name: "New value", archived: false }],
    });
    session.pages[1]!.measurements[0]!.classificationValueIds = ["new-value"];

    const descriptors = getCsvColumnDescriptors(session);
    const newColumns = descriptors.filter(
      (descriptor) => descriptor.classification?.dimensionId === "new-dimension",
    );

    expect(newColumns.map((descriptor) => descriptor.enabled)).toEqual([true, false, false]);
    expect(session.settings.csvExport.columnOverrides).toEqual({});
  });

  it("keeps archived classification dimensions visible and exportable", () => {
    const session = classifiedMeasuredSession();
    session.classificationCatalog.dimensions[0]!.archived = true;
    const descriptors = getCsvColumnDescriptors(session);
    const archivedColumns = descriptors.filter(
      (descriptor) => descriptor.classification?.dimensionId === "trade",
    );
    const csv = buildCsv(session, null, allColumns(session));

    expect(archivedColumns).toHaveLength(3);
    expect(
      archivedColumns.every((descriptor) => descriptor.classification?.dimensionArchived),
    ).toBe(true);
    expect(headerColumns(csv)).toContain("classification:Trade");
    expect(csv).toContain(",Electrical,electrical-id,archived,");
  });

  it("preserves archived classification values with an effective archived status", () => {
    const session = classifiedMeasuredSession();
    session.classificationCatalog.dimensions[0]!.values[0]!.archived = true;

    const lineRow = buildCsv(session, null, allColumns(session))
      .split("\r\n")
      .find((row) => row.includes("line-id"));

    expect(lineRow).toContain(",Electrical,electrical-id,archived,Approved,approved-id,active");
    expect(lineRow).not.toContain("Electrical (archived)");
  });

  it("marks assignments archived when their dimension is archived", () => {
    const session = classifiedMeasuredSession();
    session.classificationCatalog.dimensions[0]!.archived = true;

    const lineRow = buildCsv(session, null, allColumns(session))
      .split("\r\n")
      .find((row) => row.includes("line-id"));

    expect(lineRow).toContain(",Electrical,electrical-id,archived,Approved,approved-id,active");
  });

  it("escapes dynamic classification headers and values with the shared CSV escaping", () => {
    const session = classifiedMeasuredSession();
    const trade = session.classificationCatalog.dimensions[0]!;
    trade.name = 'Trade, "Zone"';
    trade.values[0]!.name = 'Electrical, "North"\nBay';

    const csv = buildCsv(session, null, allColumns(session));
    const header = csv.split("\r\n")[0];

    expect(header).toContain('"classification:Trade, ""Zone"""');
    expect(header).toContain('"classification_value_id:Trade, ""Zone"""');
    expect(header).toContain('"classification_status:Trade, ""Zone"""');
    expect(csv).toContain('"Electrical, ""North""\nBay",electrical-id,active');
  });

  it("neutralizes spreadsheet-active prefixes across externally controlled CSV text", () => {
    const session = classifiedMeasuredSession();
    const line = session.pages[1]!.measurements[0]!;
    const scale = session.pages[1]!.calibrations[0]!;
    const trade = session.classificationCatalog.dimensions[0]!;

    line.name = "+1+1";
    scale.name = "-1+1";
    trade.name = "=Trade";
    trade.values[0]!.name = "@SUM(1,1)";

    const csv = buildCsv(session, ["=1+1", "7"], allColumns(session));
    const header = csv.split("\r\n")[0]!;

    expect(header).toContain("classification:=Trade");
    expect(csv).toContain("1,'=1+1,line-id,'+1+1,Line,scale-1,'-1+1,uniform,");
    expect(csv).toContain('"\'@SUM(1,1)"');
    expect(csv).toContain(",uniform,1000,10,100,100,100,2.50,,,m,");
  });

  it.each([" =1+1", "\t=1+1", "\r=1+1", "\n=1+1", "\u0000=1+1"])(
    "neutralizes a formula prefix after leading whitespace/control characters in %j",
    (label) => {
      const csv = buildCsv(measuredSession(), [label, "7"]);

      expect(csv).toContain(`'${label}`);
    },
  );

  it("preserves ordinary hyphenated, quoted, multiline, and Unicode text", () => {
    const session = measuredSession();
    session.pages[1]!.measurements[0]!.name = 'North-South, "Δ"\nLevel -1';
    session.pages[2]!.measurements[0]!.name = "-West";

    const csv = buildCsv(session);

    expect(csv).toContain('"North-South, ""Δ""\nLevel -1"');
    expect(csv).not.toContain('\'North-South, ""Δ""\nLevel -1');
    expect(csv).toContain("second-line-id,'-West,Line");
  });

  it("exports hidden measurements without adding visibility to the CSV contract", () => {
    const session = measuredSession();
    session.pages[1]!.measurements[1]!.visible = false;
    const csv = buildCsv(session);

    expect(csv).toContain('1,,polygon-id,"Room\nA",Polygon,scale-2');
    expect(csv.split("\r\n")[0]).not.toContain("visible");
  });

  it("uses each measurement's calibration even after the active scale changes", () => {
    const session = measuredSession();
    const before = buildCsv(session, null, allColumns(session));
    session.pages[1]!.activeCalibrationId = "scale-1";
    const after = buildCsv(session, null, allColumns(session));

    expect(after).toBe(before);
    expect(after).toContain(",scale-1,Scale 1,uniform,1000,10,100,100,100,2.50,,,");
    expect(after).toContain(",scale-2,Detail A,xy,,,,500,1000,,30.00,50.00,");
  });

  it("changes calibration_name but not calibration_id or numeric output after a scale rename", () => {
    const original = measuredSession();
    const before = buildCsv(original, null, allColumns(original));
    const renamedState = sessionReducer(
      { session: structuredClone(original), error: null },
      {
        type: "RENAME_CALIBRATION",
        pageNumber: 1,
        calibrationId: "scale-1",
        name: "  Ground floor revised  ",
      },
    );
    const renamed = renamedState.session!;
    const after = buildCsv(renamed, null, allColumns(renamed));

    expect(after).toContain(",scale-1,Ground floor revised,uniform,");
    expect(after).toBe(
      before.replace(",scale-1,Scale 1,uniform,", ",scale-1,Ground floor revised,uniform,"),
    );
  });

  it("exports a standard ratio preset through the existing Uniform calibration columns", () => {
    const session = createEmptySession({ name: "preset.pdf", size: 10, lastModified: 1 }, 1);
    const calibration = { id: "preset-50", name: "Scale 1", ...createStandardScalePreset(50) };
    session.pages[1]!.calibrations = [calibration];
    session.pages[1]!.activeCalibrationId = calibration.id;
    session.pages[1]!.measurements.push({
      id: "preset-line",
      type: "line",
      name: "Preset line",
      calibrationId: calibration.id,
      points: [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
      ],
      classificationValueIds: [],
      visible: true,
    });

    const csv = buildCsv(session, null, allColumns(session));
    const row = csv.split("\r\n")[1]!.split(",");

    expect(csv).toContain("preset-line,Preset line,Line,preset-50,Scale 1,uniform");
    expect(Number(row[8])).toBeCloseTo(1270, 10);
    expect(Number(row[9])).toBe(72);
    expect(Number(row[10])).toBeCloseTo((50 * 25.4) / 72, 12);
    expect(Number(row[11])).toBeCloseTo((50 * 25.4) / 72, 12);
    expect(Number(row[12])).toBeCloseTo((50 * 25.4) / 72, 12);
    expect(Number(row[13])).toBeCloseTo(1.27, 12);
    expect(row[16]).toBe("m");
  });

  it("exports a custom Uniform ratio through the unchanged calibration columns", () => {
    const session = createEmptySession({ name: "custom-ratio.pdf", size: 10, lastModified: 1 }, 1);
    const calibration = {
      id: "custom-60",
      name: "Scale 1",
      ...createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    };
    session.pages[1]!.calibrations = [calibration];
    session.pages[1]!.activeCalibrationId = calibration.id;
    session.pages[1]!.measurements.push({
      id: "custom-line",
      type: "line",
      name: "Custom line",
      calibrationId: calibration.id,
      points: [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
      ],
      classificationValueIds: [],
      visible: true,
    });

    const rows = buildCsv(session, null, allColumns(session)).split("\r\n");
    const headers = rows[0]!.split(",");
    const row = rows[1]!.split(",");
    expect(row[headers.indexOf("calibration_reference_mm")]).toBe("1524");
    expect(row[headers.indexOf("calibration_page_distance")]).toBe("72");
    expect(Number(row[headers.indexOf("calibration_mm_per_page_unit")])).toBeCloseTo(
      (60 * 127) / 360,
      13,
    );
    expect(row[headers.indexOf("calibration_mode")]).toBe("uniform");
  });

  it("exports custom X/Y ratios only through existing X/Y scale columns", () => {
    const session = createEmptySession({ name: "custom-xy.pdf", size: 10, lastModified: 1 }, 1);
    const calibration = {
      id: "custom-xy",
      name: "Scale 1",
      ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: 30 }),
    };
    session.pages[1]!.calibrations = [calibration];
    session.pages[1]!.activeCalibrationId = calibration.id;
    session.pages[1]!.measurements.push({
      id: "xy-line",
      type: "line",
      name: "X/Y line",
      calibrationId: calibration.id,
      points: [
        { x: 0, y: 0 },
        { x: 72, y: 72 },
      ],
      classificationValueIds: [],
      visible: true,
    });

    const rows = buildCsv(session, null, allColumns(session)).split("\r\n");
    const headers = rows[0]!.split(",");
    const row = rows[1]!.split(",");
    expect(row[headers.indexOf("calibration_mode")]).toBe("xy");
    expect(row[headers.indexOf("calibration_reference_mm")]).toBe("");
    expect(row[headers.indexOf("calibration_page_distance")]).toBe("");
    expect(row[headers.indexOf("calibration_mm_per_page_unit")]).toBe("");
    expect(Number(row[headers.indexOf("calibration_scale_x_mm_per_page_unit")])).toBeCloseTo(
      (70 * 127) / 360,
      13,
    );
    expect(Number(row[headers.indexOf("calibration_scale_y_mm_per_page_unit")])).toBeCloseTo(
      (30 * 127) / 360,
      13,
    );
  });

  it("preserves calibration metadata precision beyond two decimals", () => {
    const session = measuredSession();
    const calibration = session.pages[1]!.calibrations[0]!;
    if (calibration.mode !== "uniform") throw new Error("Expected uniform test calibration.");
    session.pages[1]!.calibrations[0] = {
      ...calibration,
      end: { x: 3, y: 0 },
    };

    const firstRow = buildCsv(session, null, allColumns(session)).split("\r\n")[1];

    expect(firstRow).toContain(
      ",scale-1,Scale 1,uniform,1000,3,333.3333333333333,333.3333333333333,333.3333333333333,",
    );
  });

  it("keeps CSV output unchanged when measurement display precision changes", () => {
    const session = measuredSession();
    session.settings.measurementDecimalPlaces = 2;
    const before = buildCsv(session, null, allColumns(session));

    session.settings.measurementDecimalPlaces = 6;
    const after = buildCsv(session, null, allColumns(session));

    expect(after).toBe(before);
  });

  it("exports exact PDF page labels by page number and escapes label values", () => {
    const label = 'Cover, "A"\nSheet';
    const csv = buildCsv(measuredSession(), [label, "7"]);
    expect(csv).toContain(
      '1,"Cover, ""A""\nSheet",line-id,"Lobby, ""north""",Line,scale-1,Scale 1,uniform,2.50,,,m,',
    );
    expect(csv).toContain(
      "2,7,second-line-id,Second measurement,Line,scale-3,Section,uniform,0.25,,,m,",
    );
  });

  it("uses custom page labels before source labels and falls back after reset", () => {
    const session = measuredSession();
    session.pageLabelOverrides[1] = "Custom";

    expect(buildCsv(session, ["Source", "7"])).toContain(
      '1,Custom,line-id,"Lobby, ""north""",Line,',
    );

    delete session.pageLabelOverrides[1];
    expect(buildCsv(session, ["Source", "7"])).toContain(
      '1,Source,line-id,"Lobby, ""north""",Line,',
    );
  });

  it("exports custom page labels without PDF labels and leaves page_label empty without either", () => {
    const session = measuredSession();
    session.pageLabelOverrides[1] = "Custom only";
    expect(buildCsv(session, null)).toContain('1,Custom only,line-id,"Lobby, ""north""",Line,');

    delete session.pageLabelOverrides[1];
    expect(buildCsv(session, null)).toContain('1,,line-id,"Lobby, ""north""",Line,');
  });

  it("escapes custom page-label comma/quotes and neutralizes spreadsheet-active prefixes", () => {
    const escaped = measuredSession();
    escaped.pageLabelOverrides[1] = 'Custom, "A"';
    expect(buildCsv(escaped, ["Source", "7"])).toContain('1,"Custom, ""A""",line-id,');

    for (const prefix of ["=", "+", "-", "@"] as const) {
      const formula = measuredSession();
      formula.pageLabelOverrides[1] = `${prefix}SUM(A1:A2)`;
      expect(buildCsv(formula, ["Source", "7"])).toContain(`1,'${prefix}SUM(A1:A2),line-id,`);
    }
  });

  it("does not normalize source PDF page labels", () => {
    const csv = buildCsv(measuredSession(), [" A ", "7"]);
    expect(csv).toContain('1, A ,line-id,"Lobby, ""north""",Line,');
  });

  it("formats values in the selected unit", () => {
    const session = measuredSession();
    session.settings.displayUnit = "cm";
    const csv = buildCsv(session, null, allColumns(session));
    expect(csv).toContain("Line,scale-1,Scale 1,uniform,1000,10,100,100,100,250.00,,,cm,");
    expect(csv).toContain("Polygon,scale-2,Detail A,xy,,,,500,1000,,3000.00,500000.00,cm,cm²");

    session.settings.displayUnit = "mm";
    const millimetreCsv = buildCsv(session, null, allColumns(session));
    expect(millimetreCsv).toContain(
      "Line,scale-1,Scale 1,uniform,1000,10,100,100,100,2500.00,,,mm,",
    );
    expect(millimetreCsv).toContain(
      "Polygon,scale-2,Detail A,xy,,,,500,1000,,30000.00,50000000.00,mm,mm²",
    );
  });

  it.each([
    ["ft", "8.202099737532809", "ft", "98.4251968503937", "538.1955208354861", "ft²"],
    ["in", "98.4251968503937", "in", "1181.1023622047244", "77500.15500031", "in²"],
  ] as const)(
    "exports decimal imperial measurements numerically in %s",
    (
      displayUnit,
      expectedLength,
      expectedUnit,
      expectedPerimeter,
      expectedArea,
      expectedAreaUnit,
    ) => {
      const session = measuredSession();
      session.settings.displayUnit = displayUnit;
      const csv = buildCsv(session, null, allColumns(session));

      expect(csv).toContain(`,${expectedLength},,,${expectedUnit},`);
      expect(csv).toContain(
        `,,${expectedPerimeter},${expectedArea},${expectedUnit},${expectedAreaUnit}`,
      );
      expect(csv).not.toContain("' ");
    },
  );

  it("exports Feet & inches UI mode as numeric decimal feet", () => {
    const session = createEmptySession({ name: "architectural.pdf", size: 10, lastModified: 1 }, 1);
    session.settings.displayUnit = "ft-in";
    session.pages[1]!.calibrations = [
      {
        id: "scale",
        name: "Architectural",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        referenceDistanceMm: (1524 * 12.375) / 5,
      },
    ];
    session.pages[1]!.activeCalibrationId = "scale";
    session.pages[1]!.measurements = [
      {
        id: "line",
        type: "line",
        name: "Reference",
        calibrationId: "scale",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        classificationValueIds: [],
        visible: true,
      },
    ];

    const csv = buildCsv(session, null, allColumns(session));

    expect(csv).toContain(",12.375,,,ft,");
    expect(csv).not.toContain("12' 4 1/2");
  });

  it.each([
    ["ft", "ft²"],
    ["in", "in²"],
    ["ft-in", "ft²"],
  ] as const)("uses %s Auto polygon area unit %s", (displayUnit, areaUnit) => {
    const session = measuredSession();
    session.settings.displayUnit = displayUnit;
    session.settings.areaDisplay = "auto";
    const csv = buildCsv(session, null, allColumns(session));
    expect(csv).toContain(`,${displayUnit === "ft-in" ? "ft" : displayUnit},${areaUnit}`);
  });

  it("exports an exact one-acre synthetic polygon as numeric acres", () => {
    const session = createEmptySession({ name: "acre.pdf", size: 10, lastModified: 1 }, 1);
    session.settings.displayUnit = "ft-in";
    session.settings.areaDisplay = "ac";
    session.pages[1]!.calibrations = [
      {
        id: "one-foot",
        name: "One page unit per foot",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        referenceDistanceMm: 1524 / 5,
      },
    ];
    session.pages[1]!.activeCalibrationId = "one-foot";
    session.pages[1]!.measurements = [
      {
        id: "acre",
        type: "polygon",
        name: "Acre",
        calibrationId: "one-foot",
        points: [
          { x: 0, y: 0 },
          { x: 66, y: 0 },
          { x: 66, y: 660 },
          { x: 0, y: 660 },
        ],
        classificationValueIds: [],
        visible: true,
      },
    ];

    const csv = buildCsv(session, null, allColumns(session));
    const row = csv.split("\r\n")[1]!.split(",");

    expect(row[15]).toBe("1.00");
    expect(row[16]).toBe("ft");
    expect(row[17]).toBe("ac");
    expect(row[8]).toBe(String(1524 / 5));
    expect(row[10]).toBe(String(1524 / 5));
  });

  it.each([
    ["mm", "4.00", "8.00", "4.00"],
    ["cm", "0.40", "0.80", "0.04"],
    ["m", "0.004", "0.008", "0.000004"],
    ["in", "0.15748031496062992", "0.31496062992125984", "0.0062000124000248"],
    ["ft", "0.013123359580052493", "0.026246719160104987", "0.00004305564166683889"],
  ] as const)(
    "does not round small length, perimeter, or area to zero in %s",
    (unit, length, perimeter, area) => {
      const session = smallMeasuredSession(unit);
      const csv = buildCsv(session, null, allColumns(session));

      expect(csv).toContain(
        `1,,small-line-id,Small line,Line,small-scale,Small scale,uniform,1,1,1,1,1,${length},,,${unit},`,
      );
      expect(csv).toContain(
        `1,,small-polygon-id,Small polygon,Polygon,small-scale,Small scale,uniform,1,1,1,1,1,,${perimeter},${area},${unit},${unit}²`,
      );
    },
  );

  it("preserves measurement ids across repeated exports", () => {
    const session = measuredSession();
    const firstExport = buildCsv(session);

    expect(buildCsv(session)).toBe(firstExport);
    expect(firstExport).toContain(",line-id,");
    expect(firstExport).toContain(",polygon-id,");
    expect(firstExport).toContain(",second-line-id,");
  });

  it("rejects a measurement with no referenced calibration", () => {
    const session = createEmptySession({ name: "uncalibrated.pdf", size: 1, lastModified: 1 }, 1);
    session.pages[1]!.measurements.push({
      id: "line-id",
      type: "line",
      name: "Uncalibrated",
      calibrationId: "missing-scale",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      classificationValueIds: [],
      visible: true,
    });

    expect(() => buildCsv(session)).toThrow("Measurement line-id has a missing calibration.");
  });

  it("rejects an unrepresentable finite-input measurement instead of exporting Infinity", () => {
    const session = measuredSession();
    session.pages[1]!.measurements[0]!.points = [
      { x: 0, y: 0 },
      { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
    ];

    expect(() => buildCsv(session)).toThrowError(
      new RangeError("Measurement line-id must produce finite results before exporting CSV."),
    );
  });

  describe("classification assignment export", () => {
    it("exports one normalized row per assignment in page, measurement, and catalog-dimension order", () => {
      const session = classifiedMeasuredSession();
      session.pages[2]!.measurements[0]!.classificationValueIds = ["approved-id"];

      const csv = buildClassificationAssignmentsCsv(session, ["A1", "A2"]);
      const rows = csv.split("\r\n");

      expect(rows[0]).toBe(`\uFEFF${CLASSIFICATION_ASSIGNMENT_HEADER}`);
      expect(rows.slice(1, -1)).toEqual([
        'sample.pdf,1,A1,line-id,"Lobby, ""north""",Line,true,Trade,trade,active,Electrical,electrical-id,active,active',
        'sample.pdf,1,A1,line-id,"Lobby, ""north""",Line,true,Status,status,active,Approved,approved-id,active,active',
        'sample.pdf,1,A1,polygon-id,"Room\nA",Polygon,true,Trade,trade,active,Electrical,electrical-id,active,active',
        "sample.pdf,2,A2,second-line-id,Second measurement,Line,true,Status,status,active,Approved,approved-id,active,active",
      ]);
      expect(rows[0]).not.toContain("length");
      expect(rows[0]).not.toContain("perimeter");
      expect(rows[0]).not.toContain("area");
      expect(rows[0]).not.toContain("unit");
      expect(rows[0]).not.toContain("calibration");
    });

    it("does not use classificationValueIds order to order assignment rows", () => {
      const session = classifiedMeasuredSession();
      const measurement = session.pages[1]!.measurements[0]!;
      const before = buildClassificationAssignmentsCsv(session);

      measurement.classificationValueIds.reverse();

      expect(buildClassificationAssignmentsCsv(session)).toBe(before);
    });

    it("uses custom page labels before source labels and falls back after reset", () => {
      const session = classifiedMeasuredSession();
      session.pageLabelOverrides[1] = "Custom";
      expect(buildClassificationAssignmentsCsv(session, ["Source", "A2"])).toContain(
        'sample.pdf,1,Custom,line-id,"Lobby, ""north""",Line,true,',
      );

      delete session.pageLabelOverrides[1];
      expect(buildClassificationAssignmentsCsv(session, ["Source", "A2"])).toContain(
        'sample.pdf,1,Source,line-id,"Lobby, ""north""",Line,true,',
      );
    });

    it("uses shared escaping and formula neutralization for custom page labels", () => {
      const session = classifiedMeasuredSession();
      session.pageLabelOverrides[1] = '=SUM("A",1), Δ';

      const csv = buildClassificationAssignmentsCsv(session, ["Source", "A2"]);

      expect(csv).toContain('"\'=SUM(""A"",1), Δ"');
    });

    it("exports header only when measurements exist without classification assignments", () => {
      const session = measuredSession();
      session.classificationCatalog = classifiedMeasuredSession().classificationCatalog;

      expect(buildClassificationAssignmentsCsv(session)).toBe(
        `\uFEFF${CLASSIFICATION_ASSIGNMENT_HEADER}\r\n`,
      );
    });

    it("rejects sessions with no measurements", () => {
      const session = createEmptySession({ name: "empty.pdf", size: 1, lastModified: 1 }, 1);

      expect(() => buildClassificationAssignmentsCsv(session)).toThrow(NoMeasurementsError);
    });

    it.each([
      {
        label: "archived dimension only",
        dimensionArchived: true,
        valueArchived: false,
        expected: ",Trade,trade,archived,Electrical,electrical-id,active,archived",
      },
      {
        label: "archived value only",
        dimensionArchived: false,
        valueArchived: true,
        expected: ",Trade,trade,active,Electrical,electrical-id,archived,archived",
      },
      {
        label: "archived dimension and value",
        dimensionArchived: true,
        valueArchived: true,
        expected: ",Trade,trade,archived,Electrical,electrical-id,archived,archived",
      },
    ])(
      "exports independent dimension/value status and effective status for $label",
      ({ dimensionArchived, valueArchived, expected }) => {
        const session = classifiedMeasuredSession();
        const trade = session.classificationCatalog.dimensions[0]!;
        trade.archived = dimensionArchived;
        trade.values[0]!.archived = valueArchived;

        const csv = buildClassificationAssignmentsCsv(session);

        expect(csv).toContain(expected);
        expect(csv).not.toContain("(archived)");
      },
    );

    it("exports active dimension, value, and effective status when neither is archived", () => {
      const csv = buildClassificationAssignmentsCsv(classifiedMeasuredSession());

      expect(csv).toContain(",Trade,trade,active,Electrical,electrical-id,active,active");
    });

    it("uses current names while preserving stable dimension and value IDs", () => {
      const session = classifiedMeasuredSession();
      const trade = session.classificationCatalog.dimensions[0]!;
      trade.name = "Renamed trade";
      trade.values[0]!.name = "Renamed electrical";

      const csv = buildClassificationAssignmentsCsv(session);

      expect(csv).toContain(
        ",Renamed trade,trade,active,Renamed electrical,electrical-id,active,active",
      );
    });

    it("uses shared escaping and formula neutralization for PDF, page, measurement, dimension, and value text", () => {
      const session = classifiedMeasuredSession();
      const measurement = session.pages[1]!.measurements[0]!;
      const trade = session.classificationCatalog.dimensions[0]!;
      session.pdf.name = '=SUM("A",1).pdf';
      measurement.name = "+measurement name";
      measurement.id = " \t=measurement";
      trade.name = 'Trade, "Δ"\nZone';
      trade.id = "+trade";
      trade.values[0]!.name = 'Electrical, "Ω"\nBay';
      trade.values[0]!.id = "@electrical";
      measurement.classificationValueIds = ["@electrical", "approved-id"];

      const csv = buildClassificationAssignmentsCsv(session, ['=A1, "cover"\nSheet', "A2"]);

      expect(csv).toContain('"\'=SUM(""A"",1).pdf"');
      expect(csv).toContain('"\'=A1, ""cover""\nSheet"');
      expect(csv).toContain("' \t=measurement");
      expect(csv).toContain("'+measurement name");
      expect(csv).toContain('"Trade, ""Δ""\nZone"');
      expect(csv).toContain("'+trade");
      expect(csv).toContain('"Electrical, ""Ω""\nBay"');
      expect(csv).toContain("'@electrical");
    });

    it("includes classification assignments from hidden measurements", () => {
      const session = classifiedMeasuredSession();
      session.pages[1]!.measurements[0]!.visible = false;

      expect(buildClassificationAssignmentsCsv(session)).toContain(
        'line-id,"Lobby, ""north""",Line,false,Trade,trade,active,Electrical,electrical-id,active,active',
      );
    });

    it("downloads the exact classifications filename and preserves the object URL lifecycle", () => {
      const anchor = {
        href: "",
        download: "",
        click: vi.fn(),
        remove: vi.fn(),
      };
      const append = vi.fn();
      const revokeObjectURL = vi.fn();
      const setTimeout = vi.fn((callback: () => void) => {
        callback();
        return 1;
      });
      vi.stubGlobal("document", {
        body: { append },
        createElement: vi.fn(() => anchor),
      });
      vi.stubGlobal("URL", {
        createObjectURL: vi.fn(() => "blob:classifications"),
        revokeObjectURL,
      });
      vi.stubGlobal("window", { setTimeout });

      try {
        const session = classifiedMeasuredSession();
        session.pdf.name = "plan.PDF";
        downloadClassificationAssignmentsCsv(session);

        expect(anchor.download).toBe("plan-classifications.csv");
        expect(append).toHaveBeenCalledWith(anchor);
        expect(anchor.click).toHaveBeenCalledOnce();
        expect(anchor.remove).toHaveBeenCalledOnce();
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 250);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:classifications");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("rejects empty exports", () => {
    const session = createEmptySession({ name: "empty.pdf", size: 1, lastModified: 1 }, 1);
    expect(() => buildCsv(session)).toThrow(NoMeasurementsError);
  });

  it("keeps the object URL alive until the browser has started the download", () => {
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const append = vi.fn();
    const revokeObjectURL = vi.fn();
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal("document", {
      body: { append },
      createElement: vi.fn(() => anchor),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL,
    });
    vi.stubGlobal("window", { setTimeout });

    try {
      downloadCsv(measuredSession());
      expect(anchor.download).toBe("sample-measurements.csv");
      expect(append).toHaveBeenCalledWith(anchor);
      expect(anchor.click).toHaveBeenCalledOnce();
      expect(anchor.remove).toHaveBeenCalledOnce();
      expect(setTimeout).toHaveBeenCalledOnce();
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 250);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
