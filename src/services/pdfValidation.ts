export const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024;

export class PdfUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfUserError";
  }
}

export function validatePdfFile(file: File): void {
  const hasPdfName = file.name.toLowerCase().endsWith(".pdf");
  const hasPdfMime = file.type === "application/pdf";
  if (!hasPdfName && !hasPdfMime) {
    throw new PdfUserError("Unsupported file type. Choose a PDF file.");
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new PdfUserError("This PDF is larger than the 100 MB limit.");
  }
}
