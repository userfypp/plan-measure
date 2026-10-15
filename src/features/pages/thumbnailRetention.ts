/** Thumbnails a closed page browser keeps for its document, so reopening it shows them at once. */
export interface RetainedThumbnails {
  dispose(): void;
}

// This module has no PDF dependencies, so the viewer shell can release a document's thumbnails
// when that document closes without loading the page browser.
let retained: RetainedThumbnails | null = null;

export function retainedThumbnails(): RetainedThumbnails | null {
  return retained;
}
/** Keeps one document's thumbnails, releasing those of any other. */
export function retainThumbnails(value: RetainedThumbnails): void {
  if (retained && retained !== value) retained.dispose();
  retained = value;
}
/** Hands the retained thumbnails back to an open page browser, which owns them from then on. */
export function reclaimThumbnails(value: RetainedThumbnails): void {
  if (retained === value) retained = null;
}
/** Releases any retained thumbnails, e.g. when their document closes. */
export function releaseRetainedThumbnails(): void {
  if (!retained) return;
  const released = retained;
  retained = null;
  released.dispose();
}
