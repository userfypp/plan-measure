// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationAssignment } from "./ClassificationAssignment";
import { ClassificationManager } from "./ClassificationManager";
import { ClassificationWorkspace } from "./ClassificationWorkspace";

const managerCss = readFileSync(new URL("./ClassificationManager.module.css", import.meta.url), "utf8");

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
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
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
    expect(markup).toContain('aria-label="Actions for dimension Trade"');
    expect(markup).toContain('aria-label="Actions for value Electrical"');
    expect(markup).toContain('title="Trade"');
    expect(markup).toContain('title="Electrical"');
    expect(markup).not.toContain("Create dimensions to organize measurements.");
    expect(markup).not.toContain("never change measurement scales");
    expect(markup).not.toContain(">Classifications<");
    expect(markup).not.toContain("active dimensions");
    expect(markup).not.toContain("archived dimensions");
  });

  it("keeps the compact value flow, aligned headings, and contextual creation styling", () => {
    expect(managerCss).toMatch(/\.itemTitle\s*\{[^}]*font-size:\s*var\(--font-size-heading\)/s);
    expect(managerCss).toMatch(
      /\.itemHeader\s*\{[^}]*align-items:\s*center;/s,
    );
    expect(managerCss).toMatch(
      /\.body\s*\{[^}]*padding:\s*0 var\(--space-4\) var\(--space-8\);/s,
    );
    expect(managerCss).toMatch(/\.item\s*\{[^}]*gap:\s*var\(--space-8\);[^}]*padding:\s*var\(--space-8\) var\(--space-4\);/s);
    expect(managerCss).not.toMatch(
      /\.valueSection\s*\{[^}]*padding-inline-start:/s,
    );
    expect(managerCss).toMatch(/\.valueList\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
    expect(managerCss).toMatch(/\.valueList\s*\{[^}]*gap:\s*var\(--space-8\);/s);
    expect(managerCss).toMatch(/\.valueSection\s*\{[^}]*gap:\s*var\(--space-8\);/s);
    expect(managerCss).toMatch(/\.valueList \.valueChipTrigger\s*\{[^}]*min-height:\s*var\(--control-height-compact\)/s);
    expect(managerCss).not.toMatch(/\.item\s*\{[^}]*border:\s*var\(--border-width\) solid/s);
    expect(managerCss).toMatch(
      /\.item \+ \.item\s*\{[^}]*border-top:\s*var\(--border-width\) solid var\(--color-divider\)/s,
    );
    expect(managerCss).toMatch(/\.body\s*\{[^}]*gap:\s*0;/s);
    expect(managerCss).not.toContain("@container (max-width: 640px)");
    expect(managerCss).toContain("@container (max-width: 224px)");
    expect(managerCss).not.toMatch(/\.inlineForm\s*\{[^}]*border-left:/s);
    expect(managerCss).toMatch(
      /\.create\s*\{[^}]*column-gap:\s*var\(--space-8\);[^}]*row-gap:\s*var\(--space-8\);[^}]*padding:\s*var\(--space-8\) var\(--space-4\);[^}]*border-top:\s*var\(--border-width\) solid var\(--color-divider\)/s,
    );
  });

  it("keeps action menus and create controls compact at the real panel widths", () => {
    expect(managerCss).toMatch(
      /\.itemHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s,
    );
    expect(managerCss).toMatch(
      /\.dimensionMenuTrigger\s*\{[^}]*width:\s*var\(--control-height-compact\);[^}]*height:\s*var\(--control-height-compact\);/s,
    );
    expect(managerCss).toMatch(
      /\.inlineForm\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*column-gap:\s*var\(--space-8\);[^}]*row-gap:\s*var\(--space-8\);/s,
    );
    expect(managerCss).toMatch(
      /\.compactInput\s*\{[^}]*min-height:\s*var\(--control-height-compact\);[^}]*padding-inline:\s*var\(--space-8\);/s,
    );
    expect(managerCss).toMatch(
      /\.inlineLabel\s*\{[^}]*position:\s*absolute;[^}]*width:\s*1px;[^}]*height:\s*1px;[^}]*overflow:\s*hidden;[^}]*clip:\s*rect\(0, 0, 0, 0\);/s,
    );
    expect(managerCss).toMatch(/\.create\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
    expect(managerCss).not.toContain("@container (max-width: 320px)");
  });

  it("renders archived dimensions with restore and preserved-assignment guidance only", () => {
    const markup = renderToStaticMarkup(
      <ClassificationManager
        catalog={archivedCatalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />,
    );

    expect(markup).toContain("Trade");
    expect(markup).toContain("Archived");
    expect(markup).toContain("Restore");
    expect(markup).toContain('aria-label="Restore dimension Trade"');
    expect(markup).toContain("Assignments are preserved. Restore to edit or assign.");
    expect(markup).toContain("Electrical");
    expect(markup).toContain("Legacy");
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
    expect(markup).toContain("Unclassified");
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

    expect(markup).not.toContain("<select");
    expect(markup).toContain("Restore a classification dimension in the catalog to assign classifications.");
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

    expect(markup).toContain("<select");
    expect(markup).toContain("Trade (archived)");
    expect(markup).toContain("Unclassified");
    expect(markup).toContain("Electrical");
    expect(markup).not.toContain("Plumbing");
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
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
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
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
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

  it("keeps disabled state on manager controls and assignment selectors", () => {
    const managerMarkup = renderToStaticMarkup(
      <ClassificationManager
        catalog={catalog}
        onCreateDimension={() => undefined}
        onRenameDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={() => undefined}
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
          onArchiveDimension={() => undefined}
          onRestoreDimension={() => undefined}
          onCreateValue={() => undefined}
          onRenameValue={() => undefined}
          onArchiveValue={() => undefined}
          onRestoreValue={() => undefined}
        />,
      );

    const longDimension = largeCatalog.dimensions[0]!.name;
    const longValue = largeCatalog.dimensions[0]!.values[0]!.name;
    expect(markup).toContain(`title="${longDimension}"`);
    expect(markup).toContain(`aria-label="Actions for dimension ${longDimension}"`);
    expect(markup).toContain(`title="New value for ${longDimension}"`);
    expect(markup).toContain(`title="${longValue}"`);
    expect(markup).toContain(`aria-label="Actions for value ${longValue}"`);
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
