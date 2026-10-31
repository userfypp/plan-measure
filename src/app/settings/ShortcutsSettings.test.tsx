/* @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseSelectOption, selectOptionLabels } from "../../components/ui/selectTestUtils";
import { CATALOG, FIXED_KEYS } from "../../features/shortcuts/catalog";
import { diffFromDefault, presetBindings } from "../../features/shortcuts/presets";
import {
  getAppPreferences,
  reloadAppPreferencesFromStorage,
  setAppPreference,
} from "../../utils/appPreferences";
import { useShortcutLabel } from "../../utils/shortcuts/store";
import { ShortcutsSettings } from "./ShortcutsSettings";

let root: Root | null = null;
let host: HTMLDialogElement | null = null;

/** Shows the label other surfaces (tooltips, menus) read for the Line tool. */
function LineLabelProbe() {
  return <output data-testid="line-label">{useShortcutLabel("tool.line")}</output>;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  reloadAppPreferencesFromStorage();
  // The panel lives in the Settings dialog: the capture popover portals into the nearest dialog.
  host = document.createElement("dialog");
  host.setAttribute("open", "");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <LineLabelProbe />
        <ShortcutsSettings />
      </>,
    ),
  );
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function slot(label: string): HTMLButtonElement {
  const element = host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!element) throw new Error(`Button ${label} was not rendered.`);
  return element;
}

function hasSlot(label: string): boolean {
  return host!.querySelector(`button[aria-label="${label}"]`) !== null;
}

function presetTrigger(): HTMLButtonElement {
  return host!.querySelector<HTMLButtonElement>("button[data-select-trigger]")!;
}

function capturePopover(): HTMLElement | null {
  return host!.querySelector<HTMLElement>('[role="dialog"][aria-label^="Set shortcut for"]');
}

function textButton(label: string, scope: ParentNode = host!): HTMLButtonElement {
  const element = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label,
  );
  if (!element) throw new Error(`Button ${label} was not rendered.`);
  return element;
}

function click(element: HTMLElement) {
  act(() => element.click());
}

function openCapture(label: string): HTMLElement {
  click(slot(label));
  const popover = capturePopover();
  if (!popover) throw new Error(`The capture for ${label} did not open.`);
  return popover;
}

/** Presses a key where the focus is, as the user would, and returns the event. */
function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    document.activeElement?.dispatchEvent(event);
  });
  return event;
}

function liveText(): string {
  return host!.querySelector('p[aria-live="polite"]')?.textContent ?? "";
}

/** What the preset picker is described by: only assistive technology reads it. */
function presetDescription(): string {
  const id = presetTrigger().getAttribute("aria-describedby");
  return (id && document.getElementById(id)?.textContent) || "";
}

/** The question shown under the header while a reset or a preset switch waits for a decision. */
function confirmQuestion(): string {
  return host!.querySelector<HTMLElement>("[id$='-question']")?.textContent ?? "";
}

function header(): HTMLElement {
  return presetTrigger().closest<HTMLElement>("[class*='header']")!;
}

function resetAllButton(): HTMLButtonElement {
  return slot("Reset all shortcuts");
}

