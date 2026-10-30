import { describe, expect, it } from "vitest";
import { createEmptySession, sessionReducer } from "../app/sessionState";
import { MEASUREMENT_NAME_EMPTY_ERROR, normalizeMeasurementName } from "./measurementName";

describe("normalizeMeasurementName", () => {
  it("trims surrounding whitespace and keeps inner spacing", () => {
    expect(normalizeMeasurementName("  Wall  A \t")).toBe("Wall  A");
    expect(normalizeMeasurementName("Line 1")).toBe("Line 1");
  });

  it.each(["", " ", "\t\n", "  "])("rejects the blank name %j", (name) => {
    expect(normalizeMeasurementName(name)).toBeNull();
  });

  it("keeps the empty-name error message", () => {
    expect(MEASUREMENT_NAME_EMPTY_ERROR).toBe("Measurement name cannot be empty.");
  });

  it("stores the trimmed name on rename and rejects a blank one without changing the name", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
    session.pages[1]!.measurements = [
      {
        id: "count-1",
        name: "Count 1",
        type: "count",
        points: [{ x: 1, y: 1 }],
        calibrationId: null,
        classificationValueIds: [],
        visible: true,
      },
    ];
    const renamed = sessionReducer(
      { session, error: null },
      { type: "RENAME_MEASUREMENT", pageNumber: 1, id: "count-1", name: "  Outlets  " },
    );
    expect(renamed.error).toBeNull();
    expect(renamed.session?.pages[1]?.measurements[0]?.name).toBe("Outlets");

    const blank = sessionReducer(renamed, {
      type: "RENAME_MEASUREMENT",
      pageNumber: 1,
      id: "count-1",
      name: " \t ",
    });
    expect(blank.error).toBe(MEASUREMENT_NAME_EMPTY_ERROR);
    expect(blank.session).toBe(renamed.session);
  });
});
