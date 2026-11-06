import { describe, expect, it } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession } from "../types/domain";
import {
  deserializeSession,
  deserializeSessionForRecovery,
  serializeSession,
} from "./persistenceCodec";

// These tests edit the saved JSON directly, so the decoder sees data that `serializeSession` would
// refuse to write: corrupt files come from disk, old builds or hand edits, not from this encoder.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function session(): CurrentSession {
  const created = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  created.classificationCatalog = {
    dimensions: [
      {
        id: "trade",
        name: "Trade",
        archived: false,
        values: [{ id: "electrical", name: "Electrical", archived: false }],
      },
    ],
  };
  created.pages[1]!.calibrations = [
    {
      id: "scale",
      name: "Scale",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
  ];
  created.pages[1]!.activeCalibrationId = "scale";
  created.pages[1]!.measurements = [
    {
      id: "line-1",
      name: "Line 1",
      type: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      calibrationId: "scale",
      classificationValueIds: ["electrical"],
      visible: true,
    },
  ];
  return created;
}

function corrupted(edit: (raw: Json) => void): string {
  const raw = JSON.parse(serializeSession(session())) as Json;
  edit(raw);
  return JSON.stringify(raw);
}

describe("deserializeSession with raw saved JSON", () => {
  it("restores the untouched JSON exactly", () => {
    expect(deserializeSession(corrupted(() => {}))).toEqual(session());
  });

  it.each<[string, (raw: Json) => void, string]>([
    [
      "a measurement ID repeated on another page",
      (raw) => {
        raw.pages["2"].calibrations = raw.pages["1"].calibrations;
        raw.pages["2"].activeCalibrationId = "scale";
        raw.pages["2"].measurements = raw.pages["1"].measurements;
      },
      "The saved session has duplicate measurement IDs.",
    ],
    [
      "a calibration ID repeated on one page",
      (raw) => raw.pages["1"].calibrations.push({ ...raw.pages["1"].calibrations[0] }),
      "Page 1 has duplicate calibration IDs.",
    ],
    [
      "an active calibration that does not exist",
      (raw) => (raw.pages["1"].activeCalibrationId = "gone"),
      "Page 1 has an active calibration that does not exist.",
    ],
    [
      "a measurement whose calibration does not exist",
      (raw) => (raw.pages["1"].measurements[0].calibrationId = "gone"),
      "Page 1 has a measurement with a missing calibration.",
    ],
    [
      "a page beyond the page count",
      (raw) => (raw.pages["3"] = { ...raw.pages["2"], pageNumber: 3 }),
      "The saved session contains a page outside the declared page count.",
    ],
    [
      "a page key that is not a canonical number",
      (raw) => {
        raw.pages["02"] = raw.pages["2"];
        delete raw.pages["2"];
      },
      "The saved session contains an invalid page key.",
    ],
    [
      "a classification value that is not in the catalog",
      (raw) => (raw.pages["1"].measurements[0].classificationValueIds = ["plumbing"]),
      "The saved session has a measurement with a missing classification value.",
    ],
    [
      "an unknown display unit",
      (raw) => (raw.settings.displayUnit = "furlong"),
      "The saved display unit setting is invalid.",
    ],
    [
      "a schema version from the future",
      (raw) => (raw.schemaVersion = 99),
      "The saved session uses an unsupported schema.",
    ],
  ])("rejects %s", (_name, edit, message) => {
    expect(() => deserializeSession(corrupted(edit))).toThrow(message);
  });

  it("refuses a self-crossing polygon in a schema that could never have saved one", () => {
    const json = corrupted((raw) => {
      const page = raw.pages["1"];
      page.measurements.push({
        ...page.measurements[0],
        id: "polygon-1",
        name: "Polygon 1",
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
      });
    });
    expect(() => deserializeSessionForRecovery(json)).toThrow(
      "The saved state for page 1 is invalid.",
    );
  });

  it.each(["[]", "null", '"session"', "42"])("rejects the non-object JSON %s", (json) => {
    expect(() => deserializeSession(json)).toThrow("The saved session uses an unsupported schema.");
  });

  it("rejects text that is not JSON", () => {
    expect(() => deserializeSession("{ not json")).toThrow(SyntaxError);
  });
});

