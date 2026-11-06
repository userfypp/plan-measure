/* @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ClassificationCatalog, ClassificationValueRates } from "../../types/domain";
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
  { name: "trade", values: ["electrical", "Plumbing"], rates: [] },
  { name: "Floor", values: ["Ground"], rates: [] },
];
const wallDerivation = { source: "length", factorMm: 2700 } as const;
const wallPrice = { amount: 25, basis: "derived", unit: "m²" } as const;
const wallRates = { value: "Wall", derivation: wallDerivation, price: wallPrice };
const projectCatalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "wall", name: "Wall", archived: false },
        { id: "slab", name: "Slab", archived: false },
      ],
    },
  ],
};
const slabRates: ClassificationValueRates = {
  valueId: "slab",
  derivation: { source: "area", factorMm: 150 },
  price: null,
};
const wallEntry: ClassificationValueRates = {
  valueId: "wall",
  derivation: wallDerivation,
  price: wallPrice,
};
const wallTemplate = {
  currency: "EUR",
  dimensions: [{ name: "Trade", values: ["Wall"], rates: [wallRates] }],
};
beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function validLibrary() {
  return {
    version: 2,
    templates: [
      {
        id: "a",
        name: "Residential",
        currency: "EUR",
        dimensions: [{ name: "Trade", values: ["Wall"], rates: [structuredClone(wallRates)] }],
      },
    ],
  };
}
type Library = ReturnType<typeof validLibrary>;
const firstDimension = (library: Library) =>
  library.templates[0]!.dimensions[0]! as Record<string, unknown>;
const firstRates = (library: Library) =>
  (firstDimension(library).rates as Record<string, unknown>[])[0]!;

describe("classification templates", () => {
  it("saves only the active structure and its rates, without project IDs or assignments, and loads it again", () => {
    const rates: ClassificationValueRates[] = [
      {
        valueId: "electrical",
        derivation: { source: "length", factorMm: 2700 },
        price: { amount: 25, basis: "derived", unit: "m²" },
      },
      { valueId: "old", derivation: { source: "area", factorMm: 150 }, price: null },
    ];
    const template = {
      id: "template",
      name: "Residential",
      currency: "EUR",
      dimensions: templateDimensions(catalog, rates),
    };
    expect(template.dimensions).toEqual([
      {
        name: "Trade",
        values: ["Electrical"],
        rates: [
          {
            value: "Electrical",
            derivation: { source: "length", factorMm: 2700 },
            price: { amount: 25, basis: "derived", unit: "m²" },
          },
        ],
      },
    ]);
    expect(writeClassificationTemplates([template])).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY)!)).toEqual({
      version: 2,
      templates: [template],
    });
    expect(readClassificationTemplates()).toEqual({ templates: [template], error: null });
    expect(readClassificationTemplates().templates[0]!.dimensions).not.toBe(template.dimensions);
  });

  it("reads a version 1 library without losing anything and writes version 2 afterwards", () => {
    const v1 =
      '{"version":1,"templates":[{"id":"a","name":"Residential","dimensions":[' +
      '{"name":"Trade","values":["Electrical","Plumbing"]},{"name":"Floor","values":[]}]}]}';
    window.localStorage.setItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY, v1);
    const { templates, error } = readClassificationTemplates();
    expect(error).toBeNull();
    expect(templates).toEqual([
      {
        id: "a",
        name: "Residential",
        currency: null,
        dimensions: [
          { name: "Trade", values: ["Electrical", "Plumbing"], rates: [] },
          { name: "Floor", values: [], rates: [] },
        ],
      },
    ]);
    expect(window.localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY)).toBe(v1);
    writeClassificationTemplates(templates);
    expect(JSON.parse(window.localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY)!)).toEqual({
      version: 2,
      templates,
    });
  });

  it("reads the valid version 2 library used as the baseline of the invalid cases", () => {
    window.localStorage.setItem(
      CLASSIFICATION_TEMPLATES_STORAGE_KEY,
      JSON.stringify(validLibrary()),
    );
    expect(readClassificationTemplates()).toEqual({
      templates: validLibrary().templates,
      error: null,
    });
  });

  it.each<[string, (library: Library) => unknown]>([
    ["unknown version", (library) => ({ ...library, version: 3 })],
    ["currency in lower case", (library) => ((library.templates[0]!.currency = "eur"), library)],
    [
      "currency with four letters",
      (library) => ((library.templates[0]!.currency = "EURO"), library),
    ],
    ["numeric currency", (library) => ((library.templates[0]!.currency = 978 as never), library)],
    [
      "missing currency",
      (library) => (delete (library.templates[0] as Record<string, unknown>).currency, library),
    ],
    ["rates that are not a list", (library) => ((firstDimension(library).rates = {}), library)],
    ["missing rates", (library) => (delete firstDimension(library).rates, library)],
    ["null rates entry", (library) => ((firstDimension(library).rates = [null]), library)],
    [
      "rates for a value outside the dimension",
      (library) => ((firstRates(library).value = "Door"), library),
    ],
    [
      "rates for the same value twice",
      (library) => ((firstDimension(library).rates = [wallRates, wallRates]), library),
    ],
    [
      "factor of zero",
      (library) => ((firstRates(library).derivation = { source: "length", factorMm: 0 }), library),
    ],
    [
      "negative factor",
      (library) => ((firstRates(library).derivation = { source: "length", factorMm: -1 }), library),
    ],
    [
      "textual factor",
      (library) => (
        (firstRates(library).derivation = { source: "length", factorMm: "2700" }),
        library
      ),
    ],
    [
      "non-finite factor",
      (library) => (
        (firstRates(library).derivation = { source: "length", factorMm: null }),
        library
      ),
    ],
    [
      "derivation from a count",
      (library) => (
        (firstRates(library).derivation = { source: "count", factorMm: 2700 }),
        library
      ),
    ],
    [
      "negative amount",
      (library) => ((firstRates(library).price = { ...wallPrice, amount: -0.01 }), library),
    ],
    [
      "textual amount",
      (library) => ((firstRates(library).price = { ...wallPrice, amount: "25" }), library),
    ],
    [
      "non-finite amount",
      (library) => ((firstRates(library).price = { ...wallPrice, amount: null }), library),
    ],
    [
      "unknown basis",
      (library) => ((firstRates(library).price = { ...wallPrice, basis: "volume" }), library),
    ],
    [
      "unit incompatible with the derivation",
      (library) => ((firstRates(library).price = { ...wallPrice, unit: "m³" }), library),
    ],
    [
      "each unit on a length price",
      (library) => (
        (firstRates(library).price = { amount: 25, basis: "length", unit: "each" }),
        library
      ),
    ],
    [
      "derived price without a derivation",
      (library) => ((firstRates(library).derivation = null), library),
    ],
    [
      "neither derivation nor price",
      (library) => (
        (firstRates(library).derivation = null),
        (firstRates(library).price = null),
        library
      ),
    ],
  ])("reports invalid rates without overwriting the storage: %s", (_label, mutate) => {
    const raw = JSON.stringify(mutate(validLibrary()));
    window.localStorage.setItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY, raw);
    expect(readClassificationTemplates()).toEqual({
      templates: [],
      error: "Saved templates could not be loaded. Your project is still available.",
    });
    expect(window.localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY)).toBe(raw);
  });

  it.each([
    "{",
    JSON.stringify({ version: 3, templates: [] }),
    JSON.stringify({ version: 1, templates: [null] }),
    JSON.stringify({ version: 2, templates: [null] }),
    JSON.stringify({
      version: 1,
      templates: [{ id: "a", name: "A", dimensions: [{ name: "Trade", values: [12] }] }],
    }),
  ])("reports damaged or unsupported storage without overwriting it: %s", (raw) => {
    window.localStorage.setItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY, raw);
    expect(readClassificationTemplates().error).not.toBeNull();
    expect(window.localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY)).toBe(raw);
  });

  it("rejects the whole library when one template is invalid", () => {
    const library = validLibrary();
    library.templates.push({ ...library.templates[0]!, id: "b", name: "Other", currency: "eur" });
    window.localStorage.setItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY, JSON.stringify(library));
    expect(readClassificationTemplates().templates).toEqual([]);
    expect(readClassificationTemplates().error).not.toBeNull();
  });

  it("reports blocked storage and retains the saved library when a write fails", () => {
    writeClassificationTemplates([{ id: "a", name: "A", currency: null, dimensions }]);
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
    const template = { currency: null, dimensions };
    const { catalog: result } = applyTemplateDimensions(
      catalog,
      [],
      null,
      template,
      () => `new-${++id}`,
    );
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
    expect(applyTemplateDimensions(result, [], null, template).catalog).toBe(result);
  });

  it("creates independent IDs when reused in different projects", () => {
    const template = { currency: null, dimensions };
    const first = applyTemplateDimensions({ dimensions: [] }, [], null, template).catalog;
    const second = applyTemplateDimensions({ dimensions: [] }, [], null, template).catalog;
    expect(first.dimensions[0]!.id).not.toBe(second.dimensions[0]!.id);
    expect(first.dimensions[0]!.values[0]!.id).not.toBe(second.dimensions[0]!.values[0]!.id);
  });

  it.each([
    { name: "Archived", values: [], rates: [] },
    { name: "Trade", values: ["Old"], rates: [] },
  ])("rejects archived name conflicts atomically", (conflict) => {
    const source = structuredClone(catalog);
    expect(() =>
      applyTemplateDimensions(source, [], null, {
        currency: null,
        dimensions: [dimensions[1]!, conflict],
      }),
    ).toThrow(/Restore/);
    expect(source).toEqual(catalog);
  });

  it("uses Unicode-normalized case-insensitive name matching", () => {
    const source = { dimensions: [{ id: "d", name: "Café", archived: false, values: [] }] };
    expect(
      applyTemplateDimensions(source, [], null, {
        currency: null,
        dimensions: [{ name: "CAFE\u0301", values: [], rates: [] }],
      }).catalog,
    ).toBe(source);
    expect(
      validTemplateDimensions([
        { name: "Café", values: [], rates: [] },
        { name: "CAFE\u0301", values: [], rates: [] },
      ]),
    ).toBe(false);
  });

  it("rejects invalid templates, ambiguous project names, and ID collisions", () => {
    const template = { currency: null, dimensions };
    expect(() =>
      applyTemplateDimensions(catalog, [], null, {
        currency: null,
        dimensions: [{ name: "Trade", values: ["A", "a"], rates: [] }],
      }),
    ).toThrow(/invalid/);
    expect(() =>
      applyTemplateDimensions(catalog, [], null, { ...wallTemplate, currency: "eur" }),
    ).toThrow(/invalid/);
    expect(() =>
      applyTemplateDimensions(catalog, [], null, {
        currency: null,
        dimensions: [{ name: "Trade", values: ["Wall"], rates: [{ ...wallRates, value: "Door" }] }],
      }),
    ).toThrow(/invalid/);
    expect(() => applyTemplateDimensions(catalog, [], null, template, () => "trade")).toThrow(
      /unique/,
    );
    expect(() =>
      applyTemplateDimensions(
        { dimensions: [catalog.dimensions[0]!, { ...catalog.dimensions[0]!, id: "duplicate" }] },
        [],
        null,
        template,
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
    const template = { currency: null, dimensions };
    const result = sessionReducer(
      { session, error: null },
      { type: "APPLY_CLASSIFICATION_TEMPLATE", template, policy: "keep" },
    );
    expect(result.error).toBeNull();
    expect(result.session!.pages).toBe(session.pages);
    expect(result.session!.pdf).toBe(session.pdf);
    expect(result.session!.settings).toBe(session.settings);
    expect(result.session!.classificationRates).toBe(session.classificationRates);
    expect(result.session!.classificationCatalog.dimensions).toHaveLength(3);
    const unchanged = sessionReducer(result, {
      type: "APPLY_CLASSIFICATION_TEMPLATE",
      template,
      policy: "keep",
    });
    expect(unchanged.session).toBe(result.session);
    const rejected = sessionReducer(
      { session, error: null },
      {
        type: "APPLY_CLASSIFICATION_TEMPLATE",
        template: {
          currency: null,
          dimensions: [...dimensions, { name: "Archived", values: [], rates: [] }],
        },
        policy: "keep",
      },
    );
    expect(rejected.session).toBe(session);
    expect(rejected.error).toMatch(/Restore/);
  });
});

describe("template rates", () => {
  let nextId = 0;
  const createId = () => `new-${++nextId}`;
  beforeEach(() => (nextId = 0));
  const doorRates = {
    value: "Door",
    derivation: { source: "length", factorMm: 2100 },
    price: null,
  } as const;
  const bigTemplate = {
    currency: "EUR",
    dimensions: [{ name: "Trade", values: ["Wall", "Door"], rates: [wallRates, doorRates] }],
  };

  it("gives new values and existing values without rates those of the template, in catalog order", () => {
    const result = applyTemplateDimensions(
      projectCatalog,
      [slabRates],
      null,
      bigTemplate,
      createId,
      "keep",
    );
    expect(result.conflicts).toEqual([]);
    expect(result.catalog.dimensions[0]!.values.map((value) => value.id)).toEqual([
      "wall",
      "slab",
      "new-1",
    ]);
    expect(result.rates).toEqual([
      wallEntry,
      slabRates,
      { valueId: "new-1", derivation: { source: "length", factorMm: 2100 }, price: null },
    ]);
  });

  it("adopts the template currency only when the project has no currency and no prices", () => {
    const adopted = applyTemplateDimensions(projectCatalog, [slabRates], null, wallTemplate);
    expect(adopted.currency).toBe("EUR");
    expect(adopted.pricesSkipped).toBe(false);
    expect(adopted.rates[0]).toEqual(wallEntry);
    // No price to apply: the currency is not adopted.
    const noPrices = applyTemplateDimensions(projectCatalog, [], null, {
      currency: "EUR",
      dimensions: [{ name: "Trade", values: ["Wall"], rates: [{ ...wallRates, price: null }] }],
    });
    expect(noPrices.currency).toBeNull();
    expect(noPrices.rates).toEqual([{ valueId: "wall", derivation: wallDerivation, price: null }]);
  });

  it("applies the prices of a template with the same currency as the project", () => {
    const result = applyTemplateDimensions(projectCatalog, [], "EUR", wallTemplate);
    expect(result.rates).toEqual([wallEntry]);
    expect(result.currency).toBe("EUR");
    expect(result.pricesSkipped).toBe(false);
  });

  it("applies names and factors but not prices when the currency differs, and says so", () => {
    const result = applyTemplateDimensions(projectCatalog, [], "USD", wallTemplate);
    expect(result.rates).toEqual([{ valueId: "wall", derivation: wallDerivation, price: null }]);
    expect(result.currency).toBe("USD");
    expect(result.pricesSkipped).toBe(true);
    // A project with prices but no currency counts as having another currency.
    const priced: ClassificationValueRates = {
      valueId: "slab",
      derivation: null,
      price: { amount: 110, basis: "area", unit: "m²" },
    };
    const unnamed = applyTemplateDimensions(projectCatalog, [priced], null, wallTemplate);
    expect(unnamed.rates).toEqual([
      { valueId: "wall", derivation: wallDerivation, price: null },
      priced,
    ]);
    expect(unnamed.currency).toBeNull();
    expect(unnamed.pricesSkipped).toBe(true);
  });

  it("never overwrites an existing price when the currency differs", () => {
    const existing: ClassificationValueRates = {
      valueId: "wall",
      derivation: { source: "length", factorMm: 2400 },
      price: { amount: 30, basis: "derived", unit: "m²" },
    };
    const kept = applyTemplateDimensions(projectCatalog, [existing], "USD", wallTemplate);
    expect(kept.conflicts).toEqual([{ dimension: "Trade", value: "Wall" }]);
    expect(kept.rates).toEqual([existing]);
    const replaced = applyTemplateDimensions(
      projectCatalog,
      [existing],
      "USD",
      wallTemplate,
      undefined,
      "replace",
    );
    expect(replaced.rates).toEqual([{ ...existing, derivation: wallDerivation }]);
    // Same factor: the ignored template price is not a conflict.
    const same = applyTemplateDimensions(
      projectCatalog,
      [{ ...existing, derivation: wallDerivation }],
      "USD",
      wallTemplate,
    );
    expect(same.conflicts).toEqual([]);
  });

  it("skips a value whose only rates are prices the project cannot take", () => {
    const areaPrice = { amount: 80, basis: "area", unit: "m²" } as const;
    const priceOnly = {
      currency: "USD",
      dimensions: [
        {
          name: "Trade",
          values: ["Wall"],
          rates: [{ value: "Wall", derivation: null, price: areaPrice }],
        },
      ],
    };
    const rates: ClassificationValueRates[] = [];
    const result = applyTemplateDimensions(projectCatalog, rates, "EUR", priceOnly);
    expect(result.rates).toBe(rates);
    expect(result.conflicts).toEqual([]);
    expect(result.pricesSkipped).toBe(true);
  });

  it("drops the project price that does not fit the factor it replaces", () => {
    const existing: ClassificationValueRates = {
      valueId: "wall",
      derivation: { source: "length", factorMm: 2400 },
      price: { amount: 30, basis: "derived", unit: "m²" },
    };
    const slabDerivation = { source: "area", factorMm: 200 } as const;
    const areaTemplate = {
      currency: "USD",
      dimensions: [
        {
          name: "Trade",
          values: ["Wall"],
          rates: [{ value: "Wall", derivation: slabDerivation, price: null }],
        },
      ],
    };
    // A derived price per m² means nothing once the derived quantity is a volume.
    const kept = applyTemplateDimensions(projectCatalog, [existing], "EUR", areaTemplate);
    expect(kept.conflicts).toEqual([{ dimension: "Trade", value: "Wall" }]);
    expect(kept.rates).toEqual([existing]);
    const replaced = applyTemplateDimensions(
      projectCatalog,
      [existing],
      "EUR",
      areaTemplate,
      undefined,
      "replace",
    );
    expect(replaced.rates).toEqual([{ valueId: "wall", derivation: slabDerivation, price: null }]);
  });

  it("keeps existing rates that differ from the template, reports them and stays identical", () => {
    const existing: ClassificationValueRates[] = [
      { valueId: "wall", derivation: { source: "length", factorMm: 2400 }, price: null },
    ];
    const result = applyTemplateDimensions(projectCatalog, existing, null, wallTemplate);
    expect(result.conflicts).toEqual([{ dimension: "Trade", value: "Wall" }]);
    expect(result.rates).toBe(existing);
    expect(result.rates).toEqual([
      { valueId: "wall", derivation: { source: "length", factorMm: 2400 }, price: null },
    ]);
    expect(result.catalog).toBe(projectCatalog);
    expect(result.currency).toBeNull();
  });

  it("replaces existing rates that differ from the template when asked to", () => {
    const existing: ClassificationValueRates[] = [
      { valueId: "wall", derivation: { source: "length", factorMm: 2400 }, price: null },
      slabRates,
    ];
    const result = applyTemplateDimensions(
      projectCatalog,
      existing,
      null,
      wallTemplate,
      undefined,
      "replace",
    );
    expect(result.conflicts).toEqual([{ dimension: "Trade", value: "Wall" }]);
    expect(result.rates).toEqual([wallEntry, slabRates]);
    expect(result.currency).toBe("EUR");
    expect(existing[0]!.derivation).toEqual({ source: "length", factorMm: 2400 });
  });

  it("treats identical rates as no conflict and changes nothing", () => {
    const existing = [structuredClone(wallEntry), slabRates];
    for (const policy of ["keep", "replace"] as const) {
      const result = applyTemplateDimensions(
        projectCatalog,
        existing,
        "EUR",
        wallTemplate,
        undefined,
        policy,
      );
      expect(result.conflicts).toEqual([]);
      expect(result.rates).toBe(existing);
      expect(result.catalog).toBe(projectCatalog);
      expect(result.currency).toBe("EUR");
    }
  });

  it("applies atomically in the reducer: catalog, rates and currency change together", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
    session.classificationCatalog = structuredClone(projectCatalog);
    session.classificationRates = [slabRates];
    const result = sessionReducer(
      { session, error: null },
      { type: "APPLY_CLASSIFICATION_TEMPLATE", template: bigTemplate, policy: "keep" },
    );
    expect(result.error).toBeNull();
    expect(result.session!.settings.currency).toBe("EUR");
    expect(result.session!.classificationCatalog.dimensions[0]!.values).toHaveLength(3);
    expect(result.session!.classificationRates.map((entry) => entry.valueId)).toEqual([
      "wall",
      "slab",
      result.session!.classificationCatalog.dimensions[0]!.values[2]!.id,
    ]);
    expect(result.session!.classificationRates[0]).toEqual(wallEntry);
    const again = sessionReducer(result, {
      type: "APPLY_CLASSIFICATION_TEMPLATE",
      template: bigTemplate,
      policy: "keep",
    });
    expect(again.session).toBe(result.session);
    // Rates only: the catalog keeps its identity.
    const ratesOnly = sessionReducer(
      { session: { ...session, classificationRates: [] }, error: null },
      { type: "APPLY_CLASSIFICATION_TEMPLATE", template: wallTemplate, policy: "keep" },
    );
    expect(ratesOnly.session!.classificationCatalog).toBe(session.classificationCatalog);
    expect(ratesOnly.session!.classificationRates).toEqual([wallEntry]);
  });
});
