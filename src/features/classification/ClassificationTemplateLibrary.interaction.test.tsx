/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ClassificationTemplateLibrary } from "./ClassificationTemplateLibrary";
import {
  CLASSIFICATION_TEMPLATES_STORAGE_KEY,
  type ClassificationTemplate,
  type TemplateConflictPolicy,
  readClassificationTemplates,
  writeClassificationTemplates,
} from "./classificationTemplates";
import type { ClassificationCatalog, ClassificationValueRates } from "../../types/domain";
import { stubDialogMethods } from "../../test/domTestUtils";

let root: Root;
let container: HTMLDivElement;
let restoreDialogMethods = () => {};
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
const apply = vi.fn<(template: ClassificationTemplate, policy: TemplateConflictPolicy) => boolean>(
  () => true,
);
function render(
  source = catalog,
  disabled = false,
  rates: ClassificationValueRates[] = [],
  currency: string | null = null,
  search = "",
) {
  act(() =>
    root.render(
      <ClassificationTemplateLibrary
        catalog={source}
        rates={rates}
        currency={currency}
        disabled={disabled}
        search={search}
        onApply={apply}
      />,
    ),
  );
}
function findButton(label: string) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label,
  );
}
function click(label: string) {
  let button = findButton(label);
  if (!button) {
    act(() =>
      container
        .querySelectorAll<HTMLButtonElement>("button[aria-expanded='false']")
        .forEach((toggle) => toggle.click()),
    );
    button = findButton(label);
  }
  if (!button) throw new Error(`Missing button ${label}`);
  act(() => button.click());
}
function toggles() {
  return [...container.querySelectorAll<HTMLButtonElement>("ul button[aria-expanded]")];
}
function name(value: string) {
  const input = container.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function save(value = "Residential") {
  name(value);
  click("Save template");
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  restoreDialogMethods = stubDialogMethods();
  apply.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  restoreDialogMethods();
  vi.restoreAllMocks();
});

