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
    expect(markup).toContain("1 active value");
    expect(markup).not.toContain("1 active values");
    expect(markup).toContain("Rename");
    expect(markup).toContain('aria-label="Rename Trade"');
    expect(markup).toContain("Archive Trade; existing assignments are preserved");
    expect(markup).toContain('title="Trade"');
    expect(markup).toContain('title="Electrical"');
    expect(markup).toContain("never change measurement scales");
    expect(markup).not.toContain(">Classifications<");
    expect(markup).not.toContain("active dimensions");
    expect(markup).not.toContain("archived dimensions");
  });

  it("keeps catalog hierarchy, secondary archive actions, and contextual creation styling", () => {
    expect(managerCss).toMatch(/\.itemText strong\s*\{[^}]*font-size:\s*var\(--font-size-heading\)/s);
    expect(managerCss).toMatch(/\.valueList\s*\{[^}]*border-left:\s*var\(--border-width\) solid var\(--color-divider\)/s);
    expect(managerCss).toMatch(/\.valueItem\s*\{[^}]*font-size:\s*var\(--font-size-secondary\)/s);
    expect(managerCss).toMatch(/\.secondaryAction\s*\{[^}]*font-size:\s*var\(--font-size-secondary\)/s);
    expect(managerCss).toMatch(/\.archiveAction\s*\{[^}]*color:\s*var\(--color-text-secondary\)/s);
    expect(managerCss).toMatch(/\.archiveAction:hover[^}]*color:\s*var\(--color-danger-hover-semantic\)/s);
    expect(managerCss).not.toMatch(/\.item\s*\{[^}]*border:\s*var\(--border-width\) solid/s);
    expect(managerCss).not.toContain("@container (max-width: 640px)");
    expect(managerCss).toContain("@container (max-width: 320px)");
    expect(managerCss).toMatch(/\.inlineForm\s*\{[^}]*border-left:\s*var\(--border-width\) solid var\(--color-divider\)/s);
    expect(managerCss).toMatch(/\.create\s*\{[^}]*border-top:\s*var\(--border-width\) solid var\(--color-divider\)/s);
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

    expect(markup).toContain("2 active values");
    expect(markup).toContain("1 archived");
    expect(markup).toContain("Trade");
    expect(markup).toContain("Archived");
    expect(markup).toContain("Restore");
    expect(markup).toContain('aria-label="Restore dimension Trade"');
    expect(markup).toContain("Existing measurement assignments are preserved.");
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

    expect(markup).toContain("Create a dimension such as Trade, Status, or Area.");
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
    expect(markup).toContain(`aria-label="Rename ${longDimension}"`);
    expect(markup).toContain(`title="${longValue}"`);
    expect(markup).toContain(`aria-label="Rename ${longValue}"`);
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
