import { describe, expect, it } from "vitest";
import type { CountMeasurement } from "../types/domain";
import {
  alignedCountItemNames,
  canonicalCountItemNames,
  countItemLabel,
  countItemName,
  withCountItemNames,
} from "./countItems";

const count: CountMeasurement = {
  id: "count",
  name: "Doors",
  type: "count",
  calibrationId: null,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ],
  classificationValueIds: [],
  visible: true,
  itemNames: ["Main entrance"],
};

describe("count item names", () => {
  it("reads the name by position and falls back to the position", () => {
    expect(countItemName(count, 0)).toBe("Main entrance");
    expect(countItemName(count, 2)).toBe("");
    expect(countItemLabel(count, 0)).toBe("Main entrance");
    expect(countItemLabel(count, 1)).toBe("Item 2");
    expect(countItemLabel({}, 0)).toBe("Item 1");
  });

  it("pads the names to one per item", () => {
    expect(alignedCountItemNames(count)).toEqual(["Main entrance", "", ""]);
  });

  it("drops trailing blanks and the field once no item is named", () => {
    expect(canonicalCountItemNames(["A", "", "B", "", ""])).toEqual(["A", "", "B"]);
    expect(canonicalCountItemNames(["", ""])).toBeUndefined();
    expect(withCountItemNames(count, ["", "", ""])).not.toHaveProperty("itemNames");
    expect(withCountItemNames(count, ["", "Side", ""]).itemNames).toEqual(["", "Side"]);
  });
});
