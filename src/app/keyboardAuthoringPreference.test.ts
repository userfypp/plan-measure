/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEYBOARD_AUTHORING_STORAGE_KEY,
  readKeyboardAuthoringPreference,
  writeKeyboardAuthoringPreference,
} from "./keyboardAuthoringPreference";

describe("keyboard authoring preference", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("defaults to disabled", () => {
    expect(readKeyboardAuthoringPreference()).toBe(false);
  });

  it("persists enabling and disabling", () => {
    for (const enabled of [true, false]) {
      writeKeyboardAuthoringPreference(enabled);
      expect(window.localStorage.getItem(KEYBOARD_AUTHORING_STORAGE_KEY)).toBe(String(enabled));
      expect(readKeyboardAuthoringPreference()).toBe(enabled);
    }
  });

  it.each(["invalid", "1", "TRUE", "", "false"])("rejects stored value %j", (value) => {
    window.localStorage.setItem(KEYBOARD_AUTHORING_STORAGE_KEY, value);
    expect(readKeyboardAuthoringPreference()).toBe(false);
  });

  it("defaults to disabled when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(readKeyboardAuthoringPreference()).toBe(false);
  });

  it("tolerates unavailable storage when writing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(() => writeKeyboardAuthoringPreference(true)).not.toThrow();
    expect(() => writeKeyboardAuthoringPreference(false)).not.toThrow();
  });

  it("tolerates browsers that block access to localStorage itself", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("Storage access denied");
    });
    expect(readKeyboardAuthoringPreference()).toBe(false);
    expect(() => writeKeyboardAuthoringPreference(true)).not.toThrow();
  });
});
