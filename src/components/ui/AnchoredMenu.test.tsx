/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnchoredMenu, type AnchoredMenuItem } from "./AnchoredMenu";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const selections = [vi.fn(), vi.fn(), vi.fn()];
let scrollIntoView: ReturnType<typeof vi.fn>;

function menuItems(): AnchoredMenuItem[] {
  return [
    {
      id: "measurements",
      label: "Measurements",
      role: "menuitemradio",
      checked: true,
      current: true,
      onSelect: selections[0]!,
    },
    {
      id: "classifications",
      label: "Classifications",
      role: "menuitemradio",
      checked: false,
      onSelect: selections[1]!,
    },
    {
      id: "scales",
      label: "Scales",
      role: "menuitemradio",
      checked: false,
      onSelect: selections[2]!,
    },
  ];
}

function menuItemsWithDisabledMiddle(): AnchoredMenuItem[] {
  const items = menuItems();
  return items.map((item, index) => (index === 1 ? { ...item, disabled: true } : item));
}

function longMenuItems(): AnchoredMenuItem[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `item-${index}`,
    label: `Item ${index + 1}`,
    role: "menuitemradio" as const,
    checked: index === 7,
    current: index === 7,
    onSelect: vi.fn(),
  }));
}

function renderMenu() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AnchoredMenu
        trigger="Workspace"
        label="Workspace module"
        items={menuItems()}
      />,
    );
  });
}

function trigger(): HTMLButtonElement {
  const button = container?.querySelector("button");
  if (!button) throw new Error("Menu trigger was not rendered.");
  return button;
}

function openMenu() {
  act(() => trigger().click());
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'));
}

function press(key: string) {
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  selections.forEach((selection) => selection.mockReset());
  renderMenu();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="menu"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("AnchoredMenu", () => {
  it("exposes menu and checked/current radio semantics", () => {
    openMenu();

    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(document.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe(
      "Workspace module",
    );
    expect(buttons()[0]?.getAttribute("aria-checked")).toBe("true");
    expect(buttons()[0]?.getAttribute("aria-current")).toBe("true");
    expect(buttons()[1]?.getAttribute("aria-checked")).toBe("false");
  });

  it("uses a single SVG check for the selected item without adding glyph text", () => {
    openMenu();
    const menuButtons = buttons();

    expect(menuButtons.map((button) => button.textContent?.trim())).toEqual([
      "Measurements",
      "Classifications",
      "Scales",
    ]);
    expect(menuButtons[0]?.querySelector("svg")).not.toBeNull();
    expect(menuButtons[1]?.querySelector("svg")).toBeNull();
    expect(menuButtons[2]?.querySelector("svg")).toBeNull();
  });

  it("moves focus with ArrowDown and ArrowUp", () => {
    openMenu();
    expect(document.activeElement).toBe(buttons()[0]);

    press("ArrowDown");
    expect(document.activeElement).toBe(buttons()[1]);
    expect(buttons().map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
    press("ArrowUp");
    expect(document.activeElement).toBe(buttons()[0]);
    expect(buttons().map((button) => button.tabIndex)).toEqual([0, -1, -1]);
  });

  it("keeps disabled menu items focusable by composite navigation but non-activatable", () => {
    act(() => {
      root!.render(
        <AnchoredMenu
          trigger="Workspace"
          label="Workspace module"
          items={menuItemsWithDisabledMiddle()}
        />,
      );
    });
    openMenu();

    press("ArrowDown");
    expect(document.activeElement).toBe(buttons()[1]);
    expect(buttons()[1]?.getAttribute("aria-disabled")).toBe("true");
    press("Enter");

    expect(selections[1]).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });

  it("moves focus to the first and last item with Home and End", () => {
    openMenu();
    press("End");
    expect(document.activeElement).toBe(buttons()[2]);
    press("Home");
    expect(document.activeElement).toBe(buttons()[0]);
  });

  it("selects the focused item with Enter and restores focus", () => {
    openMenu();
    press("ArrowDown");
    press("Enter");

    expect(selections[1]).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("selects the focused item with Space", () => {
    openMenu();
    press("End");
    press(" ");

    expect(selections[2]).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("dismisses with Escape and restores focus", () => {
    openMenu();
    press("Escape");

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("keeps a single menu item in the page tab sequence and closes on Tab", () => {
    openMenu();
    const menuButtons = buttons();

    expect(menuButtons.map((button) => button.tabIndex)).toEqual([0, -1, -1]);
    press("Tab");

    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("keeps autofocus and keyboard-focused items visible in a scrollable long menu", () => {
    act(() => {
      root!.render(
        <AnchoredMenu trigger="Long menu" label="Long menu" items={longMenuItems()} />,
      );
    });
    act(() => trigger().click());
    const menuButtons = buttons();

    expect(document.activeElement).toBe(menuButtons[7]);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

    scrollIntoView.mockClear();
    press("End");
    expect(document.activeElement).toBe(menuButtons[11]);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

    scrollIntoView.mockClear();
    press("ArrowDown");
    press("ArrowDown");
    expect(document.activeElement).toBe(menuButtons[1]);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
  });
});
