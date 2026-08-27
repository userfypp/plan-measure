import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Measurement, PageState } from "../../types/domain";
import { MeasurementRow } from "./MeasurementRow";
import { SelectionInspector } from "./SelectionInspector";
import {
  createMeasurementViewModel,
  getMeasurementClassificationSummary,
  getMeasurementEmptyMessage,
  shouldRenderMeasurement,
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
  visible: true,
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

function viewModel(selected = false, candidate = measurement) {
  return createMeasurementViewModel(page, candidate, "m", selected);
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
      visible: true,
      selected: true,
    });
  });

  it("keeps hidden measurements in the collection and only renders visible ones", () => {
    const hidden = { ...measurement, id: "hidden-line", visible: false };
    const models = [
      ...[measurement, hidden].map((candidate) => createMeasurementViewModel(page, candidate, "m")),
    ];

    expect(models.map((model) => model.id)).toEqual(["line-1", "hidden-line"]);
    expect(shouldRenderMeasurement(measurement, true)).toBe(true);
    expect(shouldRenderMeasurement(hidden, true)).toBe(false);
    expect(shouldRenderMeasurement(measurement, false)).toBe(false);
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
              archived: false,
              values: [
                { id: "bathroom", name: "Bathroom", archived: false },
                { id: "kitchen", name: "Kitchen", archived: false },
              ],
            },
            {
              id: "light",
              name: "Lighting",
              archived: false,
              values: [{ id: "natural-light", name: "Natural light", archived: true }],
            },
          ],
        },
      ),
    ).toBe("Room: Bathroom · Room: Kitchen · Lighting: Natural light (archived)");
  });

  it("marks values as archived when their dimension is archived without duplicating the suffix", () => {
    const archivedDimension = {
      id: "trade",
      name: "Trade",
      archived: true,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "legacy-electrical", name: "Electrical", archived: true },
      ],
    };

    expect(
      getMeasurementClassificationSummary(
        { ...measurement, classificationValueIds: ["electrical"] },
        { dimensions: [archivedDimension] },
      ),
    ).toBe("Trade: Electrical (archived)");
    expect(
      getMeasurementClassificationSummary(
        { ...measurement, classificationValueIds: ["legacy-electrical"] },
        { dimensions: [archivedDimension] },
      ),
    ).toBe("Trade: Electrical (archived)");
  });
});

describe("MeasurementRow accessibility", () => {
  it("exposes selection and an always-discoverable delete action", () => {
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={viewModel()}
        onSelectMeasurement={() => undefined}
        onRenameMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
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
    expect(markup).toContain('aria-label="Hide measurement Hallway"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('aria-label="Name for Hallway"');
  });

  it("announces the selected state", () => {
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={viewModel(true)}
        onSelectMeasurement={() => undefined}
        onRenameMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
        onDeleteMeasurement={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Selected measurement Hallway"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("announces the action to restore a hidden measurement", () => {
    const hidden = { ...measurement, visible: false };
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={viewModel(false, hidden)}
        onSelectMeasurement={() => undefined}
        onRenameMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
        onDeleteMeasurement={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Show measurement Hallway"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Select measurement Hallway"');
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
