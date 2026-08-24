import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Dispatch } from "react";
import { type AppAction } from "../../app/state";
import type { Measurement, PageState } from "../../types/domain";
import { MeasurementItem } from "./MeasurementPanel";

const measurement: Measurement = {
  id: "line-1",
  type: "line",
  name: "Hallway",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  calibrationId: "scale-1",
};

const page: PageState = {
  pageNumber: 1,
  calibrations: [
    {
      id: "scale-1",
      name: "Main plan",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
  ],
  activeCalibrationId: "scale-1",
  nextCalibrationNumber: 2,
  measurements: [measurement],
  nextMeasurementNumber: { line: 2, polyline: 1, polygon: 1 },
};

function renderItem(selected = false): string {
  return renderToStaticMarkup(
    <MeasurementItem
      pageNumber={page.pageNumber}
      page={page}
      measurement={measurement}
      selected={selected}
      displayUnit="m"
      dispatch={vi.fn() as Dispatch<AppAction>}
    />,
  );
}

describe("MeasurementItem accessibility", () => {
  it("exposes a native selection button alongside the editing controls", () => {
    const markup = renderItem();

    expect(markup).toContain('role="listitem"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Select measurement Hallway"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-describedby="measurement-details-line-1"');
    expect(markup).toContain('aria-label="Name for Hallway"');
    expect(markup).toContain('aria-label="Delete Hallway"');
  });

  it("announces the selected state without changing the name or Delete controls", () => {
    const markup = renderItem(true);

    expect(markup).toContain('aria-label="Selected measurement Hallway"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Name for Hallway"');
    expect(markup).toContain('aria-label="Delete Hallway"');
  });
});
