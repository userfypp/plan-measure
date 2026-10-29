import { describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession, Measurement } from "../types/domain";
import { buildCsv, buildCsvInBatches } from "./csv";
import { buildDataJson } from "./dataJson";

// X/Y scale: 100 mm per unit across, 200 mm per unit down. A 30 × 10 unit box is 3 m × 2 m.
function session(measurements: Measurement[]): CurrentSession {
  const created = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
  created.pages[1]!.calibrations = [
    {
      id: "xy",
      name: "XY",
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 2000 },
    },
  ];
  created.pages[1]!.measurements = measurements;
  return created;
}

const BOX = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 10 },
  { x: 0, y: 10 },
];
const shape = (id: string, type: "rectangle" | "ellipse"): Measurement => ({
  id,
  name: id,
  type,
  points: BOX,
  calibrationId: "xy",
  classificationValueIds: [],
  visible: true,
});

// Ellipse with semi-axes a = 1.5 m and b = 1 m: area πab and Ramanujan's second perimeter
// approximation π(a + b)(1 + 3h / (10 + √(4 − 3h))), with h = ((a − b) / (a + b))².
const A = 1.5;
const B = 1;
const H = ((A - B) / (A + B)) ** 2;
const ELLIPSE_AREA_M2 = Math.PI * A * B; // 4.712388980384690
const ELLIPSE_PERIMETER_M = Math.PI * (A + B) * (1 + (3 * H) / (10 + Math.sqrt(4 - 3 * H))); // 7.93271979462562

function rows(csv: string) {
  const [header, ...lines] = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  const columns = header!.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  });
}

describe("rectangle and X/Y ellipse exports", () => {
  it("writes hand-computed perimeter and area to CSV in metres", () => {
    const [rectangle, ellipse] = rows(
      buildCsv(session([shape("rectangle", "rectangle"), shape("ellipse", "ellipse")])),
    );

    expect(rectangle).toMatchObject({
      type: "Rectangle",
      length: "",
      perimeter: "10.00",
      area: "6.00",
      unit: "m",
      area_unit: "m²",
    });
    expect(ellipse).toMatchObject({ type: "Ellipse", length: "" });
    expect(Number(ellipse!.perimeter)).toBeCloseTo(ELLIPSE_PERIMETER_M, 12);
    expect(Number(ellipse!.area)).toBeCloseTo(ELLIPSE_AREA_M2, 12);
  });

  it("writes the same values to JSON in millimetres", () => {
    const data = JSON.parse(
      buildDataJson(session([shape("rectangle", "rectangle"), shape("ellipse", "ellipse")])),
    );
    const [rectangle, ellipse] = data.pages[0].measurements;

    expect(rectangle).toMatchObject({ lengthMm: null, perimeterMm: 10_000, areaMm2: 6_000_000 });
    expect(ellipse.lengthMm).toBeNull();
    expect(ellipse.perimeterMm).toBeCloseTo(ELLIPSE_PERIMETER_M * 1000, 9);
    expect(ellipse.areaMm2).toBeCloseTo(ELLIPSE_AREA_M2 * 1e6, 6);
  });
});

describe("CSV batches", () => {
  it("writes a final partial batch: 201 rows match the single-pass CSV", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const rectangles = Array.from({ length: 201 }, (_, index) =>
      shape(`rectangle-${index}`, "rectangle"),
    );
    const yieldToMain = vi.fn(async () => {});

    const batched = await buildCsvInBatches(session(rectangles), null, undefined, yieldToMain);

    expect(batched).toBe(buildCsv(session(rectangles)));
    expect(rows(batched)).toHaveLength(201);
    expect(rows(batched).at(-1)).toMatchObject({ measurement_id: "rectangle-200" });
    // One yield after the first 200 rows; the last row is flushed without waiting.
    expect(yieldToMain).toHaveBeenCalledTimes(1);
  });
});