describe("template library interactions", () => {
  describe("search", () => {
    const templateNames = () =>
      toggles().map((toggle) => toggle.querySelector("span[title]")?.getAttribute("title"));
    function saveTemplates() {
      writeClassificationTemplates([
        {
          id: "res",
          name: "Residencial",
          currency: null,
          dimensions: [{ name: "Estructura", values: ["Cimentación", "Losa"], rates: [] }],
        },
        {
          id: "off",
          name: "Office",
          currency: null,
          dimensions: [{ name: "Finish", values: ["Paint"], rates: [] }],
        },
      ]);
    }

    it("filters by template, dimension or value name ignoring case and accents", () => {
      saveTemplates();
      render(catalog, false, [], null, "RESIDENCIAL");
      expect(templateNames()).toEqual(["Residencial"]);
      render(catalog, false, [], null, "finish");
      expect(templateNames()).toEqual(["Office"]);
      render(catalog, false, [], null, "cimentacion");
      expect(templateNames()).toEqual(["Residencial"]);
      render(catalog, false, [], null, "");
      expect(templateNames()).toEqual(["Residencial", "Office"]);
    });

    it("says when no template matches", () => {
      saveTemplates();
      render(catalog, false, [], null, "zzz");
      const status = [...container.querySelectorAll('[role="status"]')].find(
        (node) => node.textContent === "No template matches",
      );
      expect(status).toBeDefined();
      expect(toggles()).toHaveLength(0);
      expect(container.querySelector("input")).not.toBeNull();
    });

    it("does not say so when no template is saved", () => {
      render(catalog, false, [], null, "zzz");
      expect(container.textContent).not.toContain("No template matches");
      expect(container.textContent).toContain("No templates yet");
    });
  });

  it("keeps template details collapsed until requested and the save form always visible", () => {
    writeClassificationTemplates([
      {
        id: "a",
        name: "Residential",
        currency: null,
        dimensions: [{ name: "Trade", values: ["Electrical"], rates: [] }],
      },
    ]);
    render();
    const [toggle] = toggles();
    expect(toggle!.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("dl")).toBeNull();
    expect(container.querySelector("form")!.closest("ul")).toBeNull();
    expect(container.querySelector("form input")!.hasAttribute("disabled")).toBe(false);
    expect(toggle!.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    act(() => toggle!.click());
    expect(toggle!.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("dl")).not.toBeNull();
    act(() => toggle!.click());
    expect(toggle!.getAttribute("aria-expanded")).toBe("false");
  });

  it("applies from the closed row without opening it and clears the result on the next change", () => {
    writeClassificationTemplates([
      {
        id: "a",
        name: "Residential",
        currency: null,
        dimensions: [{ name: "Trade", values: ["Electrical"], rates: [] }],
      },
    ]);
    render();
    const apply = findButton("Apply template Residential")!;
    expect(toggles()[0]!.contains(apply)).toBe(false);
    expect(container.querySelector('[role="status"]')!.textContent).toBe("");
    click("Apply template Residential");
    expect(toggles()[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="status"]')!.textContent).toContain("applied");
    save("Commercial");
    expect(container.querySelector('[role="status"]')!.textContent).not.toContain("applied");
  });

  it("reports a duplicate name under the save field", () => {
    render();
    save();
    save("residential");
    const alert = container.querySelector("form [role='alert']");
    expect(alert!.textContent).toContain("unique");
  });

  it("refreshes a stale library before saving so another window's templates are preserved", () => {
    render();
    const other = {
      id: "other",
      name: "Other window",
      currency: null,
      dimensions: [{ name: "Floor", values: [], rates: [] }],
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
      currency: null,
      dimensions: [{ name: "Floor", values: [], rates: [] }],
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
    expect(toggles()[0]!.textContent).toContain("Residential");
    expect(container.querySelector("dl")).toBeNull();
    act(() => toggles()[0]!.click());
    expect(container.querySelector("dl")!.textContent).toContain("TradeElectrical");
    act(() => root.unmount());
    root = createRoot(container);
    render({ dimensions: [] });
    click("Apply template Residential");
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: null,
        dimensions: [{ name: "Trade", values: ["Electrical"], rates: [] }],
      }),
      "keep",
    );
    expect(container.querySelector('[role="status"]')!.textContent).toContain("applied");
    click("Delete template Residential");
    expect(readClassificationTemplates().templates).toHaveLength(1);
    click("Cancel");
    expect(toggles()).toHaveLength(1);
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
    expect(toggles()).toHaveLength(0);
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
    expect(
      [...container.querySelectorAll("button:not([aria-expanded])")].every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);
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

  describe("rates", () => {
    const wallCatalog: ClassificationCatalog = {
      dimensions: [
        {
          id: "trade",
          name: "Trade",
          archived: false,
          values: [{ id: "wall", name: "Wall", archived: false }],
        },
      ],
    };
    const wallRates = {
      value: "Wall",
      derivation: { source: "length", factorMm: 2700 },
      price: { amount: 25, basis: "derived", unit: "m²" },
    } as const;
    const wallTemplate: ClassificationTemplate = {
      id: "walls",
      name: "Walls",
      currency: "EUR",
      dimensions: [{ name: "Trade", values: ["Wall"], rates: [wallRates] }],
    };
    const differing: ClassificationValueRates[] = [
      { valueId: "wall", derivation: { source: "length", factorMm: 2400 }, price: null },
    ];
    const dialog = () => document.querySelector("dialog[open]");
    const dialogButtons = () =>
      [...dialog()!.querySelectorAll("button")].map((button) => button.textContent);
    function dialogButton(label: string) {
      const found = [...dialog()!.querySelectorAll("button")].find(
        (button) => button.textContent === label,
      );
      if (!found) throw new Error(`Missing ${label}`);
      return found;
    }
    function applyWalls() {
      writeClassificationTemplates([wallTemplate]);
      render(wallCatalog, false, differing, "EUR");
      click("Apply template Walls");
    }

    it("saves the rates of active values and the project currency with the template", () => {
      render(wallCatalog, false, [{ valueId: "wall", ...wallRates }], "EUR");
      save("Walls");
      expect(readClassificationTemplates().templates).toEqual([
        expect.objectContaining({
          name: "Walls",
          currency: "EUR",
          dimensions: [{ name: "Trade", values: ["Wall"], rates: [wallRates] }],
        }),
      ]);
    });

    it("applies at once, without asking, when nothing in the project differs", () => {
      writeClassificationTemplates([wallTemplate]);
      render(wallCatalog, false, [], "EUR");
      click("Apply template Walls");
      expect(dialog()).toBeNull();
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith(wallTemplate, "keep");
    });

    it("asks before applying over different rates, with Cancel, Keep existing and Replace", () => {
      applyWalls();
      expect(apply).not.toHaveBeenCalled();
      expect(dialogButtons()).toEqual(["Cancel", "Keep existing", "Replace"]);
      expect(dialogButton("Cancel").className).toMatch(/ghost/);
      expect(dialogButton("Keep existing").className).toMatch(/secondary/);
      expect(dialogButton("Replace").className).toMatch(/primary/);
      expect(dialog()!.textContent).toContain("Trade: Wall");
      expect(dialog()!.getAttribute("aria-describedby")).toBeTruthy();
    });

    it("applies nothing when the question is cancelled with the button or Escape", () => {
      applyWalls();
      act(() => dialogButton("Cancel").click());
      expect(dialog()).toBeNull();
      expect(apply).not.toHaveBeenCalled();
      click("Apply template Walls");
      act(() =>
        dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
      expect(dialog()).toBeNull();
      expect(apply).not.toHaveBeenCalled();
      expect(container.querySelector('[role="status"]')!.textContent).toBe("");
    });

    it("keeps the existing rates when asked to", () => {
      applyWalls();
      act(() => dialogButton("Keep existing").click());
      expect(dialog()).toBeNull();
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith(wallTemplate, "keep");
      expect(container.querySelector('[role="status"]')!.textContent).toContain("applied");
    });

    it("replaces the existing rates when asked to", () => {
      applyWalls();
      act(() => dialogButton("Replace").click());
      expect(dialog()).toBeNull();
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith(wallTemplate, "replace");
    });

    it("lists at most five conflicts and counts the rest", () => {
      const names = ["A", "B", "C", "D", "E", "F", "G"];
      const manyCatalog: ClassificationCatalog = {
        dimensions: [
          {
            id: "trade",
            name: "Trade",
            archived: false,
            values: names.map((name) => ({ id: name, name, archived: false })),
          },
        ],
      };
      writeClassificationTemplates([
        {
          id: "many",
          name: "Many",
          currency: null,
          dimensions: [
            {
              name: "Trade",
              values: names,
              rates: names.map((name) => ({
                value: name,
                derivation: { source: "length", factorMm: 2700 },
                price: null,
              })),
            },
          ],
        },
      ]);
      render(
        manyCatalog,
        false,
        names.map((name) => ({
          valueId: name,
          derivation: { source: "length", factorMm: 2400 },
          price: null,
        })),
      );
      click("Apply template Many");
      const text = dialog()!.querySelector("p")!.textContent!;
      expect(text).toContain("Trade: A; Trade: B; Trade: C; Trade: D; Trade: E and 2 more");
      expect(text).not.toContain("Trade: F");
    });

    it("says that prices were not applied when the currencies differ", () => {
      writeClassificationTemplates([wallTemplate]);
      render(wallCatalog, false, [], "USD");
      click("Apply template Walls");
      expect(container.querySelector('[role="status"]')!.textContent).toContain(
        "Prices were not applied",
      );
      act(() => root.unmount());
      root = createRoot(container);
      render(wallCatalog, false, differing, "USD");
      click("Apply template Walls");
      expect(dialog()!.textContent).toContain("Prices were not applied");
    });

    it("does not mention prices when the currencies match", () => {
      writeClassificationTemplates([wallTemplate]);
      render(wallCatalog, false, [], "EUR");
      click("Apply template Walls");
      expect(container.querySelector('[role="status"]')!.textContent).not.toContain("Prices");
    });
  });
});
