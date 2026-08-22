import { describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/state";
import type { SessionV1 } from "../types/domain";
import { buildCsv, downloadCsv, NoMeasurementsError } from "./csv";

function measuredSession(): SessionV1 {
  const session = createEmptySession({ name: "sample.pdf", size: 10, lastModified: 1 }, 2);
  session.settings.displayUnit = "m";
  session.pages[1]!.calibration = {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    referenceDistanceMm: 1000,
  };
  session.pages[1]!.measurements.push({
    id: "line-id",
    type: "line",
    name: 'Lobby, "north"',
    points: [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
    ],
  });
  session.pages[1]!.measurements.push({
    id: "second-line-id",
    type: "line",
    name: "Second measurement",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  });
  session.pages[2]!.calibration = session.pages[1]!.calibration;
  session.pages[2]!.measurements.push({
    id: "polygon-id",
    type: "polygon",
    name: "Room\nA",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  });
  return session;
}

describe("CSV export", () => {
  it("exports exact columns and all pages with correctly empty fields", () => {
    const csv = buildCsv(measuredSession());
    expect(
      csv.startsWith(
        "\uFEFFpage,page_label,measurement_id,name,type,calibration_reference_mm,calibration_page_distance,calibration_mm_per_page_unit,length,perimeter,area,unit\r\n",
      ),
    ).toBe(true);
    expect(csv).toContain('1,,line-id,"Lobby, ""north""",Line,1000,10,100,2.50,,,m');
    expect(csv).toContain("1,,second-line-id,Second measurement,Line,1000,10,100,1.00,,,m");
    expect(csv).toContain('2,,polygon-id,"Room\nA",Polygon,1000,10,100,,4.00,1.00,m');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exports exact calibration audit values", () => {
    const session = measuredSession();
    session.pages[1]!.calibration = {
      start: { x: 0, y: 0 },
      end: { x: 25, y: 0 },
      referenceDistanceMm: 1000,
    };

    const firstRow = buildCsv(session).split("\r\n")[1];

    expect(firstRow).toBe('1,,line-id,"Lobby, ""north""",Line,1000,25,40,1.00,,,m');
  });

  it("preserves calibration metadata precision beyond two decimals", () => {
    const session = measuredSession();
    session.pages[1]!.calibration = {
      start: { x: 0, y: 0 },
      end: { x: 3, y: 0 },
      referenceDistanceMm: 1000,
    };

    const firstRow = buildCsv(session).split("\r\n")[1];

    expect(firstRow).toContain(",1000,3,333.3333333333333,");
  });

  it("repeats one page calibration metadata for every measurement", () => {
    const rows = buildCsv(measuredSession()).split("\r\n");

    expect(rows[1]).toContain(",Line,1000,10,100,");
    expect(rows[2]).toContain(",Line,1000,10,100,");
  });

  it("exports each page's own calibration metadata", () => {
    const session = measuredSession();
    session.pages[2]!.calibration = {
      start: { x: 0, y: 0 },
      end: { x: 20, y: 0 },
      referenceDistanceMm: 500,
    };

    const rows = buildCsv(session).split("\r\n");

    expect(rows[1]).toContain(",Line,1000,10,100,");
    expect(rows[3]).toContain(",Polygon,500,20,25,");
  });

  it("exports exact PDF page labels by page number", () => {
    const csv = buildCsv(measuredSession(), ["i", "7"]);
    expect(csv).toContain('1,i,line-id,"Lobby, ""north""",Line,1000,10,100,2.50,,,m');
    expect(csv).toContain('2,7,polygon-id,"Room\nA",Polygon,1000,10,100,,4.00,1.00,m');
  });

  it("preserves measurement ids across repeated exports", () => {
    const session = measuredSession();
    const firstExport = buildCsv(session);

    expect(buildCsv(session)).toBe(firstExport);
    expect(firstExport).toContain(",line-id,");
    expect(firstExport).toContain(",second-line-id,");
    expect(firstExport).toContain(",polygon-id,");
  });

  it("leaves page labels empty when the PDF has none and escapes label values", () => {
    const session = measuredSession();
    const withoutLabels = buildCsv(session, null);
    expect(withoutLabels).toContain('1,,line-id,"Lobby, ""north""",Line,1000,10,100,2.50,,,m');

    const label = 'Cover, "A"\nSheet';
    const withEscapedLabel = buildCsv(session, [label, "7"]);
    expect(withEscapedLabel).toContain(
      '1,"Cover, ""A""\nSheet",line-id,"Lobby, ""north""",Line,1000,10,100,2.50,,,m',
    );
  });

  it("formats values in the selected unit", () => {
    const session = measuredSession();
    session.settings.displayUnit = "cm";
    const csv = buildCsv(session);
    expect(csv).toContain("Line,1000,10,100,250.00,,,cm");
    expect(csv).toContain("Polygon,1000,10,100,,400.00,10000.00,cm");

    session.settings.displayUnit = "mm";
    const millimetreCsv = buildCsv(session);
    expect(millimetreCsv).toContain("Line,1000,10,100,2500.00,,,mm");
    expect(millimetreCsv).toContain("Polygon,1000,10,100,,4000.00,1000000.00,mm");
  });

  it("rejects measurements without page calibration", () => {
    const session = createEmptySession({ name: "uncalibrated.pdf", size: 1, lastModified: 1 }, 1);
    session.pages[1]!.measurements.push({
      id: "line-id",
      type: "line",
      name: "Uncalibrated",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });

    expect(() => buildCsv(session)).toThrow("Page 1 has measurements without calibration.");
  });

  it("rejects empty exports", () => {
    const session = createEmptySession({ name: "empty.pdf", size: 1, lastModified: 1 }, 1);
    expect(() => buildCsv(session)).toThrow(NoMeasurementsError);
  });

  it("keeps the object URL alive until the browser has started the download", () => {
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const append = vi.fn();
    const revokeObjectURL = vi.fn();
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal("document", {
      body: { append },
      createElement: vi.fn(() => anchor),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL,
    });
    vi.stubGlobal("window", { setTimeout });

    try {
      downloadCsv(measuredSession());
      expect(append).toHaveBeenCalledWith(anchor);
      expect(anchor.click).toHaveBeenCalledOnce();
      expect(anchor.remove).toHaveBeenCalledOnce();
      expect(setTimeout).toHaveBeenCalledOnce();
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 250);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
