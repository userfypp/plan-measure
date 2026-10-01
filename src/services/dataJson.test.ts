import { describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession } from "../types/domain";
import { buildDataJson, downloadDataJson } from "./dataJson";

function fixture(): CurrentSession {
  const session = createEmptySession({ name: "Plán.PDF", size: 123, lastModified: 42 }, 3);
  session.settings.displayUnit = "ft-in";
  session.settings.measurementDecimalPlaces = 0;
  session.pageLabelOverrides = { 1: "Custom α" };
  session.classificationCatalog.dimensions = [
    {
      id: "dimension",
      name: "Zone",
      archived: true,
      values: [{ id: "value", name: "Old", archived: true }],
    },
  ];
  const page = session.pages[1]!;
  page.calibrations = [
    {
      id: "uniform",
      name: "Uniform",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 3, y: 4 },
      referenceDistanceMm: 10,
    },
    {
      id: "xy",
      name: "XY",
      mode: "xy",
      xReference: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 1 },
        referenceDistanceMm: 30,
      },
      yReference: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 10 },
        referenceDistanceMm: 50,
      },
    },
  ];
  page.activeCalibrationId = "xy";
  page.measurements = [
    {
      id: "line",
      name: '=SUM(α)\n"á"',
      type: "line",
      calibrationId: "uniform",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      classificationValueIds: ["value"],
      visible: false,
      note: "+Unicode ñ\nmultiline",
    },
    {
      id: "polyline",
      name: "Open",
      type: "polyline",
      calibrationId: "xy",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      classificationValueIds: [],
      visible: true,
    },
    {
      id: "polygon",
      name: "Closed",
      type: "polygon",
      calibrationId: "xy",
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 3 },
        { x: 0, y: 3 },
      ],
      classificationValueIds: [],
      visible: true,
    },
  ];
  return session;
}

