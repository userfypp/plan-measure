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
  getMeasurementEmptyMessage,
  shouldRenderMeasurement,
} from "./measurementViewModels";

const measurementPanelCss = readFileSync(
  new URL("./MeasurementPanel.module.css", import.meta.url),
  "utf8",
);
const measurementCollectionCss = readFileSync(
  new URL("./MeasurementCollection.module.css", import.meta.url),
  "utf8",
);
const measurementGroupCss = readFileSync(
  new URL("./MeasurementGroup.module.css", import.meta.url),
  "utf8",
);
const measurementRowCss = readFileSync(
  new URL("./MeasurementRow.module.css", import.meta.url),
  "utf8",
);

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
  nextMeasurementNumber: {
    line: 2,
    polyline: 1,
    polygon: 1,
    rectangle: 1,
    ellipse: 1,
    cloud: 1,
    count: 1,
  },
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

  it("reformats an existing measurement immediately when display precision changes", () => {
    expect(createMeasurementViewModel(page, measurement, "m", false, 2).valueLabel).toBe("1.00 m");
    expect(createMeasurementViewModel(page, measurement, "m", false, 6).valueLabel).toBe(
      "1.000000 m",
    );
    expect(measurement.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("formats decimal imperial and architectural values through the shared view model", () => {
    const baseCalibration = page.calibrations[0]!;
    if (baseCalibration.mode !== "uniform") throw new Error("Expected uniform calibration.");
    const imperialPage: PageState = {
      ...page,
      calibrations: [{ ...baseCalibration, referenceDistanceMm: 3048 }],
    };
    expect(createMeasurementViewModel(imperialPage, measurement, "ft").valueLabel).toBe("10.00 ft");
    expect(createMeasurementViewModel(imperialPage, measurement, "in").valueLabel).toBe(
      "120.00 in",
    );
    expect(createMeasurementViewModel(imperialPage, measurement, "ft-in").valueLabel).toBe("10'");
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
      "Choose Line, Polyline, Polygon, or Count to add a measurement.",
    );
    expect(getMeasurementEmptyMessage({ ...page, activeCalibrationId: null })).toBe(
      "Choose Count, or select an available scale to begin measuring.",
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
});

describe("MeasurementRow accessibility", () => {
  it("shows Count metadata without a missing-scale warning", () => {
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={{
          ...viewModel(),
          type: "count",
          typeLabel: "Count",
          valueLabel: "3 items",
          calibrationSummary: "No scale required",
          hasCalibration: false,
        }}
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
      />,
    );
    expect(markup).toContain('title="Count"');
    expect(markup).not.toContain("No scale required");
    expect(markup).not.toContain("unavailable");
  });

  it("exposes selection and visibility without legacy rename/delete row actions", () => {
    const measurementWithPage = { ...viewModel(), pageLabel: "A-101" };
    const markup = renderToStaticMarkup(
      <MeasurementRow
        viewModel={measurementWithPage}
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
      />,
    );

    expect(markup).toContain('role="listitem"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Select measurement Hallway"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-describedby="measurement-details-line-1"');
    expect(markup).toContain("Line · Main plan · A-101");
    expect(markup).toContain('title="Line · Main plan · A-101"');
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
    const visibleDetails = markup.slice(markup.indexOf('id="measurement-details-polygon-1"'));
    expect(visibleDetails.indexOf(model.name)).toBeLessThan(
      visibleDetails.indexOf(quantityParts[0]!),
    );
    expect(visibleDetails.indexOf(quantityParts[0]!)).toBeLessThan(
      visibleDetails.indexOf(model.typeLabel),
    );
  });

  it("keeps Polygon perimeter architectural while acres changes only the area quantity", () => {
    const polygon: Measurement = {
      ...measurement,
      id: "polygon-acre",
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 66, y: 0 },
        { x: 66, y: 660 },
        { x: 0, y: 660 },
      ],
    };
    const baseCalibration = page.calibrations[0]!;
    if (baseCalibration.mode !== "uniform") throw new Error("Expected uniform calibration.");
    const acrePage: PageState = {
      ...page,
      calibrations: [
        {
          ...baseCalibration,
          end: { x: 1, y: 0 },
          referenceDistanceMm: 1524 / 5,
        },
      ],
    };
    const model = createMeasurementViewModel(acrePage, polygon, "ft-in", false, 2, "ac");
    expect(model.valueLabel).toBe("P 1452' · A 1.00 ac");
  });

  it("keeps quantity alignment and visibility target sizing independent from the optical eye", () => {
    expect(measurementRowCss).toMatch(/\.value\s*\{[^}]*text-align:\s*right;/s);
    // The eye is centred vertically in its column and pinned to its start.
    expect(measurementRowCss).toMatch(
      /\.actions\s*\{[^}]*display:\s*grid;[^}]*align-items:\s*center;[^}]*justify-items:\s*start;/s,
    );
    expect(measurementRowCss).toMatch(
      /\.visibilityButton svg\s*\{[^}]*width:\s*var\(--geometry-icon-size-small\);[^}]*height:\s*var\(--geometry-icon-size-small\);/s,
    );
    expect(measurementRowCss).toMatch(
      /\.actions \.visibilityButton\s*\{[^}]*width:\s*var\(--target-current\);[^}]*height:\s*var\(--target-current\);/s,
    );
  });

  it("extends the row state surface to the container edge without changing row or Eye geometry", () => {
    expect(measurementCollectionCss).toMatch(
      /\.list\s*\{[^}]*--measurement-selection-marker-width:\s*0px;/s,
    );
    expect(measurementCollectionCss).not.toContain("--measurement-row-inline-bleed");
    expect(measurementRowCss).toMatch(
      /\.row::before\s*\{[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(measurementRowCss).toMatch(
      /\.row::after\s*\{[^}]*var\(--tree-row-depth, 0\)[^}]*pointer-events:\s*none;/s,
    );
    expect(measurementRowCss).toMatch(
      /\.row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) calc\(var\(--target-current\) \+ var\(--tree-edge-end, 0px\)\);/s,
    );
    // The eye is a visual square and its own hit area: no ::after bleeds clicks outside it.
    expect(measurementRowCss).toMatch(
      /\.actions \.visibilityButton\s*\{[^}]*width:\s*var\(--target-current\);[^}]*height:\s*var\(--target-current\);/s,
    );
    expect(measurementRowCss).not.toMatch(/\.actions \.visibilityButton\s*\{[^}]*tree-edge-end/s);
    expect(measurementRowCss).not.toContain(".visibilityButton::after");
    expect(measurementRowCss).toMatch(
      /\.glyph\s*\{[^}]*margin-inline-start:\s*calc\(-1 \* var\(--space-4\)\);/s,
    );
  });
});

