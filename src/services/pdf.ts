import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfUserError } from "./pdfValidation";

export { MAX_PDF_SIZE_BYTES, PdfUserError, validatePdfFile } from "./pdfValidation";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function friendlyPdfError(error: unknown): PdfUserError {
  if (error instanceof PdfUserError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") {
    return new PdfUserError("Password-protected PDFs are not supported in this version.");
  }
  if (name === "InvalidPDFException" || name === "FormatError") {
    return new PdfUserError("This PDF is invalid or corrupt and could not be opened.");
  }
  return new PdfUserError("The PDF could not be loaded. Check the file and try again.");
}

export interface LoadedPdf {
  document: PDFDocumentProxy;
  loadingTask: PDFDocumentLoadingTask;
}

export async function loadPdf(blob: Blob): Promise<LoadedPdf> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const loadingTask = getDocument({ data: bytes });
  const passwordRequested = new Promise<never>((_resolve, reject) => {
    loadingTask.onPassword = () => {
      reject(new PdfUserError("Password-protected PDFs are not supported in this version."));
    };
  });
  try {
    return { document: await Promise.race([loadingTask.promise, passwordRequested]), loadingTask };
  } catch (error) {
    console.error("PDF.js failed to load the document.", error);
    await loadingTask.destroy().catch(() => undefined);
    throw friendlyPdfError(error);
  }
}

export function pdfRenderErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "RenderingCancelledException") return "";
  console.error("PDF.js failed to render the page.", error);
  return "This PDF page could not be rendered.";
}
