import { describe, expect, it } from "vitest";
import { createPageCalibrationFromRatio } from "./ratioCalibration";
import { createScaleCheckStore } from "./scaleCheckState";
import { formatScaleCheckResult, scaleCheckResult } from "./scaleCheck";
import { formatMeasurement } from "../../utils/format";
import { measurementResultsMm } from "../../utils/geometry";
import { pageToScreen, screenToPage, pdfRasterLayout } from "../../utils/coordinates";
import type { PageCalibration, Point, MeasurementDisplayUnit } from "../../types/domain";
import { createEmptySession } from "../../app/sessionState";
import { serializeSession } from "../../services/persistenceCodec";
import { buildDataJson } from "../../services/dataJson";
import { buildCsv } from "../../services/csv";
import { buildSpreadsheet } from "../../services/spreadsheetExport";
import { createProjectFile } from "../../services/projectFile";

const scales: PageCalibration[] = [
  {
    id: "uniform",
    name: "Uniform",
    ...createPageCalibrationFromRatio({ mode: "uniform", denominator: 50 }),
  },
  {
    id: "xy",
    name: "X/Y",
    ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 80, yDenominator: 30 }),
  },
];
const points: [Point, Point] = [
  { x: 20, y: 30 },
  { x: 140, y: 90 },
];

describe("scale check calculations", () => {
  it.each(scales)("uses Line's calculation and formatting for $mode", (scale) => {
    const line = { type: "line" as const, points };
    const measured = measurementResultsMm(line, scale).lengthMm!;
    const result = scaleCheckResult(points, scale, measured / 2);
    expect(result).toEqual({
      measuredMm: measured,
      realMm: measured / 2,
      differenceMm: measured / 2,
      percentageDifference: 100,
    });
    for (const unit of ["mm", "cm", "m", "in", "ft", "ft-in"] as MeasurementDisplayUnit[]) {
      for (const decimals of [0, 2, 6] as const) {
        const formatted = formatScaleCheckResult(result, unit, decimals);
        expect(formatted.measured).toBe(formatMeasurement(line, scale, unit, decimals));
        expect(formatted.difference.startsWith("+")).toBe(true);
        expect(formatted.percentage).toBe(`+${(100).toFixed(decimals)}%`);
        expect(
          formatScaleCheckResult(
            scaleCheckResult(points, scale, measured * 2),
            unit,
            decimals,
          ).difference.startsWith("−"),
        ).toBe(true);
      }
    }
    expect(scaleCheckResult(points, scale, measured).percentageDifference).toBe(0);
    expect(scaleCheckResult(points, scale, measured * 2).percentageDifference).toBe(-50);
  });
  it.each([0, 90, 180, 270])(
    "is independent of zoom and DPR on a page rotated %i degrees",
    (rotation) => {
      // Coordinates already belong to the intrinsic rotated PDF viewport, just as Line's do.
      const rotated: [Point, Point] = points.map(({ x, y }) =>
        rotation === 90
          ? { x: 300 - y, y: x }
          : rotation === 180
            ? { x: 300 - x, y: 300 - y }
            : rotation === 270
              ? { x: y, y: 300 - x }
              : { x, y },
      ) as [Point, Point];
      for (const scale of scales) {
        const expected = measurementResultsMm({ type: "line", points: rotated }, scale).lengthMm!;
        for (const zoom of [0.25, 1, 4])
          for (const dpr of [1, 2, 3]) {
            pdfRasterLayout({ width: 300, height: 300 }, { zoom, panX: 25, panY: -15 }, dpr);
            const transform = { zoom, panX: 25, panY: -15 };
            const selected = rotated.map((point) =>
              screenToPage(pageToScreen(point, transform), transform),
            ) as [Point, Point];
            expect(scaleCheckResult(selected, scale, 1000).measuredMm).toBe(expected);
          }
      }
    },
  );
  it("rejects zero, negative, nonfinite and zero-length input; handles extreme finite distances", () => {
    for (const value of [0, -1, NaN, Infinity, -Infinity])
      expect(() => scaleCheckResult(points, scales[0]!, value)).toThrow(RangeError);
    expect(() => scaleCheckResult([points[0], points[0]], scales[0]!, 1)).toThrow(
      "Choose two distinct calibration points.",
    );
    for (const tiny of [Number.MIN_VALUE, 1e-300, 1e-20]) {
      const result = scaleCheckResult(points, scales[0]!, tiny);
      expect(result.percentageDifference).toBeNull();
      expect(formatScaleCheckResult(result, "m", 2).percentage).toContain("Unavailable");
    }
    const huge = scaleCheckResult(points, scales[0]!, 1e300);
    expect(huge.percentageDifference).toBe(-100);
    expect(formatScaleCheckResult(huge, "ft-in", 2).difference).not.toMatch(/Infinity|NaN/);
  });
});

describe("scale check export boundary", () => {
  it("leaves session, CSV, XLSX, ODS, JSON and project archive structurally identical", async () => {
    const session = createEmptySession({ name: "scale.pdf", size: 4, lastModified: 1 }, 1);
    session.pages[1]!.calibrations = scales;
    session.pages[1]!.activeCalibrationId = scales[0]!.id;
    session.pages[1]!.measurements = [
      {
        id: "line",
        name: "Line 1",
        type: "line",
        points,
        calibrationId: scales[0]!.id,
        visible: true,
        classificationValueIds: [],
      },
    ];
    const pdf = new Blob(["%PDF"]);
    async function exports() {
      return {
        json: buildDataJson(session),
        persisted: serializeSession(session),
        csv: buildCsv(session),
        xlsx: await buildSpreadsheet("xlsx", session),
        ods: await buildSpreadsheet("ods", session),
        project: new Uint8Array(await createProjectFile(session, pdf).arrayBuffer()),
      };
    }
    const before = structuredClone(session);
    const exported = await exports();
    const store = createScaleCheckStore();
    store.begin({
      pageNumber: 1,
      workspaceVersion: 0,
      activeCalibrationId: scales[0]!.id,
      calibration: scales[0]!,
    });
    store.select(points);
    store.complete(1234);
    expect(session).toEqual(before);
    expect(await exports()).toEqual(exported);
    store.clear();
    expect(session).toEqual(before);
    expect(store.getSnapshot()).toBeNull();
  });
});