describe("the saved session header", () => {
  it.each<[string, (raw: Json) => void]>([
    ["no PDF", (raw) => delete raw.pdf],
    ["a PDF that is not an object", (raw) => (raw.pdf = "plan.pdf")],
    ["a numeric PDF name", (raw) => (raw.pdf.name = 1)],
    ["an empty PDF name", (raw) => (raw.pdf.name = "")],
    ["a PDF size that is not a number", (raw) => (raw.pdf.size = "1")],
    ["a PDF size lost to JSON", (raw) => (raw.pdf.size = null)],
    ["a negative PDF size", (raw) => (raw.pdf.size = -1)],
    ["no PDF date", (raw) => delete raw.pdf.lastModified],
    ["no page count", (raw) => delete raw.pageCount],
    ["no pages at all", (raw) => (raw.pageCount = 0)],
    ["a fractional page count", (raw) => (raw.pageCount = 1.5)],
    ["a page count that is text", (raw) => (raw.pageCount = "2")],
    ["no current page", (raw) => delete raw.currentPage],
    ["a current page below the first", (raw) => (raw.currentPage = 0)],
    ["a current page beyond the last", (raw) => (raw.currentPage = 3)],
    ["a fractional current page", (raw) => (raw.currentPage = 1.5)],
    ["no settings", (raw) => delete raw.settings],
    ["a label setting that is not boolean", (raw) => (raw.settings.showLabels = 1)],
    ["a measurements setting that is not boolean", (raw) => (raw.settings.showMeasurements = 1)],
    ["a calibration setting that is not boolean", (raw) => (raw.settings.showCalibration = 1)],
    ["no page map", (raw) => delete raw.pages],
  ])("rejects %s", (_name, edit) => {
    expect(() => deserializeSession(corrupted(edit))).toThrow("The saved session is invalid.");
  });

  it("rejects a page map that is a list", () => {
    const json = corrupted((raw) => (raw.pages = []));
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });
});

describe("the saved page counters", () => {
  it.each<[string, (raw: Json) => void]>([
    ["no measurement counters", (raw) => delete raw.pages["1"].nextMeasurementNumber],
    ["a line counter of zero", (raw) => (raw.pages["1"].nextMeasurementNumber.line = 0)],
    [
      "a fractional polyline counter",
      (raw) => (raw.pages["1"].nextMeasurementNumber.polyline = 1.5),
    ],
    [
      "a polygon counter that is text",
      (raw) => (raw.pages["1"].nextMeasurementNumber.polygon = "1"),
    ],
    ["no count counter", (raw) => delete raw.pages["1"].nextMeasurementNumber.count],
    ["a count counter of zero", (raw) => (raw.pages["1"].nextMeasurementNumber.count = 0)],
    ["a calibration counter of zero", (raw) => (raw.pages["1"].nextCalibrationNumber = 0)],
    ["no calibration counter", (raw) => delete raw.pages["1"].nextCalibrationNumber],
  ])("rejects %s", (_name, edit) => {
    expect(() => deserializeSession(corrupted(edit))).toThrow(
      "The saved state for page 1 is invalid.",
    );
  });
});

