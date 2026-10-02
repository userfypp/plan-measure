/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ClassificationTemplateLibrary } from "./ClassificationTemplateLibrary";
import {
  CLASSIFICATION_TEMPLATES_STORAGE_KEY,
  readClassificationTemplates,
  writeClassificationTemplates,
} from "./classificationTemplates";
import type { ClassificationCatalog } from "../../types/domain";

let root: Root;
let container: HTMLDivElement;
const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [{ id: "electrical", name: "Electrical", archived: false }],
    },
  ],
};
const apply = vi.fn(() => true);
function render(source = catalog, disabled = false) {
  act(() =>
    root.render(
      <ClassificationTemplateLibrary catalog={source} disabled={disabled} onApply={apply} />,
    ),
  );
}
function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Missing button ${label}`);
  act(() => {
    const disclosure = button.closest("details");
    if (disclosure && !disclosure.open) disclosure.querySelector("summary")!.click();
    button.click();
  });
}
function name(value: string) {
  const input = container.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function save(value = "Residential") {
  const disclosure = container.querySelector("form")!.closest("details")!;
  if (!disclosure.open) act(() => disclosure.querySelector("summary")!.click());
  name(value);
  click("Save template");
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  apply.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("template library interactions", () => {
  it("keeps saving and template details collapsed until requested", () => {
    writeClassificationTemplates([
      { id: "a", name: "Residential", dimensions: [{ name: "Trade", values: ["Electrical"] }] },
    ]);
    render();
    const template = container.querySelector("ul details") as HTMLDetailsElement;
    const saving = container.querySelector("form")!.closest("details")!;
    expect(template.open).toBe(false);
    expect(saving.open).toBe(false);
    expect(template.querySelector("summary svg")?.getAttribute("aria-hidden")).toBe("true");
    act(() => template.querySelector("summary")!.click());
    expect(template.open).toBe(true);
    act(() => template.querySelector("summary")!.click());
    expect(template.open).toBe(false);
    act(() => saving.querySelector("summary")!.click());
    expect(saving.open).toBe(true);
  });
  it("refreshes a stale library before saving so another window's templates are preserved", () => {
    render();
    const other = {
      id: "other",
      name: "Other window",
      dimensions: [{ name: "Floor", values: [] }],
    };
    writeClassificationTemplates([other]);
    save();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(
      "changed in another window",
    );
    expect(readClassificationTemplates().templates).toEqual([other]);
    click("Save template");
    expect(readClassificationTemplates().templates.map((template) => template.name)).toEqual([
      "Other window",
      "Residential",
    ]);
  });

  it("does not erase newly saved templates when deleting from a stale window", () => {
    render();
    save();
    click("Delete template Residential");
    const other = {
      id: "other",
      name: "Other window",
      dimensions: [{ name: "Floor", values: [] }],
    };
    writeClassificationTemplates([...readClassificationTemplates().templates, other]);
    click("Delete template");
    expect(readClassificationTemplates().templates).toHaveLength(2);
    click("Delete template Residential");
    click("Delete template");
    expect(readClassificationTemplates().templates).toEqual([other]);
  });

  it("saves, previews, reloads on another project, applies and deletes with confirmation", () => {
    render();
    expect(container.textContent).toContain("No templates yet");
    save();
    expect(container.querySelector("summary")!.textContent).toContain("Residential");
    expect(container.querySelector("dl")!.textContent).toContain("TradeElectrical");
    act(() => root.unmount());
    root = createRoot(container);
    render({ dimensions: [] });
    click("Apply template Residential");
    expect(apply).toHaveBeenCalledWith([{ name: "Trade", values: ["Electrical"] }]);
    expect(container.querySelector('[role="status"]')!.textContent).toContain("applied");
    click("Delete template Residential");
    expect(readClassificationTemplates().templates).toHaveLength(1);
    click("Cancel");
    expect(container.querySelector("summary")).not.toBeNull();
    click("Delete template Residential");
    click("Delete template");
    expect(readClassificationTemplates().templates).toEqual([]);
  });

  it("rejects duplicate names without replacing the saved template", () => {
    render();
    save();
    save("RESIDENTIAL");
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("unique");
    expect(readClassificationTemplates().templates).toHaveLength(1);
  });

  it("keeps the library usable after failed writes and does not show a successful save", () => {
    render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota");
    });
    save();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("could not be saved");
    expect(container.querySelector("ul summary")).toBeNull();
    expect(container.querySelector("input")!.value).toBe("Residential");
    vi.restoreAllMocks();
    click("Save template");
    expect(readClassificationTemplates().templates).toHaveLength(1);
  });

  it("preserves corrupt storage and disables saving", () => {
    localStorage.setItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY, "broken");
    render();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("could not be loaded");
    expect(container.querySelector("input")!.disabled).toBe(true);
    expect(localStorage.getItem(CLASSIFICATION_TEMPLATES_STORAGE_KEY)).toBe("broken");
  });

  it("disables save on empty projects and disables all changes during a blocked workflow", () => {
    render();
    save();
    render({ dimensions: [] });
    expect(container.querySelector("input")!.disabled).toBe(true);
    render(catalog, true);
    expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
    click("Apply template Residential");
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not announce a failed application as successful", () => {
    render();
    save();
    apply.mockReturnValueOnce(false);
    click("Apply template Residential");
    expect(container.querySelector('[role="status"]')!.textContent).not.toContain("applied");
  });
});