function setSearch(value: string) {
  const input = host!.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function rowLabels(): string[] {
  return Array.from(
    host!.querySelectorAll("[class*='row'] > [class*='label']"),
    (label) => label.textContent ?? "",
  );
}

function rowResetButton(action: string): HTMLButtonElement {
  return slot(`Reset ${action} shortcut`);
}

/** The reset button is always there; it is only enabled while the row differs from the preset. */
function isRowResetEnabled(action: string): boolean {
  return !rowResetButton(action).disabled;
}

describe("ShortcutsSettings layout", () => {
  it("lists every action, then the read-only Fixed keys, with no group headings", () => {
    expect(host!.querySelectorAll("h3")).toHaveLength(0);
    expect(rowLabels()).toHaveLength(CATALOG.length + FIXED_KEYS.length);
    expect(slot("Line shortcut 1: L").textContent).toBe("L");
    expect(slot("Add shortcut for Calibrate").textContent).toBe("Add");
    expect(slot("Zoom in shortcut 1: +")).toBeTruthy();
    expect(slot("Zoom in shortcut 2: =")).toBeTruthy();
  });

  it("offers a second key as an icon-only plus, and only once the first one is set", () => {
    const plus = slot("Add second shortcut for Line");
    expect(plus.textContent).toBe("");
    expect(plus.querySelector("svg")).not.toBeNull();
    // Nothing to add to: no first key yet, or both keys already set.
    expect(hasSlot("Add second shortcut for Calibrate")).toBe(false);
    expect(hasSlot("Add second shortcut for Zoom in")).toBe(false);
  });

  it("puts the preset, the search and the reset in one toolbar with no text of their own", () => {
    const bar = header();
    expect(bar.querySelectorAll("button[data-select-trigger]")).toHaveLength(1);
    expect(bar.querySelectorAll('input[type="search"]')).toHaveLength(1);
    expect(resetAllButton().textContent).toBe("");
    expect(bar.contains(resetAllButton())).toBe(true);
    // No visible "Preset" label, description or "Customized from" line.
    expect(bar.querySelector("p, label, h3")).toBeNull();
    expect(host!.textContent).not.toContain("Customized from");
  });

  it("scrolls only the list: the header and the rows never share a parent", () => {
    const list = host!.querySelector<HTMLElement>("[class*='list']")!;
    expect(list.contains(header())).toBe(false);
    expect(list.children).toHaveLength(CATALOG.length + FIXED_KEYS.length);
    expect(list.contains(host!.querySelector('p[aria-live="polite"]'))).toBe(false);
  });

  it("describes the preset to assistive technology and disables Reset all while nothing is customized", () => {
    expect(presetTrigger().textContent).toBe("Default");
    expect(selectOptionLabels(presetTrigger())).toEqual([
      "Default",
      "Legacy",
      "Keyboard first",
      "Left hand",
      "Essentials",
      "Right hand",
    ]);
    expect(presetDescription()).toContain("Your current keys");
    expect(presetTrigger().getAttribute("aria-label")).toBe("Preset");
    expect(resetAllButton().disabled).toBe(true);
    expect(FIXED_KEYS.length).toBeGreaterThan(0);
  });

  it("keeps the Fixed keys read-only", () => {
    const list = host!.querySelector<HTMLElement>("[class*='list']")!;
    const rows = Array.from(list.children).slice(CATALOG.length);

    expect(rows).toHaveLength(FIXED_KEYS.length);
    for (const row of rows) {
      expect(row.querySelector("button, input, [tabindex]")).toBeNull();
      expect(row.querySelector("kbd")).not.toBeNull();
    }
    expect(rows[0]?.textContent).toContain("Pan");
    expect(rows[0]?.querySelector("kbd")?.textContent).toBe("Space");
  });

  it("styles the panel with tokens only, one scrolling list and content-sized keys", () => {
    const css = readFileSync(resolve(import.meta.dirname, "ShortcutsSettings.module.css"), "utf8");
    // Container queries cannot read tokens, so their breakpoint is the one literal allowed.
    expect(css.replace(/@container \([^)]*\)/g, "")).not.toMatch(/\d+px/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("slot-width");
    expect(css).not.toContain("sticky");
    expect(css).toMatch(/\.list\s*\{[^}]*composes:[^;]*overlayScroll[^;]*;[^}]*min-height:\s*0;/s);
    expect(css).toMatch(/\.list\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(
      /\.row \.slot\s*\{[^}]*min-width:\s*max\([^}]*--geometry-shortcut-key-min-width\)\);/s,
    );
    expect(css).not.toContain("resetHidden");
    expect(css).toMatch(/\.list\s*\{[^}]*grid-template-columns:[^;]*;/s);
    expect(css).toMatch(/\.editRow\s*\{[^}]*grid-template-columns:\s*subgrid;/s);
    // Fixed keys keep no gap for the reset column.
    expect(css).not.toMatch(/\.fixedKeys\s*\{[^}]*margin-right/s);
  });
});