describe("the oldest saved schemas", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 10, y: 0 };
  const header = {
    pdf: { name: "plan.pdf", size: 1, lastModified: 1 },
    pageCount: 1,
    currentPage: 1,
    settings: { displayUnit: "m", showLabels: true, showMeasurements: true, showCalibration: true },
  };
  const line = () => ({
    id: "line-1",
    name: "Line 1",
    type: "line",
    points: [start, end],
  });
  const calibration = { id: "scale", name: "Scale 1", start, end, referenceDistanceMm: 1000 };

  const v1 = (): Json => ({
    ...header,
    schemaVersion: 1,
    pages: {
      "1": {
        pageNumber: 1,
        calibration: { start, end, referenceDistanceMm: 1000 },
        measurements: [line()],
        nextLineNumber: 2,
        nextPolygonNumber: 1,
      },
    },
  });
  const calibrated = (schemaVersion: number, savedCalibration: object): Json => ({
    ...header,
    schemaVersion,
    pages: {
      "1": {
        pageNumber: 1,
        calibrations: [savedCalibration],
        activeCalibrationId: "scale",
        measurements: [{ ...line(), calibrationId: "scale" }],
        nextCalibrationNumber: 2,
        nextLineNumber: 2,
        nextPolygonNumber: 1,
      },
    },
  });
  const v2 = () => calibrated(2, calibration);
  const v3 = () => calibrated(3, { ...calibration, mode: "uniform" });
  const v4 = (): Json => {
    const raw = v3();
    const { nextLineNumber, nextPolygonNumber, ...page } = raw.pages["1"];
    raw.pages["1"] = {
      ...page,
      nextMeasurementNumber: { line: nextLineNumber, polyline: 1, polygon: nextPolygonNumber },
    };
    return { ...raw, schemaVersion: 4 };
  };

  const edited = (raw: Json, edit: (raw: Json) => void) => {
    edit(raw);
    return JSON.stringify(raw);
  };

  it.each<[number, () => Json, string]>([
    [1, v1, "legacy-page-1-scale-1"],
    [2, v2, "scale"],
    [3, v3, "scale"],
    [4, v4, "scale"],
  ])("opens V%i with its calibrated measurement", (_version, raw, calibrationId) => {
    const session = deserializeSession(JSON.stringify(raw()));
    const page = session.pages[1]!;

    expect(session).toMatchObject({ schemaVersion: 17, pdf: header.pdf, pageCount: 1 });
    expect(page.calibrations).toStrictEqual([
      {
        id: calibrationId,
        name: "Scale 1",
        mode: "uniform",
        start,
        end,
        referenceDistanceMm: 1000,
      },
    ]);
    expect(page.activeCalibrationId).toBe(calibrationId);
    expect(page.measurements).toStrictEqual([
      {
        ...line(),
        calibrationId,
        classificationValueIds: [],
        visible: true,
      },
    ]);
    expect(page.nextMeasurementNumber).toStrictEqual({
      line: 2,
      polyline: 1,
      polygon: 1,
      count: 1,
      rectangle: 1,
      ellipse: 1,
      cloud: 1,
    });
  });

  const everySchema = [
    ["V1", v1],
    ["V2", v2],
    ["V3", v3],
    ["V4", v4],
  ] as const;
  const withCalibrations = everySchema.slice(1);

  it.each(everySchema)("rejects a %s header without pages", (_name, raw) => {
    expect(() => deserializeSession(edited(raw(), (session) => (session.pageCount = 0)))).toThrow(
      "The saved session is invalid.",
    );
  });

  it.each(everySchema)("rejects a %s header without settings", (_name, raw) => {
    const json = edited(raw(), (session) => delete session.settings);
    expect(() => deserializeSession(json)).toThrow("The saved session is invalid.");
  });

  it.each(everySchema)("rejects a %s page key that is not canonical", (_name, raw) => {
    const json = edited(raw(), (session) => {
      session.pages["01"] = session.pages["1"];
      delete session.pages["1"];
    });
    expect(() => deserializeSession(json)).toThrow(
      "The saved session contains an invalid page key.",
    );
  });

  it.each(everySchema)("rejects a %s page numbered differently from its key", (_name, raw) => {
    const json = edited(raw(), (session) => (session.pages["1"].pageNumber = 2));
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });

  it.each(everySchema)("rejects a %s page that is missing", (_name, raw) => {
    const json = edited(raw(), (session) => delete session.pages["1"]);
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });

  it.each(everySchema)("rejects a %s measurement ID used twice", (_name, raw) => {
    const json = edited(raw(), (session) => {
      session.pages["1"].measurements.push({ ...session.pages["1"].measurements[0] });
    });
    expect(() => deserializeSession(json)).toThrow(
      "The saved session has duplicate measurement IDs.",
    );
  });

  it.each(everySchema)("rejects a %s line with three points", (_name, raw) => {
    const json = edited(raw(), (session) => session.pages["1"].measurements[0].points.push(start));
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });

  it.each<[string, (page: Json) => void]>([
    ["no line counter", (page) => (page.nextLineNumber = 0)],
    ["no polygon counter", (page) => (page.nextPolygonNumber = 0)],
    ["a calibration with no distance", (page) => (page.calibration.referenceDistanceMm = 0)],
  ])("rejects a V1 page with %s", (_name, edit) => {
    const json = edited(v1(), (session) => edit(session.pages["1"]));
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });

  it("rejects a V1 page with no calibration field at all", () => {
    const json = edited(v1(), (session) => delete session.pages["1"].calibration);
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });

  it("rejects V1 measurements without a calibration", () => {
    const json = edited(v1(), (session) => (session.pages["1"].calibration = null));
    expect(() => deserializeSession(json)).toThrow("Page 1 has measurements without calibration.");
  });

  it("rejects a V3 calibration that names no mode, which V2 did not need", () => {
    const json = edited(v3(), (session) => delete session.pages["1"].calibrations[0].mode);
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });

  it.each(withCalibrations)("rejects a %s page with no calibration list", (_name, raw) => {
    const json = edited(raw(), (session) => delete session.pages["1"].calibrations);
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });

  it.each(withCalibrations)("rejects a %s calibration ID used twice", (_name, raw) => {
    const json = edited(raw(), (session) => {
      session.pages["1"].calibrations.push({ ...session.pages["1"].calibrations[0] });
    });
    expect(() => deserializeSession(json)).toThrow("Page 1 has duplicate calibration IDs.");
  });

  it.each(withCalibrations)("rejects a %s active calibration that is gone", (_name, raw) => {
    const json = edited(raw(), (session) => (session.pages["1"].activeCalibrationId = "gone"));
    expect(() => deserializeSession(json)).toThrow(
      "Page 1 has an active calibration that does not exist.",
    );
  });

  it.each(withCalibrations)("rejects a %s active calibration on an empty page", (_name, raw) => {
    const json = edited(raw(), (session) => {
      session.pages["1"].calibrations = [];
      session.pages["1"].measurements = [];
    });
    expect(() => deserializeSession(json)).toThrow(
      "Page 1 has an active calibration that does not exist.",
    );
  });

  it.each(withCalibrations)("rejects %s measurements without a calibration", (_name, raw) => {
    const json = edited(raw(), (session) => {
      session.pages["1"].calibrations = [];
      session.pages["1"].activeCalibrationId = null;
    });
    expect(() => deserializeSession(json)).toThrow("Page 1 has measurements without calibration.");
  });

  it.each(withCalibrations)("rejects a %s measurement on a missing calibration", (_name, raw) => {
    const json = edited(raw(), (session) => {
      session.pages["1"].measurements[0].calibrationId = "gone";
    });
    expect(() => deserializeSession(json)).toThrow(
      "Page 1 has a measurement with a missing calibration.",
    );
  });

  it.each<[string, (raw: Json) => void]>([
    ["V2", (raw) => (raw.pages["1"].nextCalibrationNumber = 0)],
    ["V3", (raw) => (raw.pages["1"].nextLineNumber = 0)],
  ])("rejects a %s page with a counter of zero", (name, edit) => {
    const raw = name === "V2" ? v2() : v3();
    expect(() => deserializeSession(edited(raw, edit))).toThrow(
      "The saved state for page 1 is invalid.",
    );
  });

  it.each<[string, (counters: Json) => void]>([
    ["no line counter", (counters) => delete counters.line],
    ["a polyline counter of zero", (counters) => (counters.polyline = 0)],
    ["a fractional polygon counter", (counters) => (counters.polygon = 1.5)],
  ])("rejects a V4 page with %s", (_name, edit) => {
    const json = edited(v4(), (session) => edit(session.pages["1"].nextMeasurementNumber));
    expect(() => deserializeSession(json)).toThrow("The saved state for page 1 is invalid.");
  });
});

