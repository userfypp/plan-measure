export const PAGE_ROW_HEIGHT = 160;
export const PAGE_OVERSCAN = 2;

export function normalizePageSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
export function pageBrowserLabel(pageNumber: number, labels: readonly string[] | null): string {
  const label = labels?.[pageNumber - 1];
  return label?.trim() ? label : String(pageNumber);
}
export function filterPages(
  pageCount: number,
  labels: readonly string[] | null,
  search: string,
): number[] {
  const query = normalizePageSearch(search);
  return Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (number) =>
      !query ||
      normalizePageSearch(pageBrowserLabel(number, labels)).includes(query) ||
      String(number).includes(query),
  );
}
export function pageWindow(count: number, scrollTop: number, height: number) {
  const first = Math.max(
    0,
    Math.min(Math.max(0, count - 1), Math.floor(scrollTop / PAGE_ROW_HEIGHT)),
  );
  return {
    start: Math.max(0, first - PAGE_OVERSCAN),
    end: Math.min(count, Math.ceil((scrollTop + height) / PAGE_ROW_HEIGHT) + PAGE_OVERSCAN),
    first,
    last: Math.min(count, Math.ceil((scrollTop + height) / PAGE_ROW_HEIGHT)),
  };
}
export function parsePhysicalPage(value: string, pageCount: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= pageCount ? number : null;
}
