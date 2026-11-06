import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationAssignment } from "./ClassificationAssignment";
import { ClassificationManager } from "./ClassificationManager";
import { ClassificationWorkspace } from "./ClassificationWorkspace";

const managerCss = readFileSync(
  new URL("./ClassificationManager.module.css", import.meta.url),
  "utf8",
);

const workspaceCss = readFileSync(
  new URL("./ClassificationWorkspace.module.css", import.meta.url),
  "utf8",
);

const inlineFieldCss = readFileSync(
  new URL("../../components/ui/InlineField.module.css", import.meta.url),
  "utf8",
);
const inputCss = readFileSync(
  new URL("../../components/ui/Input.module.css", import.meta.url),
  "utf8",
);

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "legacy", name: "Legacy", archived: true },
      ],
    },
  ],
};

const archivedCatalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: true,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "plumbing", name: "Plumbing", archived: false },
        { id: "legacy", name: "Legacy", archived: true },
      ],
    },
  ],
};

const largeCatalog: ClassificationCatalog = {
  dimensions: Array.from({ length: 5 }, (_, dimensionIndex) => ({
    id: `dimension-${dimensionIndex}`,
    name: `Long classification dimension ${dimensionIndex} ${"x".repeat(32)}`,
    archived: dimensionIndex === 4,
    values: Array.from({ length: 6 }, (_, valueIndex) => ({
      id: `dimension-${dimensionIndex}-value-${valueIndex}`,
      name: `Long classification value ${dimensionIndex}-${valueIndex} ${"y".repeat(40)}`,
      archived: valueIndex === 5,
    })),
  })),
};

