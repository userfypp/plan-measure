import { describe, expect, it } from "vitest";
import type { Point } from "../../types/domain";
import { fitToScreen, pageToScreen, screenToPage } from "../../utils/coordinates";
import { lineLengthMm, millimetresPerPageUnit } from "../../utils/geometry";
import { millimetresPerPageUnitForScaleRatio } from "../../utils/pdfUnits";
import { scaleByRatio } from "../../utils/units";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { createPageCalibrationFromRatio } from "./ratioCalibration";
import {
  createStandardScalePreset,
  STANDARD_SCALE_PRESET_RATIOS,
} from "./standardScalePresets";

describe("standard scale presets", () => {
  it.each(STANDARD_SCALE_PRESET_RATIOS)(
    "maps 1:%i to the existing Uniform calibration model",
    (ratio) => {
      const calibration = {
        id: `preset-${ratio}`,
        name: `Scale 1:${ratio}`,
        ...createStandardScalePreset(ratio),
      };

      expect(millimetresPerPageUnit(calibration)).toBeCloseTo(
        millimetresPerPageUnitForScaleRatio(ratio),
        12,
      );
      expect(
        lineLengthMm(
          [
            { x: 0, y: 0 },
            { x: 72, y: 0 },
          ],
          calibration,
        ),
      ).toBeCloseTo(scaleByRatio(ratio, 127, 5), 10);
      expect(scaleDisplayMetadata(calibration).ratioLabel).toBe(`1:${ratio}`);
      expect(createStandardScalePreset(ratio)).toEqual(
        createPageCalibrationFromRatio({ mode: "uniform", denominator: ratio }),
      );
    },
  );

  it("is invariant to fit zoom and viewer size because measurements remain in logical page units", () => {
    const page = { width: 612, height: 792 };
    const calibration = {
      id: "preset-50",
      name: "Scale 1",
      ...createStandardScalePreset(50),
    };
    const pagePoints: [Point, Point] = [
      { x: 100, y: 120 },
      { x: 172, y: 120 },
    ];

    for (const viewer of [
      { width: 480, height: 360 },
      { width: 1440, height: 900 },
    ]) {
      const transform = fitToScreen(page, viewer);
      const recoveredPoints = pagePoints.map((point) =>
        screenToPage(pageToScreen(point, transform), transform),
      ) as [Point, Point];
      expect(lineLengthMm(recoveredPoints, calibration)).toBeCloseTo(1270, 10);
    }
  });
});
