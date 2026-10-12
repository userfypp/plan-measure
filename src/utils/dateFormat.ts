import type { DateFormat } from "./appPreferences";

const OPTIONS: Record<DateFormat, Intl.DateTimeFormatOptions> = {
  short: { dateStyle: "short" },
  medium: { dateStyle: "medium" },
  "with-time": { dateStyle: "medium", timeStyle: "short" },
};

/** Locale-aware date shown in the project library (screen only). */
export function formatSavedDate(timestamp: number, format: DateFormat): string {
  return new Intl.DateTimeFormat(undefined, OPTIONS[format]).format(timestamp);
}
