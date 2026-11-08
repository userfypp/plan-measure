import type { CountMeasurement } from "../types/domain";

type CountItemNames = Pick<CountMeasurement, "itemNames">;

/** The name given to an item, or "" when it has none. */
export function countItemName(measurement: CountItemNames, index: number): string {
  return measurement.itemNames?.[index] ?? "";
}

/** What the item is called in lists: its own name, else its position. */
export function countItemLabel(measurement: CountItemNames, index: number): string {
  return countItemName(measurement, index) || `Item ${index + 1}`;
}

/** Names aligned to the items with trailing blanks dropped; `undefined` once none is left. */
export function canonicalCountItemNames(names: readonly string[]): string[] | undefined {
  let end = names.length;
  while (end > 0 && !names[end - 1]) end--;
  return end > 0 ? names.slice(0, end) : undefined;
}

/** `measurement` with the names of its items replaced (the field is absent when no item is named). */
export function withCountItemNames<T extends CountMeasurement>(
  measurement: T,
  names: readonly string[],
): T {
  const itemNames = canonicalCountItemNames(names);
  const next: T = { ...measurement };
  if (itemNames) next.itemNames = itemNames;
  else delete next.itemNames;
  return next;
}

/** One name per item, padding the unnamed ones with "". */
export function alignedCountItemNames(measurement: CountMeasurement): string[] {
  return measurement.points.map((_, index) => countItemName(measurement, index));
}