describe("the saved currency and classification rates", () => {
  const derivation = { source: "length", factorMm: 2700 };
  const price = { amount: 25, basis: "derived", unit: "m²" };
  const entry = { valueId: "electrical", derivation, price };
  const INFINITY = "__infinity__";
  const NEGATIVE_ZERO = "__negative-zero__";

  function ratesSession(): CurrentSession {
    const created = session();
    created.classificationCatalog.dimensions[0]!.values.push({
      id: "plumbing",
      name: "Plumbing",
      archived: false,
    });
    created.settings.currency = "EUR";
    created.classificationRates = [
      {
        valueId: "electrical",
        derivation: { source: "length", factorMm: 2700 },
        price: { amount: 25, basis: "derived", unit: "m²" },
      },
    ];
    return created;
  }

  /** Edits the V17 JSON; JSON.stringify cannot write infinity or -0, so placeholders become `1e309` and `-0`. */
  function ratesJson(edit: (raw: Json) => void): string {
    const raw = JSON.parse(serializeSession(ratesSession())) as Json;
    edit(raw);
    return JSON.stringify(raw)
      .replace(`"${INFINITY}"`, "1e309")
      .replace(`"${NEGATIVE_ZERO}"`, "-0");
  }

  const CURRENCY_ERROR = "The saved currency is invalid.";
  const RATES_ERROR = "The saved classification rates are invalid.";

  it("round trips a valid currency and rates", () => {
    const original = ratesSession();
    expect(deserializeSession(serializeSession(original))).toStrictEqual(original);
  });

  it("opens a recoverable catalog with its rates intact and still validates them", () => {
    const conflicting = (raw: Json) => {
      raw.classificationCatalog.dimensions[0].values[0].name = "Électrique";
      raw.classificationCatalog.dimensions[0].values[1].name = "Électrique";
    };
    const decoded = deserializeSessionForRecovery(ratesJson(conflicting));
    expect(decoded.compatibility).toBe("classification-repair-required");
    expect(decoded.session.classificationRates).toStrictEqual(ratesSession().classificationRates);
    expect(() =>
      deserializeSessionForRecovery(
        ratesJson((raw) => {
          conflicting(raw);
          raw.classificationRates[0].derivation.factorMm = 0;
        }),
      ),
    ).toThrow(RATES_ERROR);
  });

  it.each<[string, (raw: Json) => void]>([
    ["absent", (raw) => delete raw.settings.currency],
    ["lowercase", (raw) => (raw.settings.currency = "eur")],
    ["too long", (raw) => (raw.settings.currency = "EURO")],
    ["empty", (raw) => (raw.settings.currency = "")],
    ["a symbol", (raw) => (raw.settings.currency = "€")],
    ["a number", (raw) => (raw.settings.currency = 123)],
  ])("rejects a currency that is %s", (_name, edit) => {
    expect(() => deserializeSession(ratesJson(edit))).toThrow(CURRENCY_ERROR);
  });

  it.each<[string, (raw: Json) => void]>([
    ["absent", (raw) => delete raw.classificationRates],
    ["an object", (raw) => (raw.classificationRates = {})],
    ["an array of numbers", (raw) => (raw.classificationRates = [1])],
    ["without a value", (raw) => delete raw.classificationRates[0].valueId],
    ["for an unknown value", (raw) => (raw.classificationRates[0].valueId = "gone")],
    ["for a dimension", (raw) => (raw.classificationRates[0].valueId = "trade")],
    [
      "duplicated for a value",
      (raw) => raw.classificationRates.push(structuredClone(raw.classificationRates[0])),
    ],
    [
      "with neither a derivation nor a price",
      (raw) => {
        raw.classificationRates[0].derivation = null;
        raw.classificationRates[0].price = null;
      },
    ],
    ["without a derivation key", (raw) => delete raw.classificationRates[0].derivation],
    ["without a price key", (raw) => delete raw.classificationRates[0].price],
    ["from a count", (raw) => (raw.classificationRates[0].derivation.source = "count")],
    ["from a volume", (raw) => (raw.classificationRates[0].derivation.source = "volume")],
    ["with a factor of zero", (raw) => (raw.classificationRates[0].derivation.factorMm = 0)],
    ["with a negative factor", (raw) => (raw.classificationRates[0].derivation.factorMm = -1)],
    ["with a text factor", (raw) => (raw.classificationRates[0].derivation.factorMm = "2700")],
    [
      "with an infinite factor",
      (raw) => (raw.classificationRates[0].derivation.factorMm = INFINITY),
    ],
    ["with a negative amount", (raw) => (raw.classificationRates[0].price.amount = -0.01)],
    ["with a text amount", (raw) => (raw.classificationRates[0].price.amount = "25")],
    ["with an infinite amount", (raw) => (raw.classificationRates[0].price.amount = INFINITY)],
    ["with a volume basis", (raw) => (raw.classificationRates[0].price.basis = "volume")],
    [
      "in a linear unit for an area basis",
      (raw) => Object.assign(raw.classificationRates[0].price, { basis: "area", unit: "m" }),
    ],
    [
      "in each for a length basis",
      (raw) => Object.assign(raw.classificationRates[0].price, { basis: "length", unit: "each" }),
    ],
    [
      "in cubic units for a derivation from length",
      (raw) => (raw.classificationRates[0].price.unit = "m³"),
    ],
    [
      "in acres for a length basis",
      (raw) => Object.assign(raw.classificationRates[0].price, { basis: "length", unit: "ac" }),
    ],
    [
      "in square units for a derivation from area",
      (raw) => (raw.classificationRates[0].derivation.source = "area"),
    ],
    [
      "on a derived basis without a derivation",
      (raw) => (raw.classificationRates[0].derivation = null),
    ],
  ])("rejects rates %s", (_name, edit) => {
    expect(() => deserializeSession(ratesJson(edit))).toThrow(RATES_ERROR);
  });

  it("accepts the units each basis allows", () => {
    for (const [basis, unit] of [
      ["length", "ft"],
      ["perimeter", "mm"],
      ["area", "ac"],
      ["area", "in²"],
      ["count", "each"],
    ] as const) {
      const decoded = deserializeSession(
        ratesJson((raw) => Object.assign(raw.classificationRates[0].price, { basis, unit })),
      );
      expect(decoded.classificationRates[0]!.price).toStrictEqual({ amount: 25, basis, unit });
    }
    const volume = deserializeSession(
      ratesJson((raw) => {
        raw.classificationRates[0].derivation.source = "area";
        raw.classificationRates[0].price.unit = "ft³";
      }),
    );
    expect(volume.classificationRates[0]!.price?.unit).toBe("ft³");
  });

  it("puts out-of-order entries in catalogue order", () => {
    const decoded = deserializeSession(
      ratesJson((raw) => {
        raw.classificationRates.unshift({ ...entry, valueId: "plumbing" });
        raw.classificationRates.reverse();
      }),
    );
    expect(decoded.classificationRates.map(({ valueId }) => valueId)).toStrictEqual([
      "electrical",
      "plumbing",
    ]);
  });

  it("drops extra keys and a negative zero amount", () => {
    const decoded = deserializeSession(
      ratesJson((raw) => {
        const [saved] = raw.classificationRates;
        saved.note = "x";
        saved.derivation.height = 1;
        saved.price.currency = "USD";
        saved.price.amount = NEGATIVE_ZERO;
      }),
    );
    expect(decoded.classificationRates).toStrictEqual([
      {
        valueId: "electrical",
        derivation: { source: "length", factorMm: 2700 },
        price: { amount: 0, basis: "derived", unit: "m²" },
      },
    ]);
    expect(Object.is(decoded.classificationRates[0]!.price!.amount, 0)).toBe(true);
  });

  it("migrates a V16 session with stray rates and currency to no rates and no currency", () => {
    const raw = JSON.parse(serializeSession(ratesSession())) as Json;
    raw.schemaVersion = 16;
    raw.settings.currency = "X";
    raw.classificationRates = [1, "junk"];
    const migrated = deserializeSession(JSON.stringify(raw));
    expect(migrated.schemaVersion).toBe(17);
    expect(migrated.settings.currency).toBeNull();
    expect(migrated.classificationRates).toStrictEqual([]);
  });

  it("does not open a newer schema", () => {
    const raw = JSON.parse(serializeSession(ratesSession())) as Json;
    raw.schemaVersion = 18;
    expect(() => deserializeSession(JSON.stringify(raw))).toThrow(
      "The saved session uses an unsupported schema.",
    );
  });
});
