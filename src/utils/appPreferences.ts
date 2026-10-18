import { useSyncExternalStore } from "react";
import type { MeasurementDisplayUnit } from "../types/domain";

/**
 * Per-device preferences (not stored in the project). One typed registry:
 * every key has a default and a validator, so corrupt or outdated storage
 * always falls back to the default instead of breaking the app.
 */
export type MotionPreference = "system" | "reduce";
export type ThousandsSeparator = "none" | "space" | "comma" | "point";
export type DecimalSeparator = "point" | "comma";
export type Sensitivity = "low" | "normal" | "high";
export type LineThickness = "thin" | "normal" | "thick";
export type LabelSize = "small" | "normal" | "large";
export type FillOpacity = "light" | "normal" | "strong";
export type HandleSize = "small" | "normal" | "large";
export type LabelBackground = "solid" | "translucent" | "none";
/** "auto" keeps labels readable on the plan; the others pick one text color. */
export type LabelTextColor = "auto" | "black" | "white" | "blue" | "red";
export type AfterFinishing = "select" | "keep";
export type ZoomStep = "fine" | "normal" | "coarse";
export type DefaultZoom = "fit-page" | "fit-width" | "actual";
export type WheelBehavior = "zoom" | "pan";
export type DateFormat = "short" | "medium" | "with-time";
export type LabelContent = "value" | "name-value";
export type PageGrid = "off" | "fine" | "coarse";
export type AutosaveDelayMs = 300 | 1000 | 3000 | 10000;
export type ProjectsShown = "10" | "25" | "all";
export type FocusRing = "normal" | "thick";
export type TextSize = "100" | "110" | "125";
export type Contrast = "normal" | "more";
export type RenderQuality = "balanced" | "sharp" | "fast";
export type RasterCache = "small" | "normal" | "large";
export type HitTolerance = "tight" | "normal" | "wide";

export interface AppPreferences {
  motion: MotionPreference;
  tooltips: boolean;
  thousandsSeparator: ThousandsSeparator;
  decimalSeparator: DecimalSeparator;
  defaultDisplayUnit: MeasurementDisplayUnit;
  snapDefault: boolean;
  orthoDefault: boolean;
  snapSensitivity: Sensitivity;
  closeSensitivity: Sensitivity;
  maxZoom: 4 | 8 | 16;
  undoDepth: 50 | 100 | 200 | 500;
  renderDelayMs: 50 | 90 | 150 | 250;
  lineThickness: LineThickness;
  labelSize: LabelSize;
  fillOpacity: FillOpacity;
  handleSize: HandleSize;
  labelBackground: LabelBackground;
  labelTextColor: LabelTextColor;
  afterFinishing: AfterFinishing;
  zoomStep: ZoomStep;
  defaultZoom: DefaultZoom;
  wheelBehavior: WheelBehavior;
  dateFormat: DateFormat;
  widerSidebar: boolean;
  crosshairCursor: boolean;
  liveLength: boolean;
  finishOnDoubleClick: boolean;
  labelContent: LabelContent;
  pageGrid: PageGrid;
  autosaveDelayMs: AutosaveDelayMs;
  confirmBeforeClosing: boolean;
  projectsShown: ProjectsShown;
  focusRing: FocusRing;
  textSize: TextSize;
  contrast: Contrast;
  largeTargets: boolean;
  renderQuality: RenderQuality;
  rasterCache: RasterCache;
  hitTolerance: HitTolerance;
  debugOverlay: boolean;
}

export const APP_PREFERENCES_STORAGE_KEY = "plan-measure.preferences";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  motion: "system",
  tooltips: true,
  thousandsSeparator: "none",
  decimalSeparator: "point",
  defaultDisplayUnit: "m",
  snapDefault: false,
  orthoDefault: false,
  snapSensitivity: "normal",
  closeSensitivity: "normal",
  maxZoom: 8,
  undoDepth: 100,
  renderDelayMs: 90,
  lineThickness: "normal",
  labelSize: "normal",
  fillOpacity: "normal",
  handleSize: "normal",
  labelBackground: "solid",
  labelTextColor: "auto",
  afterFinishing: "keep",
  zoomStep: "normal",
  defaultZoom: "fit-page",
  wheelBehavior: "zoom",
  dateFormat: "medium",
  widerSidebar: false,
  crosshairCursor: true,
  liveLength: false,
  finishOnDoubleClick: false,
  labelContent: "value",
  pageGrid: "off",
  autosaveDelayMs: 300,
  confirmBeforeClosing: false,
  projectsShown: "all",
  focusRing: "normal",
  textSize: "100",
  contrast: "normal",
  largeTargets: false,
  renderQuality: "balanced",
  rasterCache: "normal",
  hitTolerance: "normal",
  debugOverlay: false,
};

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const oneOf =
  <T>(...allowed: readonly T[]) =>
  (value: unknown): value is T =>
    allowed.includes(value as T);

