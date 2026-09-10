// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Measurement, PageState } from "../../types/domain";
import { MeasurementCollection } from "./MeasurementCollection";
import { MeasurementGroup } from "./MeasurementGroup";
import { MeasurementRow } from "./MeasurementRow";
import { MeasurementsHeader } from "./MeasurementsHeader";
import {
  createMeasurementViewModel,
  getMeasurementClassificationSummary,
  getMeasurementEmptyMessage,
  shouldRenderMeasurement,
} from "./measurementViewModels";

const measurementPanelCss = readFileSync(new URL("./MeasurementPanel.module.css", import.meta.url), "utf8");
const measurementCollectionCss = readFileSync(
  new URL("./MeasurementCollection.module.css", import.meta.url),
  "utf8",
);
const measurementGroupCss = readFileSync(new URL("./MeasurementGroup.module.css", import.meta.url), "utf8");
const measurementRowCss = readFileSync(new URL("./MeasurementRow.module.css", import.meta.url), "utf8");

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
  it("keeps row presentation independent from domain objects", () => {
    expect(viewModel(true)).toEqual({
      id: "line-1",
      type: "line",
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
  it("exposes selection and visibility without legacy rename/delete row actions", () => {
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={viewModel()}
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
      />,
    );

    expect(markup).toContain('role="listitem"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Select measurement Hallway"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-describedby="measurement-details-line-1"');
    expect(markup).toContain("Line · Main plan");
    expect(markup).not.toContain('aria-label="Rename Hallway"');
    expect(markup).not.toContain('aria-label="Delete Hallway"');
    expect(markup).toContain('aria-label="Hide measurement Hallway"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('aria-label="Name for Hallway"');
  });

  it("announces the selected state", () => {
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={viewModel(true)}
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
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
        onToggleVisibility={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Show measurement Hallway"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Select measurement Hallway"');
  });

  it("keeps Polygon perimeter and area values intact while exposing them as compact quantity lines", () => {
    const polygon: Measurement = {
      ...measurement,
      id: "polygon-1",
      type: "polygon",
      name: "Room",
      points: [...measurement.points, { x: 10, y: 10 }],
    };
    const model = createMeasurementViewModel(page, polygon, "m", false);
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={model}
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
      />,
    );

    const quantityParts = model.valueLabel.split(" · ");
    expect(quantityParts).toHaveLength(2);
    expect(markup).toContain(`>${quantityParts[0]}<`);
    expect(markup).toContain(`>${quantityParts[1]}<`);
    expect(markup.indexOf(model.name)).toBeLessThan(markup.indexOf(quantityParts[0]!));
    expect(markup.indexOf(quantityParts[0]!)).toBeLessThan(markup.indexOf(model.typeLabel));
  });

  it("keeps quantity alignment and visibility target sizing independent from the optical eye", () => {
    expect(measurementRowCss).toMatch(/\.value\s*\{[^}]*text-align:\s*right;/s);
    expect(measurementRowCss).toMatch(/\.visibilityButton svg\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/s);
    expect(measurementRowCss).toMatch(
      /\.actions \.visibilityButton\s*\{[^}]*width:\s*var\(--target-current\);[^}]*height:\s*var\(--target-current\);/s,
    );
  });

  it("extends only the ungrouped row state surface without changing row or Eye geometry", () => {
    expect(measurementCollectionCss).toMatch(
      /\.list\s*\{[^}]*--measurement-row-inline-bleed:\s*var\(--space-8\);/s,
    );
    expect(measurementRowCss).toMatch(
      /\.row::before\s*\{[^}]*inset:\s*0 calc\(-1 \* var\(--measurement-row-inline-bleed, 0px\)\);[^}]*pointer-events:\s*none;/s,
    );
    expect(measurementRowCss).toMatch(
      /\.row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) var\(--target-current\);/s,
    );
    expect(measurementRowCss).toMatch(
      /\.actions \.visibilityButton\s*\{[^}]*width:\s*var\(--target-current\);[^}]*height:\s*var\(--target-current\);/s,
    );
  });
});

