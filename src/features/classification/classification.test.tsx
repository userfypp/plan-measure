import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationAssignment } from "./ClassificationAssignment";
import { ClassificationManager } from "./ClassificationManager";
import { ClassificationWorkspace } from "./ClassificationWorkspace";

const catalog: ClassificationCatalog = {
  dimensions: [{
    id: "trade",
    name: "Trade",
    values: [
      { id: "electrical", name: "Electrical", archived: false },
      { id: "legacy", name: "Legacy", archived: true },
    ],
  }],
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

  it("keeps assignment discoverable inside the classifications workspace", () => {
    const markup = renderToStaticMarkup(
      <ClassificationWorkspace
        catalog={catalog}
        selectedMeasurement={{ id: "line-1", name: "Hallway", classificationValueIds: [] }}
        onAssign={() => undefined}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );

    expect(markup).toContain("Selected measurement");
    expect(markup).toContain("Hallway");
    expect(markup).toContain("Classification assignment");
    expect(markup).toContain("Trade");
    expect(markup).not.toContain("Assigned values");
  });

  it("generates unique field IDs when multiple assignment instances are mounted", () => {
    const markup = renderToStaticMarkup(
      <>
        <ClassificationAssignment measurementId="line-1" appliedValueIds={[]} catalog={catalog} onAssign={() => undefined} />
        <ClassificationAssignment measurementId="line-1" appliedValueIds={[]} catalog={catalog} onAssign={() => undefined} />
      </>,
    );
    const ids = [...markup.matchAll(/<select id="([^"]+)"/g)].map((match) => match[1]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