const VALIDATORS: { [K in keyof AppPreferences]: (value: unknown) => value is AppPreferences[K] } =
  {
    motion: oneOf("system", "reduce"),
    tooltips: isBoolean,
    thousandsSeparator: oneOf("none", "space", "comma", "point"),
    decimalSeparator: oneOf("point", "comma"),
    defaultDisplayUnit: oneOf<MeasurementDisplayUnit>("mm", "cm", "m", "in", "ft", "ft-in"),
    snapDefault: (value): value is boolean => typeof value === "boolean",
    orthoDefault: (value): value is boolean => typeof value === "boolean",
    snapSensitivity: oneOf("low", "normal", "high"),
    closeSensitivity: oneOf("low", "normal", "high"),
    maxZoom: oneOf(4, 8, 16),
    undoDepth: oneOf(50, 100, 200, 500),
    renderDelayMs: oneOf(50, 90, 150, 250),
    lineThickness: oneOf("thin", "normal", "thick"),
    labelSize: oneOf("small", "normal", "large"),
    fillOpacity: oneOf("light", "normal", "strong"),
    handleSize: oneOf("small", "normal", "large"),
    labelBackground: oneOf("solid", "translucent", "none"),
    labelTextColor: oneOf("auto", "black", "white", "blue", "red"),
    afterFinishing: oneOf("select", "keep"),
    zoomStep: oneOf("fine", "normal", "coarse"),
    defaultZoom: oneOf("fit-page", "fit-width", "actual"),
    wheelBehavior: oneOf("zoom", "pan"),
    dateFormat: oneOf("short", "medium", "with-time"),
    widerSidebar: isBoolean,
    crosshairCursor: isBoolean,
    liveLength: isBoolean,
    finishOnDoubleClick: isBoolean,
    labelContent: oneOf("value", "name-value"),
    pageGrid: oneOf("off", "fine", "coarse"),
    autosaveDelayMs: oneOf(300, 1000, 3000, 10000),
    confirmBeforeClosing: isBoolean,
    projectsShown: oneOf("10", "25", "all"),
    focusRing: oneOf("normal", "thick"),
    textSize: oneOf("100", "110", "125"),
    contrast: oneOf("normal", "more"),
    largeTargets: isBoolean,
    renderQuality: oneOf("balanced", "sharp", "fast"),
    rasterCache: oneOf("small", "normal", "large"),
    hitTolerance: oneOf("tight", "normal", "wide"),
    debugOverlay: isBoolean,
  };

/** Multipliers for on-canvas stroke width and measurement label text (normal keeps the original look). */
export const LINE_THICKNESS_SCALE: Record<LineThickness, number> = {
  thin: 0.75,
  normal: 1,
  thick: 1.5,
};
export const LABEL_SIZE_SCALE: Record<LabelSize, number> = { small: 0.85, normal: 1, large: 1.25 };

/** Alpha multiplier for on-screen fills (the result is capped at 1); exports never use it. */
export const FILL_OPACITY_SCALE: Record<FillOpacity, number> = {
  light: 0.5,
  normal: 1,
  strong: 1.5,
};
/** Multiplier for the visible handle radius only; the hit area does not change. */
export const HANDLE_SIZE_SCALE: Record<HandleSize, number> = { small: 0.75, normal: 1, large: 1.5 };
/** Opacity of the measurement label background (normal "solid" keeps the original look). */
export const LABEL_BACKGROUND_OPACITY: Record<LabelBackground, number> = {
  solid: 1,
  translucent: 0.75,
  none: 0,
};
/** Zoom factor per +/- step (normal matches the previous fixed 1.25). */
export const ZOOM_STEP_FACTOR: Record<ZoomStep, number> = { fine: 1.1, normal: 1.25, coarse: 1.5 };

/** Wheel gesture outcome: with "pan" the wheel scrolls and Ctrl/Cmd (or a trackpad pinch) zooms. */
export function wheelAction(
  behavior: WheelBehavior,
  modifier: { ctrlKey: boolean; metaKey: boolean },
): "zoom" | "pan" {
  return behavior === "zoom" || modifier.ctrlKey || modifier.metaKey ? "zoom" : "pan";
}

/** Whether finishing a measurement of this type should switch back to the Select tool. */
export function returnsToSelectAfterFinishing(
  afterFinishing: AfterFinishing,
  measurementType: string,
): boolean {
  return afterFinishing === "select" && measurementType !== "count";
}

/** Screen-pixel radius for each sensitivity level (normal matches the previous fixed 10 px). */
export const SENSITIVITY_PX: Record<Sensitivity, number> = { low: 6, normal: 10, high: 16 };

