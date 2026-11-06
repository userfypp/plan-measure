/** Locale-independent comparison key; the stored display name is never changed. */
export function classificationNameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/** Case and accent insensitive form of a name, for matching a search. */
export function classificationSearchKey(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}
