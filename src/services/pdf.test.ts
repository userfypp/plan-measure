import { describe, expect, it } from "vitest";
import { MAX_PDF_SIZE_BYTES, PdfUserError, validatePdfFile } from "./pdfValidation";

function fileLike(name: string, type: string, size: number): File {
  return { name, type, size, lastModified: 1 } as File;
}

describe("PDF file validation", () => {
  it("accepts PDF extensions or PDF MIME types", () => {
    expect(() => validatePdfFile(fileLike("plan.pdf", "", 100))).not.toThrow();
    expect(() => validatePdfFile(fileLike("plan", "application/pdf", 100))).not.toThrow();
  });

  it("rejects unsupported file types", () => {
    expect(() => validatePdfFile(fileLike("plan.png", "image/png", 100))).toThrow(PdfUserError);
  });

  it("accepts files up to 100 MiB and rejects larger ones before loading", () => {
    expect(MAX_PDF_SIZE_BYTES).toBe(104_857_600);
    expect(() =>
      validatePdfFile(fileLike("large.pdf", "application/pdf", MAX_PDF_SIZE_BYTES)),
    ).not.toThrow();
    expect(() =>
      validatePdfFile(fileLike("large.pdf", "application/pdf", MAX_PDF_SIZE_BYTES + 1)),
    ).toThrow("This PDF is larger than the 100 MiB limit.");
  });
});
