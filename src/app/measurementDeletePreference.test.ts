/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  MEASUREMENT_DELETE_CONFIRMATION_STORAGE_KEY,
  readMeasurementDeleteConfirmationPreference,
  writeMeasurementDeleteConfirmationPreference,
} from "./measurementDeletePreference";

describe("measurement deletion confirmation preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to confirming measurement deletion", () => {
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
  });

  it("persists the opt-out and can be re-enabled", () => {
    writeMeasurementDeleteConfirmationPreference(false);
    expect(window.localStorage.getItem(MEASUREMENT_DELETE_CONFIRMATION_STORAGE_KEY)).toBe("false");
    expect(readMeasurementDeleteConfirmationPreference()).toBe(false);

    writeMeasurementDeleteConfirmationPreference(true);
    expect(window.localStorage.getItem(MEASUREMENT_DELETE_CONFIRMATION_STORAGE_KEY)).toBe("true");
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
  });

  it("fails safe to confirmation for an unrecognized stored value", () => {
    window.localStorage.setItem(MEASUREMENT_DELETE_CONFIRMATION_STORAGE_KEY, "invalid");
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
  });
});