describe("ShortcutsSettings presets", () => {
  it("rewrites the stored keys and the labels other surfaces read when a preset is chosen", () => {
    expect(host!.querySelector("output")?.textContent).toBe("L");

    chooseSelectOption(presetTrigger(), "Left hand");

    const preferences = getAppPreferences();
    expect(preferences.shortcutPreset).toBe("left-hand");
    expect(preferences.shortcutBindings).toEqual(diffFromDefault(presetBindings("left-hand")));
    expect(presetTrigger().textContent).toBe("Left hand");
    expect(host!.querySelector("output")?.textContent).toBe("S");
    expect(slot("Line shortcut 1: S")).toBeTruthy();
    expect(presetDescription()).toContain("left of the keyboard");
    expect(liveText()).toBe("Left hand preset applied.");
    expect(resetAllButton().disabled).toBe(true);
  });

  it("goes back to Default with an empty stored map", () => {
    chooseSelectOption(presetTrigger(), "Legacy");
    expect(getAppPreferences().shortcutPreset).toBe("legacy");

    chooseSelectOption(presetTrigger(), "Default");

    expect(getAppPreferences().shortcutPreset).toBe("default");
    expect(getAppPreferences().shortcutBindings).toEqual({});
  });

  it("calls the state Custom once a key differs from the preset, and back once it matches", () => {
    openCapture("Line shortcut 1: L");
    press("Q");

    expect(presetTrigger().textContent).toBe("Custom");
    expect(presetDescription()).toBe("Customized from Default.");
    expect(resetAllButton().disabled).toBe(false);
    expect(selectOptionLabels(presetTrigger())).toContain("Custom");

    openCapture("Line shortcut 1: Q");
    press("L");

    expect(presetTrigger().textContent).toBe("Default");
    expect(resetAllButton().disabled).toBe(true);
  });

  it("asks before another preset replaces custom keys, and keeps them on Cancel", () => {
    openCapture("Line shortcut 1: L");
    press("Q");
    const customized = getAppPreferences().shortcutBindings;

    chooseSelectOption(presetTrigger(), "Legacy");

    expect(confirmQuestion()).toBe("Discard your changes and switch to Legacy?");
    expect(getAppPreferences().shortcutBindings).toBe(customized);
    expect(getAppPreferences().shortcutPreset).toBe("default");
    expect(document.activeElement).toBe(textButton("Cancel"));

    click(textButton("Cancel"));
    expect(getAppPreferences().shortcutBindings).toBe(customized);
    expect(confirmQuestion()).toBe("");
    expect(document.activeElement).toBe(presetTrigger());

    chooseSelectOption(presetTrigger(), "Legacy");
    click(textButton("Switch"));

    expect(getAppPreferences().shortcutPreset).toBe("legacy");
    expect(getAppPreferences().shortcutBindings).toEqual(diffFromDefault(presetBindings("legacy")));
    expect(presetTrigger().textContent).toBe("Legacy");
    expect(document.activeElement).toBe(presetTrigger());
  });

  it("resets every key to the preset only after confirming", () => {
    chooseSelectOption(presetTrigger(), "Left hand");
    openCapture("Line shortcut 1: S");
    press("J");
    const customized = getAppPreferences().shortcutBindings;

    click(resetAllButton());
    expect(confirmQuestion()).toBe("Discard your changes and restore Left hand?");
    expect(document.activeElement).toBe(textButton("Cancel"));
    expect(getAppPreferences().shortcutBindings).toBe(customized);

    click(textButton("Cancel"));
    expect(getAppPreferences().shortcutBindings).toBe(customized);
    expect(confirmQuestion()).toBe("");
    expect(presetDescription()).toBe("Customized from Left hand.");

    click(resetAllButton());
    click(textButton("Reset"));

    expect(getAppPreferences().shortcutPreset).toBe("left-hand");
    expect(getAppPreferences().shortcutBindings).toEqual(
      diffFromDefault(presetBindings("left-hand")),
    );
    expect(presetTrigger().textContent).toBe("Left hand");
    expect(resetAllButton().disabled).toBe(true);
    expect(confirmQuestion()).toBe("");
  });
});