describe("public JSON data export", () => {
  it("serializes complete canonical data with full precision independently of UI settings", () => {
    const session = fixture();
    const before = structuredClone(session);
    const serialized = buildDataJson(session, ["PDF label", "PDF β", ""]);
    const data = JSON.parse(serialized);
    expect(data.schemaVersion).toBe(1);
    expect(data.pdf).toEqual(session.pdf);
    expect(data.pageCount).toBe(3);
    expect(data.coordinateSystem).toEqual({
      space: "pdf-page",
      rotation: "intrinsic",
      logicalScale: 1,
      units: "page-unit",
      xAxis: "right",
      yAxis: "down",
    });
    expect(data.classificationCatalog).toEqual(session.classificationCatalog);
    expect(data.pages.map((page: { pageLabel: string }) => page.pageLabel)).toEqual([
      "Custom α",
      "PDF β",
      "",
    ]);
    expect(data.pages[0].calibrations[0]).toEqual({
      ...session.pages[1]!.calibrations[0],
      mmPerPageUnitX: 2,
      mmPerPageUnitY: 2,
    });
    expect(data.pages[0].calibrations[1]).toEqual({
      ...session.pages[1]!.calibrations[1],
      mmPerPageUnitX: 3,
      mmPerPageUnitY: 5,
    });
    const [line, polyline, polygon] = data.pages[0].measurements;
    expect(line).toEqual({
      ...session.pages[1]!.measurements[0],
      lengthMm: Math.sqrt(2) * 2,
      perimeterMm: null,
      areaMm2: null,
    });
    expect(serialized).toContain(String(Math.sqrt(2) * 2));
    expect(polyline).toEqual({
      ...session.pages[1]!.measurements[1],
      note: null,
      lengthMm: 8,
      perimeterMm: null,
      areaMm2: null,
    });
    expect(polygon).toEqual({
      ...session.pages[1]!.measurements[2],
      note: null,
      lengthMm: null,
      perimeterMm: 42,
      areaMm2: 90,
    });
    expect(data.pages[1]).toEqual({
      pageNumber: 2,
      pageLabel: "PDF β",
      calibrations: [],
      measurements: [],
    });
    expect(Object.keys(data)).toEqual([
      "schemaVersion",
      "pdf",
      "pageCount",
      "coordinateSystem",
      "pages",
      "classificationCatalog",
    ]);
    expect(session).toEqual(before);
    session.settings.displayUnit = "mm";
    session.settings.csvExport.columnOverrides = { measurement_name: false };
    expect(buildDataJson(session, ["PDF label", "PDF β", ""])).toBe(serialized);
  });

  it("exports empty and uninitialized pages and catalogs without measurements", () => {
    const session = createEmptySession({ name: "empty.pdf", size: 0, lastModified: 0 }, 2);
    delete session.pages[2];
    expect(JSON.parse(buildDataJson(session)).pages).toEqual([
      { pageNumber: 1, pageLabel: "", calibrations: [], measurements: [] },
      { pageNumber: 2, pageLabel: "", calibrations: [], measurements: [] },
    ]);
    session.classificationCatalog = fixture().classificationCatalog;
    expect(JSON.parse(buildDataJson(session)).classificationCatalog).toEqual(
      session.classificationCatalog,
    );
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite input %s", (invalid) => {
    const mutations: ((session: CurrentSession) => void)[] = [
      (session) => {
        session.pdf.size = invalid;
      },
      (session) => {
        session.pdf.lastModified = invalid;
      },
      (session) => {
        session.pageCount = invalid;
      },
      (session) => {
        session.pages[1]!.measurements[0]!.points[0]!.x = invalid;
      },
      (session) => {
        const calibration = session.pages[1]!.calibrations[0]!;
        if (calibration.mode === "uniform") calibration.referenceDistanceMm = invalid;
      },
      (session) => {
        const calibration = session.pages[1]!.calibrations[1]!;
        if (calibration.mode === "xy") calibration.yReference.start.y = invalid;
      },
    ];
    for (const mutate of mutations) {
      const session = fixture();
      mutate(session);
      expect(() => buildDataJson(session)).toThrow();
    }
  });

  it("rejects finite geometry whose derived result overflows", () => {
    const session = fixture();
    const calibration = session.pages[1]!.calibrations[0]!;
    if (calibration.mode === "uniform") calibration.referenceDistanceMm = 1e308;
    session.pages[1]!.measurements[0]!.points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(() => buildDataJson(session)).toThrow(/finite/);
  });

  it.each([
    "missing calibration",
    "missing value",
    "missing dimension",
    "duplicate dimension",
    "duplicate value",
    "duplicate measurement",
    "duplicate calibration",
    "duplicate assignment",
    "multiple values in dimension",
    "invalid geometry",
    "invalid calibration",
    "invalid page",
  ])("rejects invalid domain references or geometry: %s", (kind) => {
    const session = fixture();
    const page = session.pages[1]!;
    const dimension = session.classificationCatalog.dimensions[0]!;
    switch (kind) {
      case "missing calibration":
        page.measurements[0]!.calibrationId = "missing";
        break;
      case "missing value":
        page.measurements[0]!.classificationValueIds = ["missing"];
        break;
      case "missing dimension":
        session.classificationCatalog.dimensions = [];
        break;
      case "duplicate dimension":
        session.classificationCatalog.dimensions.push(structuredClone(dimension));
        break;
      case "duplicate value":
        dimension.values.push(structuredClone(dimension.values[0]!));
        break;
      case "duplicate measurement":
        page.measurements.push(structuredClone(page.measurements[0]!));
        break;
      case "duplicate calibration":
        page.calibrations.push(structuredClone(page.calibrations[0]!));
        break;
      case "duplicate assignment":
        page.measurements[0]!.classificationValueIds.push("value");
        break;
      case "multiple values in dimension":
        dimension.values.push({ id: "second", name: "Other", archived: false });
        page.measurements[0]!.classificationValueIds.push("second");
        break;
      case "invalid geometry":
        page.measurements[2]!.points.reverse();
        page.measurements[2]!.points[2] = { x: 0, y: 0 };
        break;
      case "invalid calibration":
        if (page.calibrations[0]!.mode === "uniform") page.calibrations[0]!.referenceDistanceMm = 0;
        break;
      case "invalid page":
        session.pageCount = 0;
        break;
    }
    expect(() => buildDataJson(session)).toThrow();
  });

  it("does not silently omit out-of-range or mismatched page state", () => {
    const session = fixture();
    session.pages[4] = { ...session.pages[1]!, pageNumber: 4 };
    expect(() => buildDataJson(session)).toThrow(/page numbering/);
    delete session.pages[4];
    session.pages[1]!.pageNumber = 2;
    expect(() => buildDataJson(session)).toThrow(/page numbering/);
  });

  it("downloads JSON with its MIME type and cleans up the anchor and object URL", async () => {
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:json");
    const revokeObjectURL = vi.fn();
    let revoke: (() => void) | undefined;
    const setTimeout = vi.fn((callback: () => void) => {
      revoke = callback;
      return 1;
    });
    vi.stubGlobal("document", { body: { append }, createElement: vi.fn(() => anchor) });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("window", { setTimeout });
    try {
      const session = fixture();
      downloadDataJson(session);
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob | undefined;
      expect(blob?.type).toBe("application/json;charset=utf-8");
      expect(await blob?.text()).toBe(buildDataJson(session));
      expect(anchor.download).toBe("Plán-data.json");
      expect(anchor.href).toBe("blob:json");
      expect(append).toHaveBeenCalledWith(anchor);
      expect(anchor.click).toHaveBeenCalledOnce();
      expect(anchor.remove).toHaveBeenCalledOnce();
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 250);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      revoke?.();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:json");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
