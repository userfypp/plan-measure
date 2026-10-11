/** Selectable colors for revision clouds. Stored as lowercase `#rrggbb`. */
export const CLOUD_COLOR_PALETTE = [
  { value: "#d92d20", label: "Red" },
  { value: "#f26b1d", label: "Orange" },
  { value: "#e6b800", label: "Yellow" },
  { value: "#2e9e4f", label: "Green" },
  { value: "#2465c7", label: "Blue" },
  { value: "#7a4bd1", label: "Purple" },
  { value: "#d6338a", label: "Magenta" },
  { value: "#3b4350", label: "Dark gray" },
] as const;

export type CloudColor = (typeof CLOUD_COLOR_PALETTE)[number]["value"];

/** Review red: the color of a cloud that has no explicit color. */
export const DEFAULT_CLOUD_COLOR: CloudColor = "#d92d20";

/** Alpha (0-1) of the cloud fill relative to its stroke color. */
export const CLOUD_FILL_OPACITY = 0.08;

export function isCloudColor(value: unknown): value is CloudColor {
  return CLOUD_COLOR_PALETTE.some((entry) => entry.value === value);
}

export function resolveCloudColor(color: string | undefined): CloudColor {
  return isCloudColor(color) ? color : DEFAULT_CLOUD_COLOR;
}

/** Appends an alpha channel (0-1) to a `#rrggbb` color. */
export function withHexAlpha(color: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${color}${byte.toString(16).padStart(2, "0")}`;
}

export function hexToRgb(color: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(color.slice(1, 3), 16),
    g: parseInt(color.slice(3, 5), 16),
    b: parseInt(color.slice(5, 7), 16),
  };
}
