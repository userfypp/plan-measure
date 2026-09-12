/** Locale-independent comparison key; the stored display name is never changed. */
export function classificationNameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}
