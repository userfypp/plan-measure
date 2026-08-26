import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClassificationCatalog, Measurement } from "../../types/domain";
import { ClassificationAssignment } from "./ClassificationAssignment";
import { ClassificationManager } from "./ClassificationManager";
import { MeasurementClassificationDock } from "./MeasurementClassificationDock";
import { ClassificationWorkspace } from "./ClassificationWorkspace";

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "legacy", name: "Legacy", archived: true },
      ],
    },
  ],
};

const measurement: Measurement = {
  id: "line-1",
  type: "line",
  name: "Hallway",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  calibrationId: "scale-1",
  classificationValueIds: ["electrical"],
  visible: true,
};

describe("classification surfaces", () => {
  it("renders catalog dimensions and distinguishes archived values", () => {
    const markup = renderToStaticMarkup(
      <ClassificationManager
        catalog={catalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );
    expect(markup).toContain("Classification catalog");
    expect(markup).toContain("Trade");
    expect(markup).toContain("Electrical");
    expect(markup).toContain("Archived");
    expect(markup).toContain("never change measurement scales");
  });

  it("shows one assignment selector per dimension and preserves an archived assignment", () => {
    const markup = renderToStaticMarkup(
      <ClassificationAssignment
        measurementId="line-1"
        appliedValueIds={["legacy"]}
        catalog={catalog}
        onAssign={() => undefined}
      />,
    );
    expect(markup).toContain("Assigned values");
    expect(markup).toContain("Trade: Legacy (archived)");
    expect(markup).toContain("Unclassified");
  });

  it("renders measurement assignment in its own dock", () => {
    const markup = renderToStaticMarkup(
      <MeasurementClassificationDock
        measurement={measurement}
        catalog={catalog}
        onAssign={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Measurement classification"');
    expect(markup).toContain("Hallway");
    expect(markup).toContain("Trade: Electrical");
    expect(markup).not.toContain("Assigned values");
  });

  it("keeps the classifications workspace focused on catalog management", () => {
    const markup = renderToStaticMarkup(
      <ClassificationWorkspace
        catalog={catalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );

    expect(markup).toContain("Classification catalog");
    expect(markup).toContain("Trade");
    expect(markup).not.toContain("Classification assignment");
    expect(markup).not.toContain("Selected measurement");
  });

  it("generates unique field IDs when multiple assignment instances are mounted", () => {
    const markup = renderToStaticMarkup(
      <>
        <ClassificationAssignment
          measurementId="line-1"
          appliedValueIds={[]}
          catalog={catalog}
          onAssign={() => undefined}
        />
        <ClassificationAssignment
          measurementId="line-1"
          appliedValueIds={[]}
          catalog={catalog}
          onAssign={() => undefined}
        />
      </>,
    );
    const ids = [...markup.matchAll(/<select id="([^"]+)"/g)].map((match) => match[1]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
