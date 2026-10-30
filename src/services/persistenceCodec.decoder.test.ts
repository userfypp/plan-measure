import { describe, expect, it } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession } from "../types/domain";
import { deserializeSession, serializeSession } from "./persistenceCodec";

// These tests edit the saved JSON directly, so the decoder sees data that `serializeSession` would
// refuse to write: corrupt files come from disk, old builds or hand edits, not from this encoder.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function session(): CurrentSession {
  const created = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  created.classificationCatalog = {
    dimensions: [
      {
        id: "trade",
        name: "Trade",
        archived: false,
        values: [{ id: "electrical", name: "Electrical", archived: false }],
      },
    ],
  };
  created.pages[1]!.calibrations = [
    {
      id: "scale",
      name: "Scale",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
  ];
  created.pages[1]!.activeCalibrationId = "scale";
  created.pages[1]!.measurements = [
    {
      id: "line-1",
      name: "Line 1",
      type: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      calibrationId: "scale",
      classificationValueIds: ["electrical"],
      visible: true,
    },
  ];
  return created;
}

function corrupted(edit: (raw: Json) => void): string {
  const raw = JSON.parse(serializeSession(session())) as Json;
  edit(raw);
  return JSON.stringify(raw);
}

describe("deserializeSession with raw saved JSON", () => {
  it("restores the untouched JSON exactly", () => {
    expect(deserializeSession(corrupted(() => {}))).toEqual(session());
  });

  it.each<[string, (raw: Json) => void, string]>([
    [
      "a measurement ID repeated on another page",
      (raw) => {
        raw.pages["2"].calibrations = raw.pages["1"].calibrations;
        raw.pages["2"].activeCalibrationId = "scale";
        raw.pages["2"].measurements = raw.pages["1"].measurements;
      },
      "The saved session has duplicate measurement IDs.",
    ],
    [
      "a calibration ID repeated on one page",
      (raw) => raw.pages["1"].calibrations.push({ ...raw.pages["1"].calibrations[0] }),
      "Page 1 has duplicate calibration IDs.",
    ],
    [
      "an active calibration that does not exist",
      (raw) => (raw.pages["1"].activeCalibrationId = "gone"),
      "Page 1 has an active calibration that does not exist.",
    ],
    [
      "a measurement whose calibration does not exist",
      (raw) => (raw.pages["1"].measurements[0].calibrationId = "gone"),
      "Page 1 has a measurement with a missing calibration.",
    ],
    [
      "a page beyond the page count",
      (raw) => (raw.pages["3"] = { ...raw.pages["2"], pageNumber: 3 }),
      "The saved session contains a page outside the declared page count.",
    ],
    [
      "a page key that is not a canonical number",
      (raw) => {
        raw.pages["02"] = raw.pages["2"];
        delete raw.pages["2"];
      },
      "The saved session contains an invalid page key.",
    ],
    [
      "a classification value that is not in the catalog",
      (raw) => (raw.pages["1"].measurements[0].classificationValueIds = ["plumbing"]),
      "The saved session has a measurement with a missing classification value.",
    ],
    [
      "an unknown display unit",
      (raw) => (raw.settings.displayUnit = "furlong"),
      "The saved display unit setting is invalid.",
    ],
    [
      "a schema version from the future",
      (raw) => (raw.schemaVersion = 99),
      "The saved session uses an unsupported schema.",
    ],
  ])("rejects %s", (_name, edit, message) => {
    expect(() => deserializeSession(corrupted(edit))).toThrow(message);
  });

  it.each(["[]", "null", '"session"', "42"])("rejects the non-object JSON %s", (json) => {
    expect(() => deserializeSession(json)).toThrow("The saved session uses an unsupported schema.");
  });

  it("rejects text that is not JSON", () => {
    expect(() => deserializeSession("{ not json")).toThrow(SyntaxError);
  });
});
