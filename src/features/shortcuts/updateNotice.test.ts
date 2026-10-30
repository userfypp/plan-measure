import { describe, expect, it } from "vitest";
import { presetBindings } from "./presets";
import { shortcutsUpdatedMessage } from "./updateNotice";

describe("shortcutsUpdatedMessage", () => {
  it("counts the keys Default adds to Legacy", () => {
    const legacy = presetBindings("legacy");
    const added = Object.entries(presetBindings("default")).flatMap(([id, combos]) =>
      combos.filter((combo) => !legacy[id as keyof typeof legacy].includes(combo)),
    );
    expect(added.length).toBeGreaterThan(0);
    expect(shortcutsUpdatedMessage()).toBe(
      `Shortcuts updated. ${added.length} shortcuts were added; your current keys still work.`,
    );
  });
});
