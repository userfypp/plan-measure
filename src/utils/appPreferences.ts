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
};

const oneOf =
  <T>(...allowed: readonly T[]) =>
  (value: unknown): value is T =>
    allowed.includes(value as T);

const VALIDATORS: { [K in keyof AppPreferences]: (value: unknown) => value is AppPreferences[K] } =
  {
    motion: oneOf("system", "reduce"),
    tooltips: (value): value is boolean => typeof value === "boolean",
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
  };

/** Screen-pixel radius for each sensitivity level (normal matches the previous fixed 10 px). */
export const SENSITIVITY_PX: Record<Sensitivity, number> = { low: 6, normal: 10, high: 16 };

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
