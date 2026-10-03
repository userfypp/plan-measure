/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readClassificationDeleteConfirmationPreference,
  writeClassificationDeleteConfirmationPreference,
} from "./classificationDeletePreference";
import { readMeasurementDeleteConfirmationPreference } from "./measurementDeletePreference";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("classification deletion confirmation preferences", () => {
  it.each(["value", "dimension"] as const)("defaults to confirmation for %s and persists changes independently", (target) => {
    const other = target === "value" ? "dimension" : "value";
    expect(readClassificationDeleteConfirmationPreference(target)).toBe(true);
    writeClassificationDeleteConfirmationPreference(target, false);
    expect(readClassificationDeleteConfirmationPreference(target)).toBe(false);
    expect(readClassificationDeleteConfirmationPreference(other)).toBe(true);
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
    writeClassificationDeleteConfirmationPreference(target, true);
    expect(readClassificationDeleteConfirmationPreference(target)).toBe(true);
  });

  it.each(["value", "dimension"] as const)("fails safe for invalid stored %s preferences", (target) => {
    window.localStorage.setItem(`plan-measure.confirm-${target}-deletion`, "invalid");
    expect(readClassificationDeleteConfirmationPreference(target)).toBe(true);
  });

  it("defaults to confirmation and tolerates failed writes when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    for (const target of ["value", "dimension"] as const) {
      expect(readClassificationDeleteConfirmationPreference(target)).toBe(true);
      expect(() => writeClassificationDeleteConfirmationPreference(target, false)).not.toThrow();
    }
  });
});