describe("measurement grouping surfaces", () => {
  it("keeps grouped layout bound to the Measurement Panel container without the old wrap rule", () => {
    expect(measurementPanelCss).toContain("container-name: measurement-panel");
    expect(measurementPanelCss).toContain("container-type: inline-size");
    expect(measurementGroupCss).not.toContain("@container measurement-panel (max-width: 330px)");
  });

  it("keeps Group by out of the header when the catalog has no dimensions", () => {
    const markup = renderToStaticMarkup(
      <MeasurementsHeader
        dimensions={[]}
        groupByDimensionId={null}
        onGroupByDimensionChange={() => undefined}
      />,
    );

    expect(markup).toBe("");
    expect(markup).not.toContain("Group by");
  });

  it("renders Group by options, including archived dimensions, with viewer shortcuts enabled", () => {
    const markup = renderToStaticMarkup(
      <MeasurementsHeader
        dimensions={[
          { id: "trade", name: "Trade", archived: false },
          { id: "legacy", name: "Legacy trade", archived: true },
        ]}
        groupByDimensionId="trade"
        onGroupByDimensionChange={() => undefined}
      />,
    );

    expect(markup).not.toContain("Measurements");
    expect(markup).not.toContain("<h2");
    expect(markup).not.toContain('aria-label="1 measurements"');
    expect(markup).toContain("Group by");
    expect(markup).toContain("<select");
    expect(markup).toContain('<option value="">None</option>');
    expect(markup).toContain('<option value="trade" selected="">Trade</option>');
    expect(markup).toContain("Legacy trade (archived)");
    expect(markup).toContain('data-viewer-shortcuts="enabled"');
  });

  it("retains the flat MeasurementRow markup", () => {
    const markup = renderToStaticMarkup(
      <MeasurementCollection
        measurements={[viewModel(true)]}
        emptyMessage="Empty"
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
      />,
    );

    expect(markup).toContain('role="list"');
    expect(markup).toContain('role="listitem"');
    expect(markup).toContain('aria-label="Selected measurement Hallway"');
  });

  it("renders a compact accessible grouped header with one bulk visibility control", () => {
    const markup = renderToStaticMarkup(
      <MeasurementCollection
        key="trade"
        measurements={[viewModel(true)]}
        emptyMessage="Empty"
        groups={[
          {
            key: "dimension:trade:value:electrical",
            label: "Electrical",
            archived: true,
            measurementIds: ["line-1"],
            visibility: "mixed",
          },
        ]}
        groupByDimensionId="trade"
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
        onSetMeasurementsVisibility={() => undefined}
      />,
    );

    expect(markup).toContain("Electrical (archived)");
    expect(markup.match(/\(archived\)/g)).toHaveLength(1);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toMatch(/aria-controls="[^"]+-measurements"/);
    expect(markup).toContain(
      'aria-label="Show all measurements in Electrical; currently mixed visibility"',
    );
    expect(markup).toContain('data-group-visibility="mixed"');
    expect(markup).toContain('d="M9.5 12h5"');
    expect(markup).not.toContain('d="m4 4 16 16"');
    expect(markup).not.toContain(">Mixed<");
    expect(markup).toContain('role="listitem"');
    expect(markup).toContain('aria-label="Selected measurement Hallway"');
  });

  it("keeps grouped hierarchy compact and removes only the grouped selection marker", () => {
    expect(measurementGroupCss).toMatch(
      /\.header\s*\{[^}]*grid-template-columns:\s*var\(--target-current\) minmax\(0, 1fr\) auto var\(--target-current\);/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.list\s*\{[^}]*--measurement-selection-marker-width:\s*0px;[^}]*padding-left:\s*var\(--space-8\);/s,
    );
    expect(measurementGroupCss).not.toMatch(/\.list\s*\{[^}]*border-left:/s);
    expect(measurementRowCss).toMatch(
      /\.selectionMarker\s*\{[^}]*width:\s*var\(--measurement-selection-marker-width, 3px\);/s,
    );
    expect(measurementRowCss).toMatch(/\.selected \.name\s*\{[^}]*font-weight:\s*var\(--font-weight-semibold\);/s);
  });

  it("keeps a collapsed group's controlled list mounted and hidden", () => {
    const markup = renderToStaticMarkup(
      <MeasurementGroup
        group={{
          key: "dimension:trade:value:electrical",
          label: "Electrical",
          archived: false,
          measurementIds: ["line-1"],
          visibility: "visible",
        }}
        measurements={[viewModel(true)]}
        collapsed
        onToggleCollapsed={() => undefined}
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
        onSetMeasurementsVisibility={() => undefined}
      />,
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Expand Electrical group"');
    const controlledId = markup.match(/aria-controls="([^"]+-measurements)"/)?.[1];
    expect(controlledId).toBeTruthy();
    expect(markup).toContain(`id="${controlledId}"`);
    expect(markup).toMatch(new RegExp(`<div id="${controlledId}"[^>]*hidden=""`));
    expect(markup).toContain('d="m9 5 7 7-7 7"');
    expect(markup).not.toContain("▸");
    expect(markup).not.toContain("▾");
  });
});
