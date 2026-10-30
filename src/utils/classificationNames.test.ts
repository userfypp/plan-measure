import { describe, expect, it } from "vitest";
import { createEmptySession, sessionReducer } from "../app/sessionState";
import { classificationNameKey } from "./classificationNames";

const COMPOSED = "Électricité"; // "Électricité" with precomposed letters
const DECOMPOSED = "Électricité"; // the same text with combining accents

describe("classificationNameKey", () => {
  it("gives names that differ only in case the same key", () => {
    expect(classificationNameKey("ELECTRICAL")).toBe("electrical");
    expect(classificationNameKey("Electrical")).toBe(classificationNameKey("eLeCtRiCaL"));
  });

  it("gives composed and decomposed Unicode forms the same key", () => {
    expect(COMPOSED).not.toBe(DECOMPOSED);
    expect(classificationNameKey(DECOMPOSED)).toBe(classificationNameKey(COMPOSED));
    expect(classificationNameKey(DECOMPOSED)).toBe("électricité");
  });

  it("keeps different names apart, whitespace included, and leaves the input as typed", () => {
    const name = " Électricité ";
    expect(classificationNameKey(name)).toBe(" électricité ");
    expect(name).toBe(" Électricité ");
    expect(classificationNameKey("Electricite")).not.toBe(classificationNameKey(COMPOSED));
  });

  it("rejects a new dimension whose name matches an existing one this way, and stores names as typed", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
    let state = sessionReducer(
      { session, error: null },
      { type: "ADD_CLASSIFICATION_DIMENSION", id: "trade", name: ` ${DECOMPOSED} ` },
    );
    expect(state.error).toBeNull();
    expect(state.session?.classificationCatalog.dimensions.map((item) => item.name)).toEqual([
      DECOMPOSED,
    ]);

    state = sessionReducer(state, {
      type: "ADD_CLASSIFICATION_DIMENSION",
      id: "trade-2",
      name: COMPOSED.toUpperCase(),
    });
    expect(state.error).toBe("Classification dimensions need unique IDs and names.");
    expect(state.session?.classificationCatalog.dimensions).toHaveLength(1);
  });
});
