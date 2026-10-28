/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readClassificationDeleteConfirmationPreference } from "./classificationDeletePreference";
import { readKeyboardAuthoringPreference } from "./keyboardAuthoringPreference";
import { readMeasurementDeleteConfirmationPreference } from "./measurementDeletePreference";
import {
  RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY,
  readRecoveredPlanStartupWorkspacePreference,
  sanitizeRecoveredPlanStartupWorkspace,
} from "./recoveredPlanStartupPreference";
import { readScaleDeleteConfirmationPreference } from "./scaleDeletePreference";
import { useAppPreferenceSetters } from "./useAppPreferenceSetters";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let setters: ReturnType<typeof useAppPreferenceSetters>;

const state = {
  setKeyboardAuthoringEnabledState: vi.fn(),
  setConfirmMeasurementDeletionState: vi.fn(),
  setConfirmValueDeletionState: vi.fn(),
  setConfirmDimensionDeletionState: vi.fn(),
  setConfirmScaleDeletionState: vi.fn(),
  setRecoveredPlanStartupWorkspaceState: vi.fn(),
};

function Harness() {
  const current = useAppPreferenceSetters(state);
  useEffect(() => {
    setters = current;
  });
  return null;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  for (const setter of Object.values(state)) setter.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("defaults when nothing is stored", () => {
  it("asks for every confirmation, leaves keyboard authoring off and opens recovered plans on Scales", () => {
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
    expect(readClassificationDeleteConfirmationPreference("value")).toBe(true);
    expect(readClassificationDeleteConfirmationPreference("dimension")).toBe(true);
    expect(readScaleDeleteConfirmationPreference()).toBe(true);
    expect(readKeyboardAuthoringPreference()).toBe(false);
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("scales");
  });
});

describe("each setter updates the app state and remembers the choice", () => {
  it("measurement deletion confirmation", () => {
    act(() => setters.setConfirmMeasurementDeletion(false));
    expect(state.setConfirmMeasurementDeletionState).toHaveBeenCalledWith(false);
    expect(readMeasurementDeleteConfirmationPreference()).toBe(false);
    act(() => setters.setConfirmMeasurementDeletion(true));
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
  });

  it("scale deletion confirmation", () => {
    act(() => setters.setConfirmScaleDeletion(false));
    expect(state.setConfirmScaleDeletionState).toHaveBeenCalledWith(false);
    expect(readScaleDeleteConfirmationPreference()).toBe(false);
  });

  it("classification value and dimension confirmations are stored separately", () => {
    act(() => setters.setConfirmValueDeletion(false));
    expect(state.setConfirmValueDeletionState).toHaveBeenCalledWith(false);
    expect(readClassificationDeleteConfirmationPreference("value")).toBe(false);
    expect(readClassificationDeleteConfirmationPreference("dimension")).toBe(true);

    act(() => setters.setConfirmDimensionDeletion(false));
    expect(state.setConfirmDimensionDeletionState).toHaveBeenCalledWith(false);
    expect(readClassificationDeleteConfirmationPreference("dimension")).toBe(false);
  });

  it("keyboard authoring", () => {
    act(() => setters.setKeyboardAuthoringEnabled(true));
    expect(state.setKeyboardAuthoringEnabledState).toHaveBeenCalledWith(true);
    expect(readKeyboardAuthoringPreference()).toBe(true);
    act(() => setters.setKeyboardAuthoringEnabled(false));
    expect(readKeyboardAuthoringPreference()).toBe(false);
  });

  it("the workspace a recovered plan opens on", () => {
    act(() => setters.setRecoveredPlanStartupWorkspace("takeoff"));
    expect(state.setRecoveredPlanStartupWorkspaceState).toHaveBeenCalledWith("takeoff");
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("takeoff");
  });

  it("changing one preference leaves the others as they were", () => {
    act(() => setters.setConfirmScaleDeletion(false));
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
    expect(readKeyboardAuthoringPreference()).toBe(false);
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("scales");
  });
});

describe("when browser storage is unavailable", () => {
  it("still updates the app state for this page and does not throw", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(() => {
      act(() => {
        setters.setConfirmMeasurementDeletion(false);
        setters.setConfirmScaleDeletion(false);
        setters.setConfirmValueDeletion(false);
        setters.setConfirmDimensionDeletion(false);
        setters.setKeyboardAuthoringEnabled(true);
        setters.setRecoveredPlanStartupWorkspace("measurements");
      });
    }).not.toThrow();
    expect(state.setConfirmMeasurementDeletionState).toHaveBeenCalledWith(false);
    expect(state.setRecoveredPlanStartupWorkspaceState).toHaveBeenCalledWith("measurements");
  });

  it("falls back to the defaults when reading fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(readMeasurementDeleteConfirmationPreference()).toBe(true);
    expect(readScaleDeleteConfirmationPreference()).toBe(true);
    expect(readClassificationDeleteConfirmationPreference("value")).toBe(true);
    expect(readKeyboardAuthoringPreference()).toBe(false);
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("scales");
  });
});

describe("stored values that were edited or are out of date", () => {
  it("treats anything but the exact word false as 'keep asking'", () => {
    for (const key of [
      "plan-measure.confirm-scale-deletion",
      "plan-measure.confirm-value-deletion",
      "plan-measure.confirm-dimension-deletion",
    ]) {
      window.localStorage.setItem(key, "False");
      expect(readScaleDeleteConfirmationPreference()).toBe(true);
      window.localStorage.setItem(key, "0");
      expect(readClassificationDeleteConfirmationPreference("value")).toBe(true);
    }
  });

  it("opens recovered plans on Scales when the stored workspace is unknown", () => {
    for (const bad of [null, "", "Takeoff", "pages", "export", "calibrate"]) {
      expect(sanitizeRecoveredPlanStartupWorkspace(bad)).toBe("scales");
    }
    window.localStorage.setItem(RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY, "gone");
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("scales");
    for (const good of ["scales", "measurements", "takeoff", "classifications"] as const) {
      expect(sanitizeRecoveredPlanStartupWorkspace(good)).toBe(good);
    }
  });
});

describe("setter identity", () => {
  it("keeps the same functions across renders while the state setters do not change", () => {
    const before = { ...setters };
    act(() => root!.render(<Harness />));
    expect(setters).toEqual(before);
    for (const [name, setter] of Object.entries(before)) {
      expect(setters[name as keyof typeof setters], name).toBe(setter);
    }
  });
});
