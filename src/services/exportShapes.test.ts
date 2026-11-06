import { describe, expect, it } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession, Measurement } from "../types/domain";
import { buildCsv } from "./csv";
import { buildDataJson } from "./dataJson";

// Two scales on one page:
// - "xy": 100 mm per unit across and 200 mm per unit down, so a 30 x 10 unit box is 3 m x 2 m.
// - "uniform": 100 mm per unit on both axes, so a 40 x 20 unit box is 4 m x 2 m.
function shapeSession(): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
  session.settings.displayUnit = "m";
  const page = session.pages[1]!;
  page.calibrations = [
    {
      id: "xy",
      name: "XY",
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 2000 },
    },
    {
      id: "uniform",
      name: "Uniform",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
  ];
  const box = (
    id: string,
    type: "rectangle" | "ellipse",
    calibrationId: string,
    w: number,
    h: number,
  ): Measurement => ({
    id,
    name: id,
    type,
    points: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
    calibrationId,
    classificationValueIds: [],
    visible: true,
  });
  page.measurements = [
    box("rect-xy", "rectangle", "xy", 30, 10),
    box("ellipse-xy", "ellipse", "xy", 30, 10),
    box("rect-uniform", "rectangle", "uniform", 40, 20),
    box("ellipse-uniform", "ellipse", "uniform", 40, 20),
  ];
  return session;
}

// Hand-worked results.
// Rectangle 3 m x 2 m: perimeter 2 * (3 + 2) = 10 m, area 6 m².
// Rectangle 4 m x 2 m: perimeter 12 m, area 8 m².
// Ellipse in the 3 m x 2 m box: a = 1.5 m, b = 1 m, area pi * 1.5 = 4.71238898038469 m².
//   Ramanujan II: h = (0.5 / 2.5)^2 = 0.04, perimeter
//   pi * 2.5 * (1 + 0.12 / (10 + sqrt(3.88))) = 7.93271979462562 m.
// Ellipse in the 4 m x 2 m box: a = 2 m, b = 1 m, area 2 * pi = 6.28318530717959 m².
//   h = (1 / 3)^2 = 1/9, perimeter pi * 3 * (1 + (1/3) / (10 + sqrt(11/3))) = 9.68844821613008 m.

function csvRows(csv: string): Record<string, string>[] {
  const [header, ...lines] = csv
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");
  const columns = header!.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]!]));
  });
}

describe("rectangles and non-circular ellipses in CSV", () => {
  it("writes the hand-computed perimeter and area of each shape in metres", () => {
    const rows = csvRows(buildCsv(shapeSession()));
    const pick = ({
      measurement_id,
      type,
      calibration_mode,
      length,
      perimeter,
      area,
      unit,
      area_unit,
    }: Record<string, string>) => ({
      measurement_id,
      type,
      calibration_mode,
      length,
      perimeter,
      area,
      unit,
      area_unit,
    });

    expect(rows.map(pick)).toEqual([
      {
        measurement_id: "rect-xy",
        type: "Rectangle",
        calibration_mode: "xy",
        length: "",
        perimeter: "10.00",
        area: "6.00",
        unit: "m",
        area_unit: "m²",
      },
      {
        measurement_id: "ellipse-xy",
        type: "Ellipse",
        calibration_mode: "xy",
        length: "",
        perimeter: "7.93271979462562",
        area: "4.71238898038469",
        unit: "m",
        area_unit: "m²",
      },
      {
        measurement_id: "rect-uniform",
        type: "Rectangle",
        calibration_mode: "uniform",
        length: "",
        perimeter: "12.00",
        area: "8.00",
        unit: "m",
        area_unit: "m²",
      },
      {
        measurement_id: "ellipse-uniform",
        type: "Ellipse",
        calibration_mode: "uniform",
        length: "",
        perimeter: "9.68844821613008",
        area: "6.28318530717959",
        unit: "m",
        area_unit: "m²",
      },
    ]);
  });

  it("writes the same shapes in feet and square feet", () => {
    const session = shapeSession();
    session.settings.displayUnit = "ft";
    const [rectangle, ellipse] = csvRows(buildCsv(session));

    // 10 m = 10000 / 304.8 ft = 32.8083989501312 ft; 6 m² = 6e6 / 304.8² = 64.5834625002583 ft².
    expect(rectangle).toMatchObject({
      perimeter: "32.8083989501312",
      area: "64.5834625002583",
      unit: "ft",
      area_unit: "ft²",
    });
    // 7932.7197946256 mm / 304.8 = 26.025983578168 ft (the 15th digit is a trailing 0);
    // 4712388.98038469 mm² / 304.8² = 50.7237328335509 ft².
    expect(ellipse).toMatchObject({ perimeter: "26.025983578168", area: "50.7237328335509" });
  });
});

describe("rectangles and non-circular ellipses in JSON", () => {
  it("exports the hand-computed results in millimetres with full precision", () => {
    const measurements = JSON.parse(buildDataJson(shapeSession())).pages[0].measurements as {
      id: string;
      type: string;
      calibrationId: string;
      lengthMm: number | null;
      perimeterMm: number | null;
      areaMm2: number | null;
    }[];
    const byId = Object.fromEntries(measurements.map((entry) => [entry.id, entry]));

    expect(byId["rect-xy"]).toMatchObject({
      type: "rectangle",
      calibrationId: "xy",
      lengthMm: null,
      perimeterMm: 10000,
      areaMm2: 6000000,
    });
    expect(byId["rect-uniform"]).toMatchObject({
      type: "rectangle",
      calibrationId: "uniform",
      lengthMm: null,
      perimeterMm: 12000,
      areaMm2: 8000000,
    });
    expect(byId["ellipse-xy"]).toMatchObject({
      type: "ellipse",
      calibrationId: "xy",
      lengthMm: null,
    });
    expect(byId["ellipse-xy"]!.perimeterMm).toBeCloseTo(7932.7197946256165, 9);
    expect(byId["ellipse-xy"]!.areaMm2).toBeCloseTo(4712388.98038469, 6);
    expect(byId["ellipse-uniform"]).toMatchObject({
      type: "ellipse",
      calibrationId: "uniform",
      lengthMm: null,
    });
    expect(byId["ellipse-uniform"]!.perimeterMm).toBeCloseTo(9688.448216130084, 9);
    expect(byId["ellipse-uniform"]!.areaMm2).toBeCloseTo(6283185.307179586, 6);
  });
});
