import { describe, expect, it } from "vitest";
import { createEmptySession } from "../app/sessionState";
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
