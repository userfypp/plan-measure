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
/** The pages a newly opened, unfiltered panel shows first: visible rows, then overscan rows. */
export function initialPageWindow(pageCount: number, currentPage: number, height: number) {
  // A new list starts at the top and scrolls the current page just into view.
  const bottom = Math.max(0, Math.min(pageCount, currentPage)) * PAGE_ROW_HEIGHT;
  const scrollTop = Math.max(0, Math.min(bottom - height, pageCount * PAGE_ROW_HEIGHT - height));
  const range = pageWindow(pageCount, scrollTop, height);
  const pages: number[] = [];
  for (let index = range.first; index < range.last; index++) pages.push(index + 1);
  for (let index = range.start; index < range.end; index++)
    if (index < range.first || index >= range.last) pages.push(index + 1);
  return pages;
}
