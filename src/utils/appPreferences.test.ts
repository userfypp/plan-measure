/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  APP_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
  effectiveThousandsSeparator,
  getAppPreferences,
  FILL_OPACITY_SCALE,
  HANDLE_SIZE_SCALE,
  LABEL_BACKGROUND_OPACITY,
  LABEL_SIZE_SCALE,
  returnsToSelectAfterFinishing,
  ZOOM_STEP_FACTOR,
  LINE_THICKNESS_SCALE,
  reloadAppPreferencesFromStorage,
  resetAppPreferences,
  setAppPreference,
  subscribeAppPreferences,
} from "./appPreferences";
import { formatDisplayNumber } from "./format";

beforeEach(() => {
  window.localStorage.clear();
  reloadAppPreferencesFromStorage();
});

afterEach(() => {
  resetAppPreferences();
});

describe("appPreferences", () => {
  it("defaults canvas appearance to the original look and rejects unknown levels", () => {
    expect(getAppPreferences().lineThickness).toBe("normal");
    expect(getAppPreferences().labelSize).toBe("normal");
    expect(LINE_THICKNESS_SCALE.normal).toBe(1);
    expect(LABEL_SIZE_SCALE.normal).toBe(1);
    setAppPreference("lineThickness", "thick");
    setAppPreference("labelSize", "huge" as never);
    expect(getAppPreferences().lineThickness).toBe("thick");
    expect(getAppPreferences().labelSize).toBe("normal");
  });

  it("defaults the per-device canvas and interaction options to today's behaviour", () => {
    expect(getAppPreferences()).toMatchObject({
      fillOpacity: "normal",
      handleSize: "normal",
      labelBackground: "solid",
      afterFinishing: "keep",
      zoomStep: "normal",
    });
    expect(FILL_OPACITY_SCALE).toEqual({ light: 0.5, normal: 1, strong: 1.5 });
    expect(HANDLE_SIZE_SCALE).toEqual({ small: 0.75, normal: 1, large: 1.5 });
    expect(LABEL_BACKGROUND_OPACITY).toEqual({ solid: 1, translucent: 0.6, none: 0 });
    expect(ZOOM_STEP_FACTOR).toEqual({ fine: 1.1, normal: 1.25, coarse: 1.5 });
    setAppPreference("fillOpacity", "strong");
    setAppPreference("handleSize", "huge" as never);
    setAppPreference("labelBackground", "none");
    setAppPreference("afterFinishing", "later" as never);
    setAppPreference("zoomStep", "coarse");
    expect(getAppPreferences()).toMatchObject({
      fillOpacity: "strong",
      handleSize: "normal",
      labelBackground: "none",
      afterFinishing: "keep",
      zoomStep: "coarse",
    });
  });

  it("returns to Select after finishing only when asked, never for Count", () => {
    expect(returnsToSelectAfterFinishing("keep", "line")).toBe(false);
    expect(returnsToSelectAfterFinishing("select", "polygon")).toBe(true);
    expect(returnsToSelectAfterFinishing("select", "count")).toBe(false);
  });

  it("starts from defaults and persists changes as JSON", () => {
    expect(getAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    setAppPreference("maxZoom", 16);
    expect(JSON.parse(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      maxZoom: 16,
    });
  });

  it("falls back to defaults for corrupt storage and invalid individual values", () => {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, "{not json");
    reloadAppPreferencesFromStorage();
    expect(getAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);

    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ maxZoom: 3, undoDepth: 200, snapDefault: "yes", motion: "reduce" }),
    );
    reloadAppPreferencesFromStorage();
    expect(getAppPreferences()).toMatchObject({
      maxZoom: DEFAULT_APP_PREFERENCES.maxZoom,
      undoDepth: 200,
      snapDefault: false,
      motion: "reduce",
    });
  });

  it("ignores invalid values and notifies subscribers only on real changes", () => {
    let calls = 0;
    const unsubscribe = subscribeAppPreferences(() => (calls += 1));
    setAppPreference("undoDepth", 123 as never);
    setAppPreference("undoDepth", DEFAULT_APP_PREFERENCES.undoDepth);
    expect(calls).toBe(0);
    setAppPreference("undoDepth", 500);
    expect(calls).toBe(1);
    unsubscribe();
    setAppPreference("undoDepth", 50);
    expect(calls).toBe(1);
  });

  it("mirrors motion and tooltips onto the document element", () => {
    setAppPreference("motion", "reduce");
    setAppPreference("tooltips", false);
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(document.documentElement.dataset.tooltips).toBe("off");
    resetAppPreferences();
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(document.documentElement.dataset.tooltips).toBeUndefined();
  });

  it("drops a thousands mark that equals the decimal mark", () => {
    expect(effectiveThousandsSeparator("comma", "comma")).toBe("none");
    expect(effectiveThousandsSeparator("point", "point")).toBe("none");
    expect(effectiveThousandsSeparator("point", "comma")).toBe("point");
    expect(effectiveThousandsSeparator("space", "comma")).toBe("space");
  });
});

describe("formatDisplayNumber with separators", () => {
  it("is unchanged by default", () => {
    expect(formatDisplayNumber(1234567.891, 2)).toBe("1234567.89");
  });

  it("groups thousands and swaps the decimal mark", () => {
    setAppPreference("thousandsSeparator", "space");
    expect(formatDisplayNumber(1234567.891, 2)).toBe("1 234 567.89");
    setAppPreference("decimalSeparator", "comma");
    setAppPreference("thousandsSeparator", "point");
    expect(formatDisplayNumber(1234567.891, 2)).toBe("1.234.567,89");
    expect(formatDisplayNumber(-1234.5, 0)).toBe("-1.235");
    expect(formatDisplayNumber(999, 0)).toBe("999");
  });

  it("keeps tiny non-zero values explicit with the chosen decimal mark", () => {
    setAppPreference("decimalSeparator", "comma");
    expect(formatDisplayNumber(0.0004, 2)).toBe("0,0004");
  });
});
