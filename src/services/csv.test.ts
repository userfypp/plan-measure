import { describe, expect, it } from "vitest";
import { createEmptySession } from "../app/state";
import type { SessionV1 } from "../types/domain";
import { buildCsv, NoMeasurementsError } from "./csv";

function measuredSession(): SessionV1 {
  const session = createEmptySession({ name: "sample.pdf", size: 10, lastModified: 1 }, 2);
  session.settings.displayUnit = "m";
  session.pages[1]!.calibration = {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    referenceDistanceMm: 1000,
  };
  session.pages[1]!.measurements.push({
    id: "line",
    type: "line",
    name: 'Lobby, "north"',
    points: [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
    ],
  });
  session.pages[2]!.calibration = session.pages[1]!.calibration;
  session.pages[2]!.measurements.push({
    id: "polygon",
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
    expect(csv.startsWith("\uFEFFpage,name,type,length,perimeter,area,unit\r\n")).toBe(true);
    expect(csv).toContain('1,"Lobby, ""north""",Line,2.50,,,m');
    expect(csv).toContain('2,"Room\nA",Polygon,,4.00,1.00,m');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("formats values in the selected unit", () => {
    const session = measuredSession();
    session.settings.displayUnit = "cm";
    const csv = buildCsv(session);
    expect(csv).toContain("Line,250.00,,,cm");
    expect(csv).toContain("Polygon,,400.00,10000.00,cm");
  });

  it("rejects empty exports", () => {
    const session = createEmptySession({ name: "empty.pdf", size: 1, lastModified: 1 }, 1);
    expect(() => buildCsv(session)).toThrow(NoMeasurementsError);
  });
});