describe("ShortcutsSettings capture", () => {
  it("opens a labelled dialog that listens, with the focus on it", () => {
    const popover = openCapture("Line shortcut 1: L");

    expect(popover.getAttribute("aria-label")).toBe("Set shortcut for Line");
    expect(popover.textContent).toContain("Press the new shortcut");
    expect(popover.contains(document.activeElement)).toBe(true);
    expect(slot("Line shortcut 1: L").getAttribute("aria-expanded")).toBe("true");
  });

  it("applies a free key at once, closes and returns the focus to the slot", () => {
    openCapture("Line shortcut 1: L");

    const event = press("Q");

    expect(event.defaultPrevented).toBe(true);
    expect(getAppPreferences().shortcutBindings).toEqual({ "tool.line": ["Q"] });
    expect(capturePopover()).toBeNull();
    expect(document.activeElement).toBe(slot("Line shortcut 1: Q"));
    expect(liveText()).toBe("Line set to Q.");
    expect(host!.querySelector("output")?.textContent).toBe("Q");
  });

  it("fills an empty slot and offers a second one", () => {
    openCapture("Add shortcut for Calibrate");
    press("B");

    expect(getAppPreferences().shortcutBindings).toEqual({ "tool.calibrate": ["B"] });
    expect(slot("Calibrate shortcut 1: B")).toBeTruthy();
    expect(hasSlot("Add shortcut for Calibrate")).toBe(false);

    openCapture("Add second shortcut for Calibrate");
    press("U");
    expect(getAppPreferences().shortcutBindings).toEqual({ "tool.calibrate": ["B", "U"] });
    expect(slot("Calibrate shortcut 2: U")).toBeTruthy();
    expect(hasSlot("Add second shortcut for Calibrate")).toBe(false);
  });

  it("keeps listening and explains why when the key belongs to the viewer", () => {
    openCapture("Line shortcut 1: L");

    press("N");

    const popover = capturePopover()!;
    expect(popover.textContent).toContain("N cannot be used");
    expect(popover.textContent).toContain("Fixed key, used for next edit point");
    expect(getAppPreferences().shortcutBindings).toEqual({});

    press("Q");
    expect(capturePopover()).toBeNull();
    expect(getAppPreferences().shortcutBindings).toEqual({ "tool.line": ["Q"] });
  });

  it("keeps listening and explains why when the browser keeps the key", () => {
    openCapture("Line shortcut 1: L");

    press("w", { ctrlKey: true });

    const popover = capturePopover()!;
    expect(popover.textContent).toContain("Ctrl+W cannot be used");
    expect(popover.textContent).toContain("Browsers keep this key for tabs and windows");
    expect(getAppPreferences().shortcutBindings).toEqual({});
  });

  it("applies a key that may clash with the browser and says so", () => {
    openCapture("Line shortcut 1: L");

    press("K", { ctrlKey: true, shiftKey: true });

    expect(getAppPreferences().shortcutBindings).toEqual({ "tool.line": ["Mod+Shift+K"] });
    const popover = capturePopover()!;
    expect(popover.textContent).toContain("Set to Ctrl+Shift+K");
    expect(popover.textContent).toContain("May also trigger a browser shortcut");

    click(textButton("Done", popover));
    expect(capturePopover()).toBeNull();
    expect(document.activeElement).toBe(slot("Line shortcut 1: Ctrl+Shift+K"));
  });

  it("asks before taking a key from another action, and reassigns it on request", () => {
    openCapture("Polygon shortcut 1: P");

    press("L");

    const popover = capturePopover()!;
    expect(popover.textContent).toContain("Used by Line");
    expect(getAppPreferences().shortcutBindings).toEqual({});
    expect(document.activeElement).toBe(textButton("Reassign", popover));

    click(textButton("Reassign", popover));

    expect(getAppPreferences().shortcutBindings).toEqual({
      "tool.polygon": ["L"],
      "tool.line": [],
    });
    expect(capturePopover()).toBeNull();
    expect(slot("Polygon shortcut 1: L")).toBeTruthy();
    expect(slot("Add shortcut for Line")).toBeTruthy();
    expect(liveText()).toBe("Polygon set to L. Removed from Line. Line has no shortcut.");
    expect(document.activeElement).toBe(slot("Polygon shortcut 1: L"));
  });

  it("leaves the keys alone when a conflict is cancelled", () => {
    openCapture("Polygon shortcut 1: P");
    press("L");

    click(textButton("Cancel", capturePopover()!));

    expect(capturePopover()).toBeNull();
    expect(getAppPreferences().shortcutBindings).toEqual({});
    expect(document.activeElement).toBe(slot("Polygon shortcut 1: P"));
  });

  it("lets another key replace a pending conflict and puts the focus back on the listener", () => {
    openCapture("Polygon shortcut 1: P");
    press("L");
    expect(capturePopover()!.textContent).toContain("Used by Line");

    press("Q");

    expect(capturePopover()).toBeNull();
    expect(getAppPreferences().shortcutBindings).toEqual({ "tool.polygon": ["Q"] });
  });

  it("clears the key of the slot", () => {
    openCapture("Line shortcut 1: L");

    click(textButton("Clear", capturePopover()!));

    expect(getAppPreferences().shortcutBindings).toEqual({ "tool.line": [] });
    expect(capturePopover()).toBeNull();
    expect(slot("Add shortcut for Line")).toBeTruthy();
    expect(liveText()).toBe("L removed from Line. Line has no shortcut.");
    expect(document.activeElement).toBe(slot("Add shortcut for Line"));
  });

  it("moves the second key up when the first one is cleared", () => {
    openCapture("Zoom in shortcut 1: +");

    click(textButton("Clear", capturePopover()!));

    expect(getAppPreferences().shortcutBindings).toEqual({ "view.zoomIn": ["="] });
    expect(slot("Zoom in shortcut 1: =")).toBeTruthy();
    expect(liveText()).toBe("+ removed from Zoom in. Zoom in now uses =.");
  });

  it("offers Clear only for a slot that has a key", () => {
    const empty = openCapture("Add shortcut for Calibrate");
    expect(Array.from(empty.querySelectorAll("button"), (button) => button.textContent)).toEqual([
      "Cancel",
    ]);
  });

  it("cancels without changing anything and returns the focus to the slot", () => {
    openCapture("Line shortcut 1: L");

    click(textButton("Cancel", capturePopover()!));

    expect(capturePopover()).toBeNull();
    expect(getAppPreferences().shortcutBindings).toEqual({});
    expect(document.activeElement).toBe(slot("Line shortcut 1: L"));
  });

  it("closes on Escape and returns the focus to the slot", () => {
    openCapture("Line shortcut 1: L");

    press("Escape");

    expect(capturePopover()).toBeNull();
    expect(getAppPreferences().shortcutBindings).toEqual({});
    expect(document.activeElement).toBe(slot("Line shortcut 1: L"));
  });

  it("closes without a change when the same key is pressed again", () => {
    openCapture("Line shortcut 1: L");

    press("L");

    expect(capturePopover()).toBeNull();
    expect(getAppPreferences().shortcutBindings).toEqual({});
    expect(liveText()).toBe("");
  });

  it("keeps every key away from the global shortcuts while it listens", () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      openCapture("Line shortcut 1: L");
      press("N");
      press("Z", { ctrlKey: true });
      press("Q");
      expect(onWindowKey).not.toHaveBeenCalled();

      // Outside the capture the same keys reach the window as usual.
      press("Q");
      expect(onWindowKey).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  it("leaves Tab to move the focus and Enter to press its own buttons", () => {
    const popover = openCapture("Line shortcut 1: L");

    expect(press("Tab").defaultPrevented).toBe(false);
    expect(press("Tab", { shiftKey: true }).defaultPrevented).toBe(false);

    const cancel = textButton("Cancel", popover);
    act(() => cancel.focus());
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(press(" ").defaultPrevented).toBe(false);

    // Enter on the listening surface is only a key that cannot be used.
    act(() => popover.querySelector<HTMLElement>('[data-popover-autofocus="true"]')!.focus());
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(capturePopover()!.textContent).toContain("Enter cannot be used");
  });

  it("ignores modifier-only presses", () => {
    openCapture("Line shortcut 1: L");

    press("Shift", { shiftKey: true });
    press("Control", { ctrlKey: true });

    expect(capturePopover()!.textContent).toContain("Press the new shortcut");
    expect(getAppPreferences().shortcutBindings).toEqual({});
  });
});

describe("ShortcutsSettings row reset", () => {
  it("keeps a reset on every row, enabled only when it differs from the preset, and restores the preset keys", () => {
    // One per action, so the rows stay aligned whatever has changed.
    expect(host!.querySelectorAll("[aria-label$=' shortcut'][aria-label^='Reset ']")).toHaveLength(
      CATALOG.length,
    );
    expect(isRowResetEnabled("Line")).toBe(false);
    openCapture("Line shortcut 1: L");
    press("Q");
    expect(isRowResetEnabled("Line")).toBe(true);
    expect(isRowResetEnabled("Polygon")).toBe(false);

    click(rowResetButton("Line"));

    expect(getAppPreferences().shortcutBindings).toEqual({});
    expect(isRowResetEnabled("Line")).toBe(false);
    expect(liveText()).toBe("Line shortcut reset. Line now uses L.");
    expect(document.activeElement).toBe(slot("Line shortcut 1: L"));
  });

  it("resets to the stored preset, not to Default", () => {
    chooseSelectOption(presetTrigger(), "Left hand");
    openCapture("Line shortcut 1: S");
    press("J");
    expect(slot("Line shortcut 1: J")).toBeTruthy();

    click(rowResetButton("Line"));

    expect(slot("Line shortcut 1: S")).toBeTruthy();
    expect(getAppPreferences().shortcutBindings).toEqual(
      diffFromDefault(presetBindings("left-hand")),
    );
  });

  it("takes a key back from the action that took it", () => {
    openCapture("Polygon shortcut 1: P");
    press("L");
    click(textButton("Reassign", capturePopover()!));
    expect(isRowResetEnabled("Line")).toBe(true);

    click(rowResetButton("Line"));

    expect(slot("Line shortcut 1: L")).toBeTruthy();
    expect(slot("Add shortcut for Polygon")).toBeTruthy();
  });
});

describe("ShortcutsSettings search", () => {
  it("filters by label, group, description and key", () => {
    setSearch("zoom");
    expect(rowLabels()).toEqual(["Zoom in", "Zoom out"]);

    setSearch("drawing aids");
    expect(rowLabels()).toEqual(["Ortho", "Snap"]);

    setSearch("two-point");
    expect(rowLabels()).toEqual(["Line"]);

    setSearch("ctrl+z");
    expect(rowLabels()).toEqual(["Undo"]);

    setSearch("ctrl shift");
    expect(rowLabels()).toEqual(["Redo"]);
  });

  it("searches the Fixed keys too", () => {
    setSearch("pan");

    expect(rowLabels()).toContain("Pan");
  });

  it("follows the keys as they change", () => {
    setSearch("f9");
    expect(rowLabels()).toEqual([]);

    act(() => setAppPreference("shortcutBindings", { "tool.calibrate": ["F9"] }));

    expect(rowLabels()).toEqual(["Calibrate"]);
  });

  it("says when nothing matches and clears with the button", () => {
    setSearch("zzzz");

    expect(host!.textContent).toContain("No shortcuts match");
    expect(rowLabels()).toEqual([]);

    click(slot("Clear search"));

    expect(host!.textContent).not.toContain("No shortcuts match");
    expect(rowLabels()).toHaveLength(CATALOG.length + FIXED_KEYS.length);
    expect(hasSlot("Clear search")).toBe(false);
    expect(document.activeElement).toBe(host!.querySelector('input[type="search"]'));
  });

  it("keeps the same input while the clear button comes and goes, so typing never loses focus", () => {
    const input = host!.querySelector<HTMLInputElement>('input[type="search"]')!;

    setSearch("z");
    expect(host!.querySelector('input[type="search"]')).toBe(input);

    setSearch("");
    expect(host!.querySelector('input[type="search"]')).toBe(input);
  });

  it("offers the clear button only while there is a query", () => {
    expect(hasSlot("Clear search")).toBe(false);

    setSearch("zoom");
    expect(hasSlot("Clear search")).toBe(true);

    setSearch("");
    expect(hasSlot("Clear search")).toBe(false);
  });
});