describe("measurement grouping surfaces", () => {
  it("keeps advanced controls out of the list layout and bounds their responsive popovers", () => {
    expect(measurementPanelCss).toMatch(
      /\.panel\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s,
    );
    expect(measurementPanelCss).toMatch(
      /\.toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto;[^}]*gap:\s*var\(--space-8\);[^}]*padding:\s*var\(--space-8\);[^}]*padding-inline-end:[^;]*var\(--geometry-tree-inset-end\)/s,
    );
    expect(measurementPanelCss).toMatch(
      /\.search\s*\{[^}]*min-height:\s*var\(--control-height-compact\);[^}]*border:\s*var\(--border-width\) solid var\(--color-divider\);[^}]*background:\s*var\(--color-surface-field\);/s,
    );
    // Icon-only triggers with IconButton geometry; an applied filter or grouping looks pressed.
    expect(measurementPanelCss).toMatch(
      /\.toolbarButton\s*\{[^}]*min-width:\s*var\(--control-height-compact\);[^}]*min-height:\s*var\(--control-height-compact\);[^}]*border:\s*var\(--border-width\) solid var\(--color-divider\);[^}]*background:\s*transparent;/s,
    );
    expect(measurementPanelCss).not.toContain(".toolbarButton::after");
    expect(measurementPanelCss).toMatch(
      /\.toolbarButton\.active\s*\{[^}]*border-color:\s*var\(--color-primary\);[^}]*background:\s*var\(--color-selected\);[^}]*color:\s*var\(--color-primary\);/s,
    );
    // One toolbar row at every sidebar width: no wrap rule, no truncated trigger text.
    expect(measurementPanelCss).not.toMatch(
      /max-width: 439px|grouping(Prefix|Name|Count)|filterRow/,
    );
    // Popover bodies: label | control rows sharing one control column, clear action in a footer.
    expect(measurementPanelCss).toMatch(
      /\.fields\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);/s,
    );
    expect(measurementPanelCss).toMatch(/\.field\s*\{[^}]*grid-template-columns:\s*subgrid;/s);
    expect(measurementPanelCss).toMatch(
      /\.popoverFooter\s*\{[^}]*border-top:\s*var\(--border-width\) solid var\(--color-divider\);/s,
    );
    expect(measurementPanelCss).toMatch(
      /\.controlsPopover\s*\{[^}]*width:\s*min\(var\(--geometry-measurement-popover-width\), calc\(100vw - var\(--space-16\)\)\);/s,
    );
    expect(measurementPanelCss).toContain("container-name: measurement-panel");
  });

  it("keeps grouped layout bound to the Measurement Panel container without the old wrap rule", () => {
    expect(measurementPanelCss).toContain("container-name: measurement-panel");
    expect(measurementPanelCss).toContain("container-type: inline-size");
    expect(measurementGroupCss).not.toContain("@container measurement-panel (max-width: 330px)");
  });

  it("keeps Group by out of the header when the catalog has no dimensions", () => {
    const markup = renderToStaticMarkup(
      <MeasurementsHeader
        dimensions={[]}
        groupByDimensionIds={[]}
        onGroupByDimensionsChange={() => undefined}
      />,
    );

    expect(markup).toBe("");
    expect(markup).not.toContain("Group by");
  });

  it("renders Group by options, including archived dimensions, without hijacking select keys", () => {
    const markup = renderToStaticMarkup(
      <MeasurementsHeader
        dimensions={[
          { id: "trade", name: "Trade", archived: false },
          { id: "legacy", name: "Legacy trade", archived: true },
        ]}
        groupByDimensionIds={["trade"]}
        onGroupByDimensionsChange={() => undefined}
      />,
    );

    expect(markup).not.toContain("Measurements");
    expect(markup).not.toContain("<h2");
    expect(markup).not.toContain('aria-label="1 measurements"');
    expect(markup).toContain("Group by");
    expect(markup).toContain('aria-label="Group by"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain(">Trade</span>");
    expect(markup).not.toContain('data-viewer-shortcuts="enabled"');
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
            dimensionLabel: "Trade",
            label: "Electrical",
            archived: true,
            unassigned: false,
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
    expect(markup).toContain('aria-label="Trade · Electrical measurement group"');
    expect(markup).toContain('title="Trade · Electrical (archived)"');
    expect(markup.match(/>Electrical \(archived\)<\/span>/g)).toHaveLength(1);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toMatch(/aria-controls="[^"]+-measurements"/);
    expect(markup).toContain(
      'aria-label="Show all measurements in Trade · Electrical; currently mixed visibility"',
    );
    expect(markup).toContain('data-group-visibility="mixed"');
    expect(markup).toContain('d="M7.92 10h4.17"');
    expect(markup).not.toContain('d="m3.33 3.33 13.33 13.33"');
    expect(markup).not.toContain(">Mixed<");
    expect(markup).toContain('role="listitem"');
    expect(markup).toContain('aria-label="Selected measurement Hallway"');
  });

  it("renders the tree with one-line headers, inset-based indentation and full-width guides", () => {
    expect(measurementGroupCss).not.toMatch(/\.group\s*\{[^}]*border-bottom:/s);
    expect(measurementGroupCss).not.toMatch(
      /rootHeader|headerWithoutMeta|childHeader|deepHeader|uppercase/,
    );
    expect(measurementGroupCss).toMatch(
      /\.header\s*\{[^}]*grid-template-columns:\s*var\(--target-current\) minmax\(0, 1fr\)\s*minmax\(var\(--geometry-tree-count-min-width\), auto\)\s*calc\(var\(--target-current\) \+ var\(--tree-edge-end, 0px\)\);[^}]*min-height:\s*var\(--target-current\)|\.header\s*\{[^}]*min-height:\s*var\(--target-current\);[^}]*grid-template-columns:\s*var\(--target-current\) minmax\(0, 1fr\)\s*minmax\(var\(--geometry-tree-count-min-width\), auto\)\s*calc\(var\(--target-current\) \+ var\(--tree-edge-end, 0px\)\);/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.header\s*\{[^}]*padding-inline:\s*calc\(var\(--geometry-tree-inset-start\) \+ var\(--tree-depth, 0\) \* var\(--tree-indent\)\)\s*0;/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.header\[data-group-depth="0"\]\s*\{[^}]*border-top-color:\s*var\(--color-divider\);/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.groups > \.group:first-of-type > \.header\s*\{[^}]*border-top-color:\s*transparent;/s,
    );
    expect(measurementGroupCss).toMatch(/\.childGroups\s*\{[^}]*position:\s*relative;/s);
    expect(measurementGroupCss).not.toMatch(/\.childGroups\s*\{[^}]*(border|padding)/s);
    expect(measurementGroupCss).toMatch(
      /\.childGroups::after\s*\{[^}]*repeating-linear-gradient[^}]*var\(--color-divider\)[^}]*pointer-events:\s*none;/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.title\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.dimensionName\s*\{[^}]*flex:\s*0 100 auto;[^}]*font-size:\s*var\(--font-size-secondary\);/s,
    );
    expect(measurementGroupCss).toMatch(/\.dimensionName::after\s*\{[^}]*content:\s*":";/s);
    expect(measurementGroupCss).toMatch(
      /\.toggle\s*\{[^}]*border-radius:\s*var\(--radius-control\);/s,
    );
    // Square eye whose cell hugs the button: only the button is clickable.
    expect(measurementGroupCss).toMatch(
      /\.header > :last-child\s*\{[^}]*align-self:\s*center;[^}]*justify-self:\s*start;/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.visibilityControl\s*\{[^}]*width:\s*var\(--target-current\);[^}]*height:\s*var\(--target-current\);/s,
    );
    expect(measurementGroupCss).not.toMatch(/\.visibilityControl\s*\{[^}]*tree-edge-end/s);
    expect(measurementGroupCss).not.toContain(".visibilityControl::after");
    expect(measurementGroupCss).toMatch(
      /\.count\s*\{[^}]*margin-inline:\s*var\(--space-8\);[^}]*text-align:\s*right;/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.list\s*\{[^}]*--tree-row-depth:\s*calc\(var\(--tree-depth, 0\) \+ 1\);[^}]*--measurement-row-content-indent:\s*calc\(\s*var\(--tree-row-depth\) \* var\(--tree-indent\) \+ var\(--space-8\)\s*\);[^}]*--measurement-selection-marker-width:\s*0px;[^}]*padding:\s*0;/s,
    );
    expect(measurementCollectionCss).toMatch(
      /\.collection\s*\{[^}]*--tree-indent:\s*calc\(var\(--target-current\) \/ 2\);/s,
    );
    expect(measurementCollectionCss).toMatch(/\.collection\s*\{[^}]*scrollbar-gutter:\s*auto;/s);
    expect(measurementCollectionCss).toMatch(
      /\.collection\s*\{[^}]*--tree-edge-end:\s*var\(--geometry-tree-inset-end\);/s,
    );
    expect(measurementCollectionCss).not.toContain("edge-reserve");
    expect(measurementGroupCss).not.toMatch(/\.list\s*\{[^}]*border-left:/s);
    expect(measurementRowCss).toMatch(
      /\.selectionMarker\s*\{[^}]*width:\s*var\(\s*--measurement-selection-marker-width,\s*var\(--geometry-measurement-selection-marker-width\)\s*\);/s,
    );
    expect(measurementRowCss).toMatch(
      /\.selection\s*\{[^}]*padding:[^;]*var\(--space-8\)[^;]*calc\(\s*var\(--geometry-tree-inset-start\) \+ var\(--measurement-row-content-indent, var\(--space-8\)\)\s*\);/s,
    );
    expect(measurementRowCss).toMatch(
      /\.selected \.name\s*\{[^}]*font-weight:\s*var\(--font-weight-semibold\);/s,
    );
  });

  it("keeps a collapsed group's controlled list mounted and hidden", () => {
    const markup = renderToStaticMarkup(
      <MeasurementGroup
        group={{
          key: "dimension:trade:value:electrical",
          dimensionLabel: "Trade",
          label: "Electrical",
          archived: false,
          unassigned: false,
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
    expect(markup).toContain('aria-label="Expand Trade · Electrical group"');
    expect(markup).toContain('aria-label="Trade · Electrical measurement group"');
    const controlledId = markup.match(/aria-controls="([^"]+-measurements)"/)?.[1];
    expect(controlledId).toBeTruthy();
    expect(markup).toContain(`id="${controlledId}"`);
    expect(markup).toMatch(new RegExp(`<div id="${controlledId}"[^>]*hidden=""`));
    expect(markup).toContain('d="m7.5 4.17 5.83 5.83 -5.83 5.83"');
    expect(markup).not.toContain("▸");
    expect(markup).not.toContain("▾");
  });

  it('renders a composed None assigned chain as one section folded into "No A · B"', () => {
    const none = (key: string, dimensionLabel: string) => ({
      key,
      dimensionLabel,
      label: "None assigned",
      archived: false,
      unassigned: true,
      measurementIds: ["line-1"],
      visibility: "visible" as const,
    });
    const markup = renderToStaticMarkup(
      <MeasurementCollection
        measurements={[viewModel(true)]}
        emptyMessage="Empty"
        groups={[
          {
            ...none("a:unclassified", "Inside"),
            children: [
              {
                ...none("a:unclassified/b:unclassified", "FDS"),
                children: [none("a:unclassified/b:unclassified/c:unclassified", "GAGRE")],
              },
            ],
          },
        ]}
        groupByDimensionId="inside"
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
        onSetMeasurementsVisibility={() => undefined}
      />,
    );
    expect(markup.match(/<section/g)?.filter(Boolean)).toHaveLength(2); // collection + one group
    expect(markup).toContain("No Inside · FDS · GAGRE");
    expect(markup).not.toContain("None assigned</span>");
  });
});
