/* @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ClassificationCatalog } from "../../types/domain";
import { createEmptySession, sessionReducer } from "../../app/sessionState";
import {
  applyTemplateDimensions,
  CLASSIFICATION_TEMPLATES_STORAGE_KEY,
  readClassificationTemplates,
  templateDimensions,
  validTemplateDimensions,
  writeClassificationTemplates,
} from "./classificationTemplates";

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "old", name: "Old", archived: true },
      ],
    },
    { id: "archived", name: "Archived", archived: true, values: [] },
  ],
};
const dimensions = [
  { name: "trade", values: ["electrical", "Plumbing"] },
  { name: "Floor", values: ["Ground"] },
];
beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("classification templates", () => {
  it("saves only the active structure, without project IDs or assignments, and loads it again", () => {
    const template = {
      id: "template",
      name: "Residential",
      dimensions: templateDimensions(catalog),
    };
    expect(template.dimensions).toEqual([{ name: "Trade", values: ["Electrical"] }]);
    expect(writeClassificationTemplates([template])).toBeNull();
    expect(readClassificationTemplates()).toEqual({ templates: [template], error: null });
    expect(readClassificationTemplates().templates[0]!.dimensions).not.toBe(template.dimensions);
  });

  it.each([
    "{",
    JSON.stringify({ version: 2, templates: [] }),
    JSON.stringify({ version: 1, templates: [null] }),
    JSON.stringify({
      version: 1,
      templates: [{ id: "a", name: "A", dimensions: [{ name: "Trade", values: [12] }] }],
    }),
  ])("reports damaged or unsupported storage without overwriting it: %s", (raw) => {
    window.localStorage.setItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY, raw);
    expect(readClassificationTemplates().error).not.toBeNull();
    expect(window.localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY)).toBe(raw);
  });

  it("reports blocked storage and retains the saved library when a write fails", () => {
    writeClassificationTemplates([{ id: "a", name: "A", dimensions }]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota");
    });
    expect(writeClassificationTemplates([])).not.toBeNull();
    expect(readClassificationTemplates().templates).toHaveLength(1);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    expect(readClassificationTemplates().error).not.toBeNull();
  });

  it("merges matching names preserving existing IDs, archive states and the source catalog", () => {
    let id = 0;
    const result = applyTemplateDimensions(catalog, dimensions, () => `new-${++id}`);
    expect(result.dimensions[0]).toEqual({
      ...catalog.dimensions[0],
      values: [
        ...catalog.dimensions[0]!.values,
        { id: "new-1", name: "Plumbing", archived: false },
      ],
    });
    expect(result.dimensions[1]).toEqual(catalog.dimensions[1]);
    expect(result.dimensions[2]).toEqual({
      id: "new-2",
      name: "Floor",
      archived: false,
      values: [{ id: "new-3", name: "Ground", archived: false }],
    });
    expect(catalog.dimensions).toHaveLength(2);
    expect(catalog.dimensions[0]!.values).toHaveLength(2);
    expect(applyTemplateDimensions(result, dimensions)).toBe(result);
  });

  it("creates independent IDs when reused in different projects", () => {
    const first = applyTemplateDimensions({ dimensions: [] }, dimensions);
    const second = applyTemplateDimensions({ dimensions: [] }, dimensions);
    expect(first.dimensions[0]!.id).not.toBe(second.dimensions[0]!.id);
    expect(first.dimensions[0]!.values[0]!.id).not.toBe(second.dimensions[0]!.values[0]!.id);
  });

  it.each([
    { name: "Archived", values: [] },
    { name: "Trade", values: ["Old"] },
  ])("rejects archived name conflicts atomically", (conflict) => {
    const source = structuredClone(catalog);
    expect(() => applyTemplateDimensions(source, [dimensions[1]!, conflict])).toThrow(/Restore/);
    expect(source).toEqual(catalog);
  });

  it("uses Unicode-normalized case-insensitive name matching", () => {
    const source = { dimensions: [{ id: "d", name: "Café", archived: false, values: [] }] };
    expect(applyTemplateDimensions(source, [{ name: "CAFE\u0301", values: [] }])).toBe(source);
    expect(
      validTemplateDimensions([
        { name: "Café", values: [] },
        { name: "CAFE\u0301", values: [] },
      ]),
    ).toBe(false);
  });

  it("rejects invalid templates, ambiguous project names, and ID collisions", () => {
    expect(() => applyTemplateDimensions(catalog, [{ name: "Trade", values: ["A", "a"] }])).toThrow(
      /invalid/,
    );
    expect(() => applyTemplateDimensions(catalog, dimensions, () => "trade")).toThrow(/unique/);
    expect(() =>
      applyTemplateDimensions(
        { dimensions: [catalog.dimensions[0]!, { ...catalog.dimensions[0]!, id: "duplicate" }] },
        dimensions,
      ),
    ).toThrow(/duplicate/);
  });

  it("integrates as one atomic session command without changing measurements or other project data", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
    session.classificationCatalog = structuredClone(catalog);
    session.pages[1]!.measurements = [
      {
        id: "measurement",
        type: "line",
        name: "Wall",
        calibrationId: "scale",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        classificationValueIds: ["electrical"],
        visible: true,
      },
    ];
    const result = sessionReducer(
      { session, error: null },
      { type: "APPLY_CLASSIFICATION_TEMPLATE", dimensions },
    );
    expect(result.error).toBeNull();
    expect(result.session!.pages).toBe(session.pages);
    expect(result.session!.pdf).toBe(session.pdf);
    expect(result.session!.settings).toBe(session.settings);
    expect(result.session!.classificationCatalog.dimensions).toHaveLength(3);
    const unchanged = sessionReducer(result, { type: "APPLY_CLASSIFICATION_TEMPLATE", dimensions });
    expect(unchanged.session).toBe(result.session);
    const rejected = sessionReducer(
      { session, error: null },
      {
        type: "APPLY_CLASSIFICATION_TEMPLATE",
        dimensions: [...dimensions, { name: "Archived", values: [] }],
      },
    );
    expect(rejected.session).toBe(session);
    expect(rejected.error).toMatch(/Restore/);
  });
});
