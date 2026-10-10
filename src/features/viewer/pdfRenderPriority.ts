import type { PDFDocumentProxy } from "pdfjs-dist";

// Runtime-only coordination. Subscribers never update session or annotation state.
interface Priority {
  owners: Set<object>;
  listeners: Set<() => void>;
  pageNumber: number;
}
const priorities = new WeakMap<PDFDocumentProxy, Priority>();
function priority(document: PDFDocumentProxy): Priority {
  let value = priorities.get(document);
  if (!value) {
    value = { owners: new Set(), listeners: new Set(), pageNumber: 1 };
    priorities.set(document, value);
  }
  return value;
}
export function setMainPdfBusy(document: PDFDocumentProxy, owner: object, busy: boolean) {
  const value = priority(document);
  if (busy === value.owners.has(owner)) return;
  if (busy) value.owners.add(owner);
  else value.owners.delete(owner);
  value.listeners.forEach((listener) => listener());
}
export function setMainPdfPage(document: PDFDocumentProxy, pageNumber: number) {
  priority(document).pageNumber = pageNumber;
}
export function mainPdfPage(document: PDFDocumentProxy) {
  return priority(document).pageNumber;
}
export function mainPdfBusy(document: PDFDocumentProxy) {
  return priority(document).owners.size > 0;
}
export function subscribePdfPriority(document: PDFDocumentProxy, listener: () => void) {
  const value = priority(document);
  value.listeners.add(listener);
  return () => {
    value.listeners.delete(listener);
  };
}
