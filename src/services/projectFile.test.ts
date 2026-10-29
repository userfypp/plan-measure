import { describe, expect, it } from "vitest";
import { createEmptySession } from "../app/sessionState";
import { MAX_PDF_SIZE_BYTES } from "./pdfValidation";
import { serializeSession } from "./persistenceCodec";
import { createProjectFile, projectFileName, readProjectFile } from "./projectFile";

function measuredSession() {
  const session = createEmptySession({ name: "Level 01.pdf", size: 8, lastModified: 123 }, 2);
  session.currentPage = 2;
  session.settings.displayUnit = "ft-in";
  session.settings.showLabels = false;
  session.settings.measurementDecimalPlaces = 3;
  session.classificationCatalog.dimensions.push({
    id: "trade",
    name: "Trade",
    archived: false,
    values: [{ id: "walls", name: "Walls", archived: false }],
  });
  session.pages[2]!.calibrations.push({
    id: "scale",
    name: "Scale 1",
    mode: "uniform",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    referenceDistanceMm: 1000,
  });
  session.pages[2]!.activeCalibrationId = "scale";
  session.pages[2]!.nextCalibrationNumber = 2;
  session.pages[2]!.measurements.push({
    id: "wall-1",
    name: "North wall",
    type: "line",
    calibrationId: "scale",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    classificationValueIds: ["walls"],
    visible: false,
    note: "Check on site",
  });
  return session;
}

describe("portable project files", () => {
  it("round trips the session and embedded PDF", async () => {
    const session = measuredSession();
    const pdf = new Blob(["%PDF-1.7"]);

    const result = await readProjectFile(createProjectFile(session, pdf));

    expect(result.session).toEqual(session);
    expect(await result.pdfBlob.text()).toBe("%PDF-1.7");
    expect(result.pdfBlob.type).toBe("application/pdf");
    expect(projectFileName(session.pdf.name)).toBe("Level 01.planmeasure");
  });

  it("keeps the label classification dimension", async () => {
    const session = measuredSession();
    session.settings.labelClassificationDimensionId = "trade";

    const result = await readProjectFile(createProjectFile(session, new Blob(["%PDF-1.7"])));

    expect(result.session.settings.labelClassificationDimensionId).toBe("trade");
  });

  it("round trips a large polygon without changing or truncating its vertices", async () => {
    const session = measuredSession();
    const measurement = session.pages[2]!.measurements[0]!;
    measurement.type = "polygon";
    measurement.points = Array.from({ length: 10_000 }, (_, index) => ({
      x: 50 + 40 * Math.cos((index / 10_000) * 2 * Math.PI),
      y: 50 + 40 * Math.sin((index / 10_000) * 2 * Math.PI),
    }));

    const result = await readProjectFile(createProjectFile(session, new Blob(["%PDF-1.7"])));

    expect(result.session).toEqual(session);
    expect(result.session.pages[2]!.measurements[0]!.points).toHaveLength(10_000);
  });

  it("rejects an unsupported header, truncated PDF, and mismatched export PDF", async () => {
    const session = measuredSession();
    const file = createProjectFile(session, new Blob(["%PDF-1.7"]));

    await expect(readProjectFile(new Blob(["unknown", file]))).rejects.toThrow(
      "invalid or unsupported",
    );
    await expect(readProjectFile(file.slice(0, file.size - 1))).rejects.toThrow(
      "invalid or unsupported",
    );
    expect(() => createProjectFile(session, new Blob(["short"]))).toThrow("does not match");
  });

  it("rejects an invalid saved session before exposing the PDF", async () => {
    const session = measuredSession();
    const file = createProjectFile(session, new Blob(["%PDF-1.7"]));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const headerSize = "PLANMEASURE1".length + 4;
    const metadataSize = new DataView(bytes.buffer).getUint32("PLANMEASURE1".length, true);
    const metadata = JSON.parse(
      new TextDecoder().decode(bytes.slice(headerSize, headerSize + metadataSize)),
    );
    metadata.session = JSON.stringify({ schemaVersion: 999 });
    const replacement = new TextEncoder().encode(JSON.stringify(metadata));
    const header = bytes.slice(0, headerSize);
    new DataView(header.buffer).setUint32("PLANMEASURE1".length, replacement.length, true);

    await expect(
      readProjectFile(new Blob([header, replacement, file.slice(headerSize + metadataSize)])),
    ).rejects.toThrow("invalid or unsupported");
  });
});