describe("classification surfaces", () => {
  it("renders catalog dimensions and distinguishes active and archived status", () => {
    const markup = renderToStaticMarkup(
      <ClassificationManager
        catalog={catalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onDeleteDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onDeleteValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );
    expect(markup).toContain("Classification catalog");
    expect(markup).toContain("Trade");
    expect(markup).toContain("2 values · 1 archived");
    expect(markup).toContain('aria-label="Actions for dimension Trade"');
    expect(markup).toContain('title="Trade"');
    // Dimensions start closed: the values, their menus and the new-value field wait in the body.
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('aria-expanded="true"');
    expect(markup).not.toContain("Electrical");
    expect(markup).not.toContain('aria-label="Actions for value Electrical"');
    expect(markup).not.toContain('aria-label="New value for Trade"');
    expect(markup).not.toContain("Create dimensions to organize measurements.");
    expect(markup).not.toContain("never change measurement scales");
    expect(markup).not.toContain(">Classifications<");
    expect(markup).not.toContain("active dimensions");
    expect(markup).not.toContain("archived dimensions");
  });

  it("keeps the folding dimensions, value rows and contextual creation styling", () => {
    expect(managerCss).toMatch(
      /\.list\s*\{[^}]*composes:\s*list from "\.\.\/\.\.\/components\/ui\/Disclosure\.module\.css"/s,
    );
    expect(managerCss).toMatch(
      /\.item\s*\{[^}]*composes:\s*item from "\.\.\/\.\.\/components\/ui\/Disclosure\.module\.css"/s,
    );
    // The list sits on the viewer tone; its blocks are the panel's own surface, set apart by 8px of it.
    expect(managerCss).toMatch(
      /\.body\s*\{[^}]*gap:\s*var\(--space-8\);[^}]*padding-block:\s*var\(--space-8\);[^}]*background:\s*var\(--color-surface-viewer\);/s,
    );
    expect(managerCss).not.toMatch(/\.body\s*\{[^}]*padding:/s);
    expect(managerCss).toMatch(/\.valueList\s*\{[^}]*display:\s*grid;[^}]*gap:\s*0;/s);
    expect(managerCss).toMatch(
      /\.valueRow\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*gap:\s*var\(--space-4\);/s,
    );
    expect(managerCss).toMatch(
      /\.valueActions\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s,
    );
    expect(managerCss).toMatch(
      /\.valueOpen,\s*\.valueStatic\s*\{[^}]*min-height:\s*var\(--target-current\);[^}]*padding:\s*var\(--space-4\) var\(--space-8\) var\(--space-4\) calc\(var\(--space-24\) - var\(--border-width\)\);/s,
    );
    // One line per value: the name, then its rule right-aligned, so rows share one height.
    expect(managerCss).toMatch(
      /\.valueText\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*baseline;/s,
    );
    expect(managerCss).toMatch(/\.valueSummary\s*\{[^}]*flex:\s*1 1 0;[^}]*text-align:\s*end;/s);
    expect(managerCss).toMatch(
      /\.valueName\s*\{[^}]*font-size:\s*var\(--font-size-base\);[^}]*font-weight:\s*var\(--font-weight-medium\);/s,
    );
    expect(managerCss).toMatch(
      /\.valueSummary\s*\{[^}]*font-size:\s*var\(--font-size-secondary\);[^}]*font-variant-numeric:\s*tabular-nums;/s,
    );
    for (const retired of [
      ".valueChipTrigger",
      ".valueChipContent",
      ".archivedValueChip",
      ".itemHeader",
      ".itemTitle",
      ".valueSection",
      "flex-wrap",
    ]) {
      expect(managerCss).not.toContain(retired);
    }
    expect(managerCss).not.toContain("@container");
    expect(inlineFieldCss).toMatch(
      /\.row\s*\{[^}]*padding:\s*var\(--space-8\);[^}]*border-block:\s*var\(--border-width\) solid var\(--color-divider\);[^}]*background:\s*var\(--color-surface-panel\);/s,
    );
    expect(inlineFieldCss).toMatch(
      /\.row label\s*\{[^}]*padding-inline:\s*var\(--space-4\);[^}]*font-size:\s*var\(--font-size-heading\);[^}]*font-weight:\s*var\(--font-weight-semibold\);/s,
    );
    // Text in a body sits on the 12px text edge; its controls keep the 8px edge.
    expect(managerCss).toMatch(/\.archivedNote\s*\{[^}]*padding-inline:\s*var\(--space-4\);/s);
    expect(workspaceCss).toMatch(/\.preview\s*\{[^}]*padding-inline:\s*var\(--space-4\);/s);
    expect(workspaceCss).toMatch(/\.confirm > p\s*\{[^}]*padding-inline:\s*var\(--space-4\);/s);
    // The empty state is a block of the panel titled like a list item and a composer.
    expect(workspaceCss).toMatch(
      /\.emptyState\s*\{[^}]*border-block:\s*var\(--border-width\) solid var\(--color-divider\);[^}]*background:\s*var\(--color-surface-panel\);/s,
    );
    expect(workspaceCss).toMatch(
      /\.emptyState h3\s*\{[^}]*font-size:\s*var\(--font-size-heading\);[^}]*line-height:\s*var\(--line-height-heading\);[^}]*font-weight:\s*var\(--font-weight-semibold\);/s,
    );
  });

  it("keeps action menus and create controls compact at the real panel widths", () => {
    expect(managerCss).toMatch(
      /\.menuTrigger\s*\{[^}]*width:\s*var\(--control-height-compact\);[^}]*height:\s*var\(--control-height-compact\);/s,
    );
    expect(inputCss).toMatch(
      /\.row\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0;[^}]*gap:\s*var\(--space-8\);/s,
    );
    expect(inputCss).toMatch(/\.trailing\s*\{[^}]*flex:\s*0 0 auto;[^}]*gap:\s*var\(--space-8\);/s);
    expect(managerCss).not.toContain(".compactInput");
    expect(managerCss).not.toMatch(/\.(inlineForm|inlineLabel|create|renameForm)\b/);
    expect(managerCss).not.toContain("@container (max-width: 320px)");
  });

  it("renders archived dimensions with restore, actions, and preserved-assignment guidance", () => {
    const markup = renderToStaticMarkup(
      <ClassificationManager
        catalog={archivedCatalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onDeleteDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onDeleteValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );

    expect(markup).toContain("Trade");
    expect(markup).toContain("Archived · 3 values");
    expect(markup).toContain('aria-label="Actions for dimension Trade"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Assignments are preserved. Restore to edit or assign.");
    expect(markup).not.toContain("Electrical");
    expect(markup).not.toContain("Legacy");
    expect(markup).not.toContain("Add value");
    expect(markup).not.toContain(">Rename<");
    expect(markup).not.toContain(">Archive<");
    expect(markup).not.toContain("active dimensions");
    expect(markup).not.toContain("archived dimensions");
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
    expect(markup).toContain("aria-haspopup");
  });

  it("marks assignments from an archived dimension without duplicating the suffix", () => {
    const markup = renderToStaticMarkup(
      <ClassificationAssignment
        measurementId="line-1"
        appliedValueIds={["electrical"]}
        catalog={archivedCatalog}
        onAssign={() => undefined}
      />,
    );

    expect(markup).toContain("Trade: Electrical (archived)");
    expect(markup).toContain("Trade (archived)");
    expect(markup).not.toContain("(archived) (archived)");
  });

  it("hides archived dimension selectors without a historical assignment", () => {
    const markup = renderToStaticMarkup(
      <ClassificationAssignment
        measurementId="line-1"
        appliedValueIds={[]}
        catalog={archivedCatalog}
        onAssign={() => undefined}
      />,
    );

    expect(markup).not.toContain("aria-haspopup");
    expect(markup).toContain(
      "Restore a classification dimension in the catalog to assign classifications.",
    );
  });

  it("limits an archived dimension selector to Unclassified and its current value", () => {
    const markup = renderToStaticMarkup(
      <ClassificationAssignment
        measurementId="line-1"
        appliedValueIds={["electrical"]}
        catalog={archivedCatalog}
        onAssign={() => undefined}
      />,
    );

    expect(markup).toContain("aria-haspopup");
    expect(markup).toContain("Trade (archived)");
    expect(markup).toContain("Electrical");
  });

  it("shows the empty catalog assignment message", () => {
    const markup = renderToStaticMarkup(
      <ClassificationAssignment
        measurementId="line-1"
        appliedValueIds={[]}
        catalog={{ dimensions: [] }}
        onAssign={() => undefined}
      />,
    );

    expect(markup).toContain("Create a classification dimension in the catalog first.");
  });

  it("shows the catalog empty state", () => {
    const markup = renderToStaticMarkup(
      <ClassificationManager
        catalog={{ dimensions: [] }}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onDeleteDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onDeleteValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );

    expect(markup).not.toContain("Create dimensions to organize measurements.");
    expect(markup).toContain("New dimension");
    expect(markup).not.toContain("Create a dimension such as Trade, Status, or Area.");
    expect(markup).not.toContain("Create reusable values.");
  });

  it("keeps the classifications workspace focused on catalog management", () => {
    const markup = renderToStaticMarkup(
      <ClassificationWorkspace
        catalog={catalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onDeleteDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onDeleteValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );

    expect(markup).toContain("Classification catalog");
    expect(markup).toContain("Trade");
    expect(markup).not.toContain("Classification assignment");
    expect(markup).not.toContain("Selected measurement");
  });

  it("keeps disabled state on manager controls and assignment selectors", () => {
    const managerMarkup = renderToStaticMarkup(
      <ClassificationManager
        catalog={catalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onDeleteDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onDeleteValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
        disabled
      />,
    );
    const assignmentMarkup = renderToStaticMarkup(
      <ClassificationAssignment
        measurementId="line-1"
        appliedValueIds={["electrical"]}
        catalog={catalog}
        onAssign={() => undefined}
        disabled
      />,
    );

    expect(managerMarkup).toContain('disabled=""');
    expect(assignmentMarkup).toContain('disabled=""');
  });

  it("renders long catalog names and several dimensions without throwing", () => {
    const markup = renderToStaticMarkup(
      <ClassificationManager
        catalog={largeCatalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onDeleteDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onDeleteValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );

    const longDimension = largeCatalog.dimensions[0]!.name;
    const longValue = largeCatalog.dimensions[0]!.values[0]!.name;
    expect(markup).toContain(`title="${longDimension}"`);
    expect(markup).toContain(`aria-label="Actions for dimension ${longDimension}"`);
    expect(markup).not.toContain(`aria-label="New value for ${longDimension}"`);
    expect(markup).not.toContain(`title="${longValue}"`);
    expect(markup).not.toContain(`aria-label="Actions for value ${longValue}"`);
    expect(markup).not.toContain('aria-expanded="true"');
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
    const ids = [...markup.matchAll(/<button[^>]*? id="([^"]+)"/g)].map((match) => match[1]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
