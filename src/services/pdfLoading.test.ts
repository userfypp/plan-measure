import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocument as getRealDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { loadPdf, PdfUserError } from "./pdf";

const mocked = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ getDocument: mocked.getDocument, GlobalWorkerOptions: {} }));

type MockTask = {
  promise: Promise<never>;
  destroy: ReturnType<typeof vi.fn>;
  onPassword?: () => void;
};

// One blank page encrypted with pypdf (RC4-40, user password "secret").
const PASSWORD_PROTECTED_PDF_BASE64 =
  "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPGE3YjgxN2I4M2I+Cj4+CmVuZG9iagoyIDAgb2Jq" +
  "Cjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5" +
  "cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJj" +
  "ZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCAyMDAgMzAwIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAw" +
  "IG9iago8PAovViAxCi9SIDIKL0xlbmd0aCA0MAovUCA0Mjk0OTY3MjkyCi9GaWx0ZXIgL1N0YW5kYXJkCi9PIDw5" +
  "MmZlMGY0NDU0YWQ0Yzk2NDQ2OTNmMzNjMDdjYjU0ZjU4N2RjZTFlMjY4MmZlOWVjZWE2MTA3YTFlZjYzMGRkPgov" +
  "VSA8ZjAxZTU5NGRiMTdjNzI2Nzk1ZTRjMGVmODJiMWQzMGJkZjRiZGM1NGZkZmEzNWM1M2NlMDE3ZDgzZGNkNTgy" +
  "Yj4KPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAw" +
  "MDAwMDU5IDAwMDAwIG4gCjAwMDAwMDAxMTggMDAwMDAgbiAKMDAwMDAwMDE2NyAwMDAwMCBuIAowMDAwMDAwMjYx" +
  "IDAwMDAwIG4gCnRyYWlsZXIKPDwKL1NpemUgNgovUm9vdCAzIDAgUgovSW5mbyAxIDAgUgovSUQgWyA8NjIzMTYz" +
  "NjU2NjMwMzM2NjM0NjUzNzM1MzczNzYyNjYzMzM5MzYzMTY0NjU2NDYxMzkzNjM0MzQzOTY1NjEzMD4gPDYyMzE2" +
  "MzY1NjYzMDMzNjYzNDY1MzczNTM3Mzc2MjY2MzMzOTM2MzE2NDY1NjQ2MTM5MzYzNDM0Mzk2NTYxMzA+IF0KL0Vu" +
  "Y3J5cHQgNSAwIFIKPj4Kc3RhcnR4cmVmCjQ3NQolJUVPRgo=";

function realTaskSpy(tasks: PDFDocumentLoadingTask[]) {
  return (source: Parameters<typeof getRealDocument>[0]) => {
    const task = getRealDocument(source);
    vi.spyOn(task, "destroy");
    tasks.push(task);
    return task;
  };
}

function pendingTask(): MockTask {
  return {
    promise: new Promise<never>(() => undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function failingTask(error: Error): MockTask {
  return { promise: Promise.reject(error), destroy: vi.fn().mockResolvedValue(undefined) };
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  mocked.getDocument.mockReset();
});

describe("PDF loading failures", () => {
  it("rejects a password-protected PDF as soon as PDF.js asks for a password and destroys its task", async () => {
    const task = pendingTask();
    mocked.getDocument.mockReturnValue(task);
    const loading = loadPdf(new Blob(["%PDF-1.7"]));
    await vi.waitFor(() => expect(task.onPassword).toBeTypeOf("function"));

    task.onPassword!();

    await expect(loading).rejects.toThrow(
      new PdfUserError("Password-protected PDFs are not supported in this version."),
    );
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["PasswordException", "Password-protected PDFs are not supported in this version."],
    ["InvalidPDFException", "This PDF is invalid or corrupt and could not be opened."],
    ["FormatError", "This PDF is invalid or corrupt and could not be opened."],
    ["UnknownErrorException", "The PDF could not be loaded. Check the file and try again."],
  ])("explains a %s from the parser and destroys the loading task", async (name, message) => {
    const task = failingTask(namedError(name));
    mocked.getDocument.mockReturnValue(task);

    const loading = loadPdf(new Blob(["%PDF-1.7"]));

    await expect(loading).rejects.toBeInstanceOf(PdfUserError);
    await expect(loading).rejects.toThrow(message);
    expect(task.destroy).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "PDF.js failed to load the document.",
      expect.any(Error),
    );
  });

  it("keeps the explained error when destroying the failed task also fails", async () => {
    const task = failingTask(namedError("InvalidPDFException"));
    task.destroy.mockRejectedValue(new Error("Worker already terminated"));
    mocked.getDocument.mockReturnValue(task);

    await expect(loadPdf(new Blob(["%PDF-1.7"]))).rejects.toThrow(
      "This PDF is invalid or corrupt and could not be opened.",
    );
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  it("reports corrupt bytes rejected by the real PDF.js parser and destroys that task", async () => {
    const tasks: PDFDocumentLoadingTask[] = [];
    mocked.getDocument.mockImplementation(realTaskSpy(tasks));

    await expect(loadPdf(new Blob(["this is not a PDF"]))).rejects.toThrow(
      "This PDF is invalid or corrupt and could not be opened.",
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(tasks[0]!.destroyed).toBe(true);
  });

  it("rejects a real password-protected PDF and destroys its PDF.js task", async () => {
    const tasks: PDFDocumentLoadingTask[] = [];
    mocked.getDocument.mockImplementation(realTaskSpy(tasks));
    const bytes = Uint8Array.from(atob(PASSWORD_PROTECTED_PDF_BASE64), (char) =>
      char.charCodeAt(0),
    );

    await expect(loadPdf(new Blob([bytes]))).rejects.toThrow(
      "Password-protected PDFs are not supported in this version.",
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(tasks[0]!.destroyed).toBe(true);
  });
});
