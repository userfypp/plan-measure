import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scaleDisplayMetadata } from "../features/viewer/scaleDisplay";
import { readProjectFile } from "../services/projectFile";

// The sample's references sit on the scale bars drawn by scripts/sample/*, so each scale
// must read as the ratio printed on its sheet, not a hand-picked approximation of it.
describe("orchard-house sample project", () => {
  it("calibrates every scale to the exact ratio printed on its scale bar", async () => {
    const file = new Blob([readFileSync("assets/orchard-house-sample.planmeasure")]);
    const { session } = await readProjectFile(file);

    const labels = Object.values(session.pages).flatMap((page) =>
      page.calibrations.map(
        (calibration) =>
          `${page.pageNumber} ${calibration.name}: ${scaleDisplayMetadata(calibration).ratioLabel}`,
      ),
    );

    expect(labels.sort()).toEqual([
      "2 Site 1:200: 1:200",
      "3 Key plan 1:500: 1:500",
      "3 Section A-A: X 1:200 · Y 1:50",
      "3 Terrace detail 1:20: 1:20",
      "4 Ground Floor 1:50: 1:50",
    ]);
  });
});
