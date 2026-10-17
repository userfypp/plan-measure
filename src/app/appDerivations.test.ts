import { describe, expect, it } from "vitest";
import { toolRailRegistry } from "../features/viewer/toolRegistry";
import type { CurrentSession, Measurement, PageState } from "../types/domain";
import {
  calibrationMeasurementCount,
  getAddCountItemsDisabledReason,
  getMeasurementToolDisabledReason,
  getPrecisionAuthoringDisabledReason,
  getPreviewPage,
  getPreviewPages,
  getSelectedMeasurement,
  getSelectedMeasurements,
  getToolAvailability,
} from "./appDerivations";

function measurement(id: string, calibrationId: string, visible = true): Measurement {
  return { id, calibrationId, visible } as unknown as Measurement;
}

function page(pageNumber: number, measurements: Measurement[]): PageState {
  return { pageNumber, measurements, calibrations: [] } as unknown as PageState;
}

describe("appDerivations", () => {
  it("counts measurements per calibration", () => {
    const p = page(1, [measurement("a", "c1"), measurement("b", "c2"), measurement("c", "c1")]);
    expect(calibrationMeasurementCount(p, "c1")).toBe(2);
    expect(calibrationMeasurementCount(p, "none")).toBe(0);
  });

  it("selects measurements across pages and in the current page", () => {
    const p1 = page(1, [measurement("a", "c")]);
    const p2 = page(2, [measurement("b", "c")]);
    const session = { pages: { 1: p1, 2: p2 } } as unknown as CurrentSession;
    expect(getSelectedMeasurements(session, ["b"]).map((m) => m.id)).toEqual(["b"]);
    expect(getSelectedMeasurements(null, ["b"])).toEqual([]);
    expect(getSelectedMeasurement(p1, "a")?.id).toBe("a");
    expect(getSelectedMeasurement(p1, "b")).toBeNull();
    expect(getSelectedMeasurement(undefined, "a")).toBeNull();
  });

  it("keeps the current page when there is no valid reference edit preview", () => {
    const p1 = page(1, []);
    const session = { pages: { 1: p1 } } as unknown as CurrentSession;
    const previewPage = getPreviewPage(p1, null, null, false);
    expect(previewPage).toBe(p1);
    expect(getPreviewPages(session, p1, previewPage)).toBe(session.pages);
    expect(getPreviewPages(null, undefined, undefined)).toBeUndefined();
  });

  it("derives disabled reasons", () => {
    expect(getPrecisionAuthoringDisabledReason(null)).toContain("Precision drawing");
    expect(getMeasurementToolDisabledReason(true, "locked", true, "blocked")).toBe("locked");
    expect(getMeasurementToolDisabledReason(false, "locked", true, "blocked")).toBe("blocked");
    expect(getMeasurementToolDisabledReason(false, "locked", false, "blocked")).toBe(
      "This tool requires an active scale",
    );
    expect(getAddCountItemsDisabledReason(null, false, "l", false, "b", false)).toBe(
      "Show this count before adding items",
    );
    expect(getAddCountItemsDisabledReason(measurement("a", "c"), false, "l", false, "b", true)).toBe(
      "Finish or cancel the current edit first",
    );
    expect(
      getAddCountItemsDisabledReason(measurement("a", "c"), false, "l", false, "b", false),
    ).toBeUndefined();
  });

  it("builds the tool availability map", () => {
    const map = getToolAvailability(true, "locked", false, "needs scale", false, "blocked");
    expect(map.select).toEqual({ enabled: false, disabledReason: "locked" });
    expect(map.line).toEqual({ enabled: false, disabledReason: "needs scale" });
    expect(map.count).toEqual({ enabled: false, disabledReason: "locked" });
  });

  it("locks every scaled drawing tool in the rail without a scale, and only those", () => {
    const map = getToolAvailability(false, "locked", false, "needs scale", false, "blocked");
    for (const { id } of toolRailRegistry) {
      expect(map[id], id).toBeDefined();
    }
    for (const type of ["line", "polyline", "polygon", "rectangle", "ellipse", "cloud"] as const) {
      expect(map[type], type).toEqual({ enabled: false, disabledReason: "needs scale" });
    }
    expect(map.count).toEqual({ enabled: true, disabledReason: "blocked" });
    expect(map.select?.enabled).toBe(true);
  });
});
