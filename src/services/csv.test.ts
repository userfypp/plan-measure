import { describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession, LinearUnit } from "../types/domain";
import { buildCsv, downloadCsv, NoMeasurementsError } from "./csv";

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

function smallMeasuredSession(displayUnit: LinearUnit): CurrentSession {
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
  session.pages[1]!.measurements[0]!.classificationValueIds = [
    "approved-id",
    "electrical-id",
  ];
  session.pages[1]!.measurements[1]!.classificationValueIds = ["electrical-id"];
  return session;
}

describe("CSV export", () => {
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
      "1,,polyline-id,Service run,Polyline,scale-1,Scale 1,uniform,1000,10,100,100,100,0.70,,,m,",
    );
  });

  it("exports exact columns and calibration metadata for every row", () => {
    const csv = buildCsv(measuredSession());
    expect(
      csv.startsWith(
        "\uFEFFpage,page_label,measurement_id,name,type,calibration_id,calibration_name,calibration_mode,calibration_reference_mm,calibration_page_distance,calibration_mm_per_page_unit,calibration_scale_x_mm_per_page_unit,calibration_scale_y_mm_per_page_unit,length,perimeter,area,unit,area_unit\r\n",
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

  it("exports one ordered classification column group per catalog dimension", () => {
    const csv = buildCsv(classifiedMeasuredSession());
    const rows = csv.split("\r\n");

    expect(rows[0]).toBe(
      "\uFEFFpage,page_label,measurement_id,name,type,calibration_id,calibration_name,calibration_mode,calibration_reference_mm,calibration_page_distance,calibration_mm_per_page_unit,calibration_scale_x_mm_per_page_unit,calibration_scale_y_mm_per_page_unit,length,perimeter,area,unit,area_unit,classification:Trade,classification_value_id:Trade,classification_status:Trade,classification:Status,classification_value_id:Status,classification_status:Status",
    );
    expect(rows.find((row) => row.includes("line-id"))).toContain(
      ",Electrical,electrical-id,active,Approved,approved-id,active",
    );
    expect(rows.find((row) => row.includes("polygon-id"))).toContain(
      ",Electrical,electrical-id,active,,,",
    );
    expect(rows.find((row) => row.includes("polygon-id"))).not.toContain("Unclassified");
  });

  it("preserves archived classification values with an effective archived status", () => {
    const session = classifiedMeasuredSession();
    session.classificationCatalog.dimensions[0]!.values[0]!.archived = true;

    const lineRow = buildCsv(session).split("\r\n").find((row) => row.includes("line-id"));

    expect(lineRow).toContain(",Electrical,electrical-id,archived,Approved,approved-id,active");
    expect(lineRow).not.toContain("Electrical (archived)");
  });

  it("marks assignments archived when their dimension is archived", () => {
    const session = classifiedMeasuredSession();
    session.classificationCatalog.dimensions[0]!.archived = true;

    const lineRow = buildCsv(session).split("\r\n").find((row) => row.includes("line-id"));

    expect(lineRow).toContain(",Electrical,electrical-id,archived,Approved,approved-id,active");
  });

  it("escapes dynamic classification headers and values with the shared CSV escaping", () => {
    const session = classifiedMeasuredSession();
    const trade = session.classificationCatalog.dimensions[0]!;
    trade.name = 'Trade, "Zone"';
    trade.values[0]!.name = 'Electrical, "North"\nBay';

    const csv = buildCsv(session);
    const header = csv.split("\r\n")[0];

    expect(header).toContain('"classification:Trade, ""Zone"""');
    expect(header).toContain('"classification_value_id:Trade, ""Zone"""');
    expect(header).toContain('"classification_status:Trade, ""Zone"""');
    expect(csv).toContain('"Electrical, ""North""\nBay",electrical-id,active');
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
    const before = buildCsv(session);
    session.pages[1]!.activeCalibrationId = "scale-1";
    const after = buildCsv(session);

    expect(after).toBe(before);
    expect(after).toContain(",scale-1,Scale 1,uniform,1000,10,100,100,100,2.50,,,");
    expect(after).toContain(",scale-2,Detail A,xy,,,,500,1000,,30.00,50.00,");
  });

  it("preserves calibration metadata precision beyond two decimals", () => {
    const session = measuredSession();
    const calibration = session.pages[1]!.calibrations[0]!;
    if (calibration.mode !== "uniform") throw new Error("Expected uniform test calibration.");
    session.pages[1]!.calibrations[0] = {
      ...calibration,
      end: { x: 3, y: 0 },
    };

    const firstRow = buildCsv(session).split("\r\n")[1];

    expect(firstRow).toContain(
      ",scale-1,Scale 1,uniform,1000,3,333.3333333333333,333.3333333333333,333.3333333333333,",
    );
  });

  it("exports exact PDF page labels by page number and escapes label values", () => {
    const label = 'Cover, "A"\nSheet';
    const csv = buildCsv(measuredSession(), [label, "7"]);
    expect(csv).toContain(
      '1,"Cover, ""A""\nSheet",line-id,"Lobby, ""north""",Line,scale-1,Scale 1,uniform,1000,10,100,100,100,2.50,,,m,',
    );
    expect(csv).toContain(
      "2,7,second-line-id,Second measurement,Line,scale-3,Section,uniform,500,20,25,25,25,0.25,,,m,",
    );
  });

  it("formats values in the selected unit", () => {
    const session = measuredSession();
    session.settings.displayUnit = "cm";
    const csv = buildCsv(session);
    expect(csv).toContain("Line,scale-1,Scale 1,uniform,1000,10,100,100,100,250.00,,,cm,");
    expect(csv).toContain("Polygon,scale-2,Detail A,xy,,,,500,1000,,3000.00,500000.00,cm,cm²");

    session.settings.displayUnit = "mm";
    const millimetreCsv = buildCsv(session);
    expect(millimetreCsv).toContain(
      "Line,scale-1,Scale 1,uniform,1000,10,100,100,100,2500.00,,,mm,",
    );
    expect(millimetreCsv).toContain(
      "Polygon,scale-2,Detail A,xy,,,,500,1000,,30000.00,50000000.00,mm,mm²",
    );
  });

  it.each([
    ["mm", "4.00", "8.00", "4.00"],
    ["cm", "0.40", "0.80", "0.04"],
    ["m", "0.004", "0.008", "0.000004"],
  ] as const)(
    "does not round small length, perimeter, or area to zero in %s",
    (unit, length, perimeter, area) => {
      const csv = buildCsv(smallMeasuredSession(unit));

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