describe("malformed project files", () => {
  const MAGIC = "PLANMEASURE1";
  const HEADER_SIZE = MAGIC.length + 4;
  const MAX_METADATA_BYTES = 100 * 1024 * 1024;
  const PDF = "%PDF-1.7";

  function header(
    declaredMetadataSize: number,
    magic: Uint8Array = new TextEncoder().encode(MAGIC),
  ) {
    const bytes = new Uint8Array(HEADER_SIZE);
    bytes.set(magic);
    new DataView(bytes.buffer).setUint32(MAGIC.length, declaredMetadataSize, true);
    return bytes;
  }

  function projectBytes(
    metadata: Uint8Array<ArrayBuffer>,
    pdf: BlobPart = PDF,
    declaredSize = metadata.length,
  ) {
    return new Blob([header(declaredSize), metadata, pdf]);
  }

  function metadataFor(value: unknown) {
    return new TextEncoder().encode(JSON.stringify(value));
  }

  /** A file whose embedded PDF is only sized, so size limits can be checked without allocating it. */
  function withSizedPdf(prefix: Blob, pdfSize: number): Blob {
    return {
      size: prefix.size + pdfSize,
      slice(start = 0, end?: number, type?: string) {
        if (start >= prefix.size)
          return { size: (end ?? prefix.size + pdfSize) - start, type } as Blob;
        return prefix.slice(start, end, type);
      },
    } as Blob;
  }

  function sessionPrefix(pdfSize: number) {
    const session = measuredSession();
    session.pdf.size = pdfSize;
    const metadata = metadataFor({ session: serializeSession(session) });
    return new Blob([header(metadata.length), metadata]);
  }

  it.each([
    ["a file shorter than the header", () => new Blob([MAGIC])],
    ["an empty file", () => new Blob([])],
    [
      "a header that is not valid UTF-8",
      () => new Blob([header(2, new Uint8Array(MAGIC.length).fill(0xff)), "{}", PDF]),
    ],
    [
      "metadata that is not valid UTF-8",
      () => projectBytes(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d])),
    ],
    ["metadata that is not JSON", () => projectBytes(new TextEncoder().encode("{session"))],
    ["null metadata", () => projectBytes(metadataFor(null))],
    ["array metadata", () => projectBytes(metadataFor([{ session: "{}" }]))],
    ["numeric metadata", () => projectBytes(metadataFor(42))],
    ["string metadata", () => projectBytes(metadataFor("session"))],
    ["metadata without a session", () => projectBytes(metadataFor({ pdf: PDF }))],
    ["a numeric session", () => projectBytes(metadataFor({ session: 1 }))],
    ["an object session", () => projectBytes(metadataFor({ session: {} }))],
    ["a session that is not JSON", () => projectBytes(metadataFor({ session: "{" }))],
  ])("rejects %s", async (_, file) => {
    await expect(readProjectFile(file())).rejects.toThrow(
      "This project file is invalid or unsupported.",
    );
  });

  it.each([
    ["empty", () => projectBytes(new Uint8Array(), PDF, 0)],
    ["beyond the end of the file", () => projectBytes(metadataFor({ session: "{}" }), "", 1_000)],
    [
      "above the limit",
      () => withSizedPdf(new Blob([header(MAX_METADATA_BYTES + 1)]), MAX_METADATA_BYTES + 1),
    ],
  ])("rejects a metadata length %s without reading the metadata", async (_, createFile) => {
    const file = createFile();
    const reads: Array<[number | undefined, number | undefined]> = [];
    const tracked = {
      size: file.size,
      slice: (start?: number, end?: number, type?: string) => {
        reads.push([start, end]);
        return file.slice(start, end, type);
      },
    } as Blob;

    await expect(readProjectFile(tracked)).rejects.toThrow(
      "This project file is invalid or unsupported.",
    );
    expect(reads).toEqual([[0, HEADER_SIZE]]);
  });

  it("rejects metadata whose only defect is an invalid UTF-8 byte inside a string", async () => {
    const file = createProjectFile(measuredSession(), new Blob([PDF]));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = new TextEncoder().encode("Level 01");
    const at = bytes.findIndex((_, index) =>
      name.every((byte, offset) => bytes[index + offset] === byte),
    );
    expect(at).toBeGreaterThan(HEADER_SIZE);
    // A lenient decoder would read this as "Level \uFFFD1" and accept the project.
    bytes[at + "Level ".length] = 0xff;

    await expect(readProjectFile(new Blob([bytes]))).rejects.toThrow(
      "This project file is invalid or unsupported.",
    );
  });

  it("accepts an embedded PDF at the size limit and rejects one above it", async () => {
    const atLimit = await readProjectFile(
      withSizedPdf(sessionPrefix(MAX_PDF_SIZE_BYTES), MAX_PDF_SIZE_BYTES),
    );
    expect(atLimit.session.pdf.size).toBe(MAX_PDF_SIZE_BYTES);
    expect(atLimit.pdfBlob.size).toBe(MAX_PDF_SIZE_BYTES);

    await expect(
      readProjectFile(withSizedPdf(sessionPrefix(MAX_PDF_SIZE_BYTES + 1), MAX_PDF_SIZE_BYTES + 1)),
    ).rejects.toThrow("This project file is invalid or unsupported.");
  });

  it("refuses to export a PDF above the size limit", () => {
    const session = measuredSession();
    session.pdf.size = MAX_PDF_SIZE_BYTES + 1;
    expect(() => createProjectFile(session, { size: MAX_PDF_SIZE_BYTES + 1 } as Blob)).toThrow(
      "does not match",
    );
  });
});
