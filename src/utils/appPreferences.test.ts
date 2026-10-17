/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  APP_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
  effectiveThousandsSeparator,
  exportAppPreferencesJson,
  importAppPreferencesJson,
  getAppPreferences,
  FILL_OPACITY_SCALE,
  HANDLE_SIZE_SCALE,
  HIT_TOLERANCE_PX,
  RASTER_CACHE_LIMITS,
  LABEL_BACKGROUND_OPACITY,
  LABEL_SIZE_SCALE,
  returnsToSelectAfterFinishing,
  wheelAction,
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
      labelTextColor: "auto",
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
    setAppPreference("labelTextColor", "black");
    setAppPreference("afterFinishing", "later" as never);
    setAppPreference("zoomStep", "coarse");
    expect(getAppPreferences()).toMatchObject({
      fillOpacity: "strong",
      handleSize: "normal",
      labelBackground: "none",
      labelTextColor: "black",
      afterFinishing: "keep",
      zoomStep: "coarse",
    });
  });

  it("defaults the interface, drawing, label and grid options to today's behaviour", () => {
    expect(getAppPreferences()).toMatchObject({
      defaultZoom: "fit-page",
      wheelBehavior: "zoom",
      dateFormat: "medium",
      crosshairCursor: true,
      liveLength: false,
      finishOnDoubleClick: false,
      labelContent: "value",
      pageGrid: "off",
    });
    setAppPreference("defaultZoom", "bogus" as never);
    setAppPreference("wheelBehavior", "pan");
    setAppPreference("crosshairCursor", "yes" as never);
    setAppPreference("pageGrid", "coarse");
    expect(getAppPreferences()).toMatchObject({
      defaultZoom: "fit-page",
      wheelBehavior: "pan",
      crosshairCursor: true,
      pageGrid: "coarse",
    });
  });

  it("makes the wheel zoom or pan, with Ctrl or Cmd always zooming", () => {
    const none = { ctrlKey: false, metaKey: false };
    expect(wheelAction("zoom", none)).toBe("zoom");
    expect(wheelAction("pan", none)).toBe("pan");
    expect(wheelAction("pan", { ctrlKey: true, metaKey: false })).toBe("zoom");
    expect(wheelAction("pan", { ctrlKey: false, metaKey: true })).toBe("zoom");
    expect(wheelAction("zoom", { ctrlKey: true, metaKey: false })).toBe("zoom");
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

  it("mirrors the focus ring onto the document element only when not default", () => {
    expect(DEFAULT_APP_PREFERENCES.focusRing).toBe("normal");
    expect(document.documentElement.dataset.focusRing).toBeUndefined();
    setAppPreference("focusRing", "thick");
    expect(document.documentElement.dataset.focusRing).toBe("thick");
    resetAppPreferences();
    expect(document.documentElement.dataset.focusRing).toBeUndefined();
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({ focusRing: "huge" }));
    reloadAppPreferencesFromStorage();
    expect(getAppPreferences().focusRing).toBe("normal");
    expect(document.documentElement.dataset.focusRing).toBeUndefined();
  });

  it("mirrors the text size onto the document element only when not default", () => {
    expect(DEFAULT_APP_PREFERENCES.textSize).toBe("100");
    expect(document.documentElement.dataset.textSize).toBeUndefined();
    setAppPreference("textSize", "110");
    expect(document.documentElement.dataset.textSize).toBe("110");
    setAppPreference("textSize", "125");
    expect(document.documentElement.dataset.textSize).toBe("125");
    resetAppPreferences();
    expect(document.documentElement.dataset.textSize).toBeUndefined();
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({ textSize: "200" }));
    reloadAppPreferencesFromStorage();
    expect(getAppPreferences().textSize).toBe("100");
    expect(document.documentElement.dataset.textSize).toBeUndefined();
  });

  it("mirrors high contrast onto the document element only when enabled", () => {
    expect(DEFAULT_APP_PREFERENCES.contrast).toBe("normal");
    expect(document.documentElement.dataset.contrast).toBeUndefined();
    setAppPreference("contrast", "more");
    expect(document.documentElement.dataset.contrast).toBe("more");
    resetAppPreferences();
    expect(document.documentElement.dataset.contrast).toBeUndefined();
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({ contrast: "max" }));
    reloadAppPreferencesFromStorage();
    expect(getAppPreferences().contrast).toBe("normal");
    expect(document.documentElement.dataset.contrast).toBeUndefined();
  });

  it("mirrors larger touch targets onto the document element only when enabled", () => {
    expect(DEFAULT_APP_PREFERENCES.largeTargets).toBe(false);
    expect(document.documentElement.dataset.targets).toBeUndefined();
    setAppPreference("largeTargets", true);
    expect(document.documentElement.dataset.targets).toBe("large");
    setAppPreference("largeTargets", false);
    expect(document.documentElement.dataset.targets).toBeUndefined();
    setAppPreference("largeTargets", true);
    resetAppPreferences();
    expect(document.documentElement.dataset.targets).toBeUndefined();
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ largeTargets: "yes" }),
    );
    reloadAppPreferencesFromStorage();
    expect(getAppPreferences().largeTargets).toBe(false);
  });

  it("mirrors the wider sidebar onto the document element only when enabled", () => {
    expect(DEFAULT_APP_PREFERENCES.widerSidebar).toBe(false);
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    setAppPreference("widerSidebar", true);
    expect(document.documentElement.dataset.sidebar).toBe("wide");
    setAppPreference("widerSidebar", false);
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    setAppPreference("widerSidebar", true);
    resetAppPreferences();
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ widerSidebar: "yes" }),
    );
    reloadAppPreferencesFromStorage();
    expect(getAppPreferences().widerSidebar).toBe(false);
  });

  it("leaves no accessibility attribute on <html> after a reset", () => {
    setAppPreference("focusRing", "thick");
    setAppPreference("textSize", "125");
    setAppPreference("contrast", "more");
    expect(document.documentElement.dataset.focusRing).toBe("thick");
    resetAppPreferences();
    expect(document.documentElement.hasAttribute("data-focus-ring")).toBe(false);
    expect(document.documentElement.hasAttribute("data-text-size")).toBe(false);
    expect(document.documentElement.hasAttribute("data-contrast")).toBe(false);
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

describe("performance preferences", () => {
  it("default to today's behaviour", () => {
    expect(DEFAULT_APP_PREFERENCES).toMatchObject({
      renderQuality: "balanced",
      rasterCache: "normal",
      hitTolerance: "normal",
      debugOverlay: false,
    });
    expect(RASTER_CACHE_LIMITS.normal).toEqual({ maxEntries: 2, maxPixels: 8 * 1024 * 1024 });
    expect(HIT_TOLERANCE_PX).toEqual({ tight: 8, normal: 12, wide: 16 });
  });

  it("rejects invalid values and persists valid ones through the settings file", () => {
    setAppPreference("renderQuality", "ultra" as never);
    setAppPreference("rasterCache", "huge" as never);
    setAppPreference("hitTolerance", 3 as never);
    setAppPreference("debugOverlay", "yes" as never);
    expect(getAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    setAppPreference("renderQuality", "fast");
    setAppPreference("rasterCache", "large");
    setAppPreference("hitTolerance", "wide");
    setAppPreference("debugOverlay", true);
    const json = exportAppPreferencesJson();
    resetAppPreferences();
    expect(getAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    expect(importAppPreferencesJson(json)).toBe(true);
    expect(getAppPreferences()).toMatchObject({
      renderQuality: "fast",
      rasterCache: "large",
      hitTolerance: "wide",
      debugOverlay: true,
    });
  });
});

describe("settings file", () => {
  it("defaults keep the previous save, closing and library behaviour", () => {
    expect(DEFAULT_APP_PREFERENCES).toMatchObject({
      autosaveDelayMs: 300,
      confirmBeforeClosing: false,
      projectsShown: "all",
    });
  });

  it("round-trips every preference through a versioned JSON file", () => {
    setAppPreference("autosaveDelayMs", 3000);
    setAppPreference("projectsShown", "25");
    setAppPreference("confirmBeforeClosing", true);
    setAppPreference("lineThickness", "thick");
    const json = exportAppPreferencesJson();
    expect(JSON.parse(json)).toMatchObject({ version: 1, preferences: { autosaveDelayMs: 3000 } });
    const exported = getAppPreferences();
    resetAppPreferences();
    expect(getAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    expect(importAppPreferencesJson(json)).toBe(true);
    expect(getAppPreferences()).toEqual(exported);
    expect(JSON.parse(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? "{}")).toEqual(
      exported,
    );
  });

  it("round-trips the accessibility preferences and re-applies their attributes", () => {
    setAppPreference("focusRing", "thick");
    setAppPreference("textSize", "110");
    setAppPreference("contrast", "more");
    const json = exportAppPreferencesJson();
    expect(JSON.parse(json).preferences).toMatchObject({
      focusRing: "thick",
      textSize: "110",
      contrast: "more",
    });
    resetAppPreferences();
    expect(document.documentElement.hasAttribute("data-contrast")).toBe(false);
    expect(importAppPreferencesJson(json)).toBe(true);
    expect(getAppPreferences()).toMatchObject({
      focusRing: "thick",
      textSize: "110",
      contrast: "more",
    });
    expect(document.documentElement.dataset.focusRing).toBe("thick");
    expect(document.documentElement.dataset.textSize).toBe("110");
    expect(document.documentElement.dataset.contrast).toBe("more");
  });

  it("ignores unknown and invalid keys, falling back to the defaults", () => {
    setAppPreference("labelSize", "large");
    const applied = importAppPreferencesJson(
      JSON.stringify({
        version: 1,
        preferences: {
          lineThickness: "thick",
          autosaveDelayMs: 42,
          projectsShown: 10,
          tooltips: "yes",
          unknownKey: true,
        },
      }),
    );
    expect(applied).toBe(true);
    expect(getAppPreferences()).toEqual({ ...DEFAULT_APP_PREFERENCES, lineThickness: "thick" });
  });

  it.each([
    "not json",
    "",
    "null",
    "[]",
    '"text"',
    JSON.stringify({ preferences: { lineThickness: "thick" } }),
    JSON.stringify({ version: 2, preferences: { lineThickness: "thick" } }),
    JSON.stringify({ version: 1 }),
    JSON.stringify({ version: 1, preferences: "x" }),
  ])("never throws and changes nothing for an unusable file (%s)", (text) => {
    setAppPreference("labelSize", "large");
    const before = getAppPreferences();
    expect(importAppPreferencesJson(text)).toBe(false);
    expect(getAppPreferences()).toBe(before);
  });
});
