import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Measurement, PageState } from "../../types/domain";
import { MeasurementRow } from "./MeasurementRow";
import { SelectionInspector } from "./SelectionInspector";
import {
  createMeasurementViewModel,
  getMeasurementClassificationSummary,
  getMeasurementEmptyMessage,
} from "./measurementViewModels";

const measurement: Measurement = {
  id: "line-1",
  type: "line",
  name: "Hallway",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  calibrationId: "scale-1",
  classificationValueIds: [],
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

function viewModel(selected = false) {
  return createMeasurementViewModel(page, measurement, "m", selected);
}

describe("measurement view models", () => {
  it("keeps the row and inspector presentation independent from domain objects", () => {
    expect(viewModel(true)).toEqual({
      id: "line-1",
      name: "Hallway",
      typeLabel: "Line",
      valueLabel: "1.00 m",
      calibrationSummary: "Main plan · Uniform",
      hasCalibration: true,
      selected: true,
    });
  });

  it("keeps the empty-state guidance local to the current page", () => {
    expect(getMeasurementEmptyMessage(page)).toBe(
      "Choose Line, Polyline, or Polygon to add a measurement.",
    );
    expect(getMeasurementEmptyMessage({ ...page, activeCalibrationId: null })).toBe(
      "Select an available scale to begin measuring.",
    );
  });

  it("formats line, polyline, and polygon selections consistently", () => {
    const polyline: Measurement = {
      ...measurement,
      type: "polyline",
      points: [...measurement.points, { x: 5, y: 5 }],
    };
    const polygon: Measurement = {
      ...measurement,
      type: "polygon",
      points: [...measurement.points, { x: 5, y: 5 }],
    };

    expect(
      [measurement, polyline, polygon].map(
        (candidate) => createMeasurementViewModel(page, candidate, "m").typeLabel,
      ),
    ).toEqual(["Line", "Polyline", "Polygon"]);
  });

  it("keeps every assigned classification in the inspector summary", () => {
    expect(
      getMeasurementClassificationSummary(
        {
          ...measurement,
          classificationValueIds: ["bathroom", "kitchen", "natural-light"],
        },
        {
          dimensions: [
            {
              id: "room",
              name: "Room",
              values: [
                { id: "bathroom", name: "Bathroom", archived: false },
                { id: "kitchen", name: "Kitchen", archived: false },
              ],
            },
            {
              id: "light",
              name: "Lighting",
              values: [{ id: "natural-light", name: "Natural light", archived: true }],
            },
          ],
        },
      ),
    ).toBe("Room: Bathroom · Room: Kitchen · Lighting: Natural light (archived)");
  });
});

describe("MeasurementRow accessibility", () => {
  it("exposes selection and an always-discoverable delete action", () => {
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={viewModel()}
        onSelectMeasurement={() => undefined}
        onRenameMeasurement={() => undefined}
        onDeleteMeasurement={() => undefined}
      />,
    );

    expect(markup).toContain('role="listitem"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Select measurement Hallway"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-describedby="measurement-details-line-1"');
    expect(markup).toContain("Main plan · Uniform");
    expect(markup).toContain('aria-label="Rename Hallway"');
    expect(markup).toContain('aria-label="Delete Hallway"');
    expect(markup).not.toContain('aria-label="Name for Hallway"');
  });

  it("announces the selected state", () => {
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={viewModel(true)}
        onSelectMeasurement={() => undefined}
        onRenameMeasurement={() => undefined}
        onDeleteMeasurement={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Selected measurement Hallway"');
    expect(markup).toContain('aria-pressed="true"');
  });
});

describe("SelectionInspector", () => {
  it("shows only the selected measurement details", () => {
    const markup = renderToStaticMarkup(
      <SelectionInspector
        measurement={viewModel(true)}
        classificationSummary="Trade: Electrical"
      />,
    );

    expect(markup).not.toContain("Selection inspector");
    expect(markup).toContain("Type");
    expect(markup).toContain("Value");
    expect(markup).toContain("Scale / calibration");
    expect(markup).toContain("Trade: Electrical");
    expect(markup).not.toContain("Rename");
    expect(markup).not.toContain("Delete measurement");
    expect(markup).not.toContain("Assigned values");
  });

  it("renders a clear empty state when nothing is selected", () => {
    const markup = renderToStaticMarkup(<SelectionInspector measurement={null} />);

    expect(markup).toContain("Select a measurement to inspect its details.");
  });
});
