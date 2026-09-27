import type { CurrentSession } from "../types/domain";
import { MAX_PDF_SIZE_BYTES } from "./pdfValidation";
import { deserializeSession, serializeSession } from "./persistenceCodec";

const MAGIC = "PLANMEASURE1";
const HEADER_SIZE = MAGIC.length + 4;
const MAX_SESSION_SIZE_BYTES = 100 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const PROJECT_FILE_EXTENSION = ".planmeasure";

export function projectFileName(pdfName: string): string {
  const baseName = pdfName.replace(/\.pdf$/i, "").replace(/[\\/]/g, "_");
  return `${baseName || "project"}${PROJECT_FILE_EXTENSION}`;
}

export function createProjectFile(session: CurrentSession, pdfBlob: Blob): Blob {
  if (pdfBlob.size !== session.pdf.size || pdfBlob.size > MAX_PDF_SIZE_BYTES) {
    throw new Error("The project PDF does not match its session metadata.");
  }
  const metadata = encoder.encode(JSON.stringify({ session: serializeSession(session) }));
  if (metadata.byteLength > MAX_SESSION_SIZE_BYTES) {
    throw new Error("The project data is too large to export.");
  }
  const header = new Uint8Array(HEADER_SIZE);
  header.set(encoder.encode(MAGIC));
  new DataView(header.buffer).setUint32(MAGIC.length, metadata.byteLength, true);
  return new Blob([header, metadata, pdfBlob], { type: "application/octet-stream" });
}

export async function readProjectFile(
  file: Blob,
): Promise<{ session: CurrentSession; pdfBlob: Blob }> {
  try {
    if (file.size < HEADER_SIZE) throw new Error();
    const header = new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer());
    if (decoder.decode(header.subarray(0, MAGIC.length)) !== MAGIC) throw new Error();
    const sessionSize = new DataView(header.buffer).getUint32(MAGIC.length, true);
    if (
      sessionSize === 0 ||
      sessionSize > MAX_SESSION_SIZE_BYTES ||
      sessionSize > file.size - HEADER_SIZE
    ) {
      throw new Error();
    }
    const metadata = JSON.parse(
      decoder.decode(await file.slice(HEADER_SIZE, HEADER_SIZE + sessionSize).arrayBuffer()),
    ) as unknown;
    if (
      typeof metadata !== "object" ||
      metadata === null ||
      Array.isArray(metadata) ||
      !("session" in metadata) ||
      typeof metadata.session !== "string"
    ) {
      throw new Error();
    }
    const session = deserializeSession(metadata.session);
    const pdfBlob = file.slice(HEADER_SIZE + sessionSize, undefined, "application/pdf");
    if (pdfBlob.size !== session.pdf.size || pdfBlob.size > MAX_PDF_SIZE_BYTES) {
      throw new Error();
    }
    return { session, pdfBlob };
  } catch {
    throw new Error("This project file is invalid or unsupported.");
  }
}
