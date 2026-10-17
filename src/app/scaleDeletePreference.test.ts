/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  SCALE_DELETE_CONFIRMATION_STORAGE_KEY,
  readScaleDeleteConfirmationPreference,
  writeScaleDeleteConfirmationPreference,
} from "./scaleDeletePreference";

describe("scale deletion confirmation preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to confirming scale deletion", () => {
    expect(readScaleDeleteConfirmationPreference()).toBe(true);
  });

  it("persists the opt-out and can be re-enabled", () => {
    writeScaleDeleteConfirmationPreference(false);
    expect(window.localStorage.getItem(SCALE_DELETE_CONFIRMATION_STORAGE_KEY)).toBe("false");
    expect(readScaleDeleteConfirmationPreference()).toBe(false);

    writeScaleDeleteConfirmationPreference(true);
    expect(window.localStorage.getItem(SCALE_DELETE_CONFIRMATION_STORAGE_KEY)).toBe("true");
    expect(readScaleDeleteConfirmationPreference()).toBe(true);
  });

  it("fails safe to confirmation for an unrecognized stored value", () => {
    window.localStorage.setItem(SCALE_DELETE_CONFIRMATION_STORAGE_KEY, "invalid");
    expect(readScaleDeleteConfirmationPreference()).toBe(true);
  });
});