/** Raster cache limits per level (normal matches the previous fixed 2 entries / 8 Mpx). */
export const RASTER_CACHE_LIMITS: Record<RasterCache, { maxEntries: number; maxPixels: number }> = {
  small: { maxEntries: 1, maxPixels: 4 * 1024 * 1024 },
  normal: { maxEntries: 2, maxPixels: 8 * 1024 * 1024 },
  large: { maxEntries: 4, maxPixels: 16 * 1024 * 1024 },
};

/** On-screen hit stroke width of measurements (normal matches the previous fixed 12 px). */
export const HIT_TOLERANCE_PX: Record<HitTolerance, number> = { tight: 8, normal: 12, wide: 16 };

/** Keeps a separator pair readable: a thousands mark may never equal the decimal mark. */
export function effectiveThousandsSeparator(
  thousands: ThousandsSeparator,
  decimal: DecimalSeparator,
): ThousandsSeparator {
  if (thousands === "comma" && decimal === "comma") return "none";
  if (thousands === "point" && decimal === "point") return "none";
  return thousands;
}

function sanitize(raw: unknown): AppPreferences {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_APP_PREFERENCES } as Record<keyof AppPreferences, unknown>;
  for (const key of Object.keys(VALIDATORS) as Array<keyof AppPreferences>) {
    if (VALIDATORS[key](source[key])) result[key] = source[key];
  }
  return result as unknown as AppPreferences;
}

function readStored(): AppPreferences {
  try {
    const text = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

function writeStored(preferences: AppPreferences): void {
  try {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The preference stays active for this page even if browser storage is unavailable.
  }
}

/** Mirrors presentation preferences onto <html>, where plain CSS can react to them. */
function applyToDocument(preferences: AppPreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (preferences.motion === "reduce") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
  if (preferences.tooltips) delete root.dataset.tooltips;
  else root.dataset.tooltips = "off";
  if (preferences.focusRing === "normal") delete root.dataset.focusRing;
  else root.dataset.focusRing = preferences.focusRing;
  if (preferences.textSize === "100") delete root.dataset.textSize;
  else root.dataset.textSize = preferences.textSize;
  if (preferences.contrast === "normal") delete root.dataset.contrast;
  else root.dataset.contrast = preferences.contrast;
  if (preferences.largeTargets) root.dataset.targets = "large";
  else delete root.dataset.targets;
  if (preferences.widerSidebar) root.dataset.sidebar = "wide";
  else delete root.dataset.sidebar;
}

let current: AppPreferences =
  typeof window === "undefined" ? { ...DEFAULT_APP_PREFERENCES } : readStored();
applyToDocument(current);
const listeners = new Set<() => void>();

function commit(next: AppPreferences): void {
  current = next;
  writeStored(next);
  applyToDocument(next);
  listeners.forEach((listener) => listener());
}

export function getAppPreferences(): AppPreferences {
  return current;
}

export function setAppPreference<K extends keyof AppPreferences>(
  key: K,
  value: AppPreferences[K],
): void {
  if (!VALIDATORS[key](value) || current[key] === value) return;
  commit({ ...current, [key]: value });
}

export function resetAppPreferences(): void {
  commit({ ...DEFAULT_APP_PREFERENCES });
}

export const PREFERENCES_FILE_VERSION = 1;

/** Versioned JSON of every device preference, for moving settings between browsers. */
export function exportAppPreferencesJson(): string {
  return JSON.stringify({ version: PREFERENCES_FILE_VERSION, preferences: current }, null, 2);
}

/**
 * Applies a settings file. Unknown or invalid keys are ignored (the default is
 * used instead); a file that is not a version 1 settings file changes nothing.
 * Never throws.
 */
export function importAppPreferencesJson(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return false;
    const file = parsed as { version?: unknown; preferences?: unknown };
    if (file.version !== PREFERENCES_FILE_VERSION) return false;
    if (
      !file.preferences ||
      typeof file.preferences !== "object" ||
      Array.isArray(file.preferences)
    ) {
      return false;
    }
    commit(sanitize(file.preferences));
    return true;
  } catch {
    return false;
  }
}

export function subscribeAppPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller whenever any preference changes; the snapshot is replaced only on change. */
export function useAppPreferences(): AppPreferences {
  return useSyncExternalStore(subscribeAppPreferences, getAppPreferences, getAppPreferences);
}

/**
 * Subscribes the caller to the number-format preferences and returns a stable
 * key to include in memo dependencies of anything that formats display numbers.
 */
export function useNumberFormatKey(): string {
  const { thousandsSeparator, decimalSeparator } = useAppPreferences();
  return `${thousandsSeparator}|${decimalSeparator}`;
}

/** Test helper: reload from storage as a fresh page load would. */
export function reloadAppPreferencesFromStorage(): void {
  commit(readStored());
}
