/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseSelectOption, selectOptionLabels } from "../../components/ui/selectTestUtils";
import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationAssignment } from "./ClassificationAssignment";

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: true,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "plumbing", name: "Plumbing", archived: false },
        { id: "legacy", name: "Legacy", archived: true },
      ],
    },
  ],
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ClassificationAssignment select", () => {
  it("limits an archived dimension to Unclassified and its current value, and assigns by id", () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onAssign = vi.fn();
    act(() =>
      root.render(
        <ClassificationAssignment
          measurementId="line-1"
          appliedValueIds={["electrical"]}
          catalog={catalog}
          onAssign={onAssign}
        />,
      ),
    );
    const trigger = container.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']")!;
    expect(trigger.dataset.viewerShortcuts).toBe("enabled");
    expect(selectOptionLabels(trigger)).toEqual(["Unclassified", "Electrical"]);
    chooseSelectOption(trigger, "Unclassified");
    expect(onAssign).toHaveBeenCalledWith("line-1", "trade", null);
    act(() => root.unmount());
  });
});
