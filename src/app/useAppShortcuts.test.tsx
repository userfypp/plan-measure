/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppPreferences, setAppPreference } from "../utils/appPreferences";
import { subscribeSettingsDialogRequests } from "./settingsDialogRequest";
import { useAppShortcuts } from "./useAppShortcuts";

type Deps = Parameters<typeof useAppShortcuts>[0];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setup(overrides: Partial<Deps> = {}) {
  const calls = {
    openExportDialog: vi.fn(),
    openProjectLibrary: vi.fn(),
    setWorkspaceModule: vi.fn(),
  };
  const settingsRequests = vi.fn();
  const unsubscribe = subscribeSettingsDialogRequests(settingsRequests);
  const deps: Deps = {
    hasProject: true,
    workspaceModule: "measurements",
    ...calls,
    ...overrides,
  };
  function Harness() {
    useAppShortcuts(deps);
    return null;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<Harness />));
  return { calls, settingsRequests, unsubscribe };
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const mod = { ctrlKey: true };

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetAppPreferences();
});

describe("project, export and settings shortcuts", () => {
  it("opens the project library, export and settings from their keys", () => {
    const { calls, settingsRequests, unsubscribe } = setup();

    expect(press("o", mod).defaultPrevented).toBe(true);
    expect(press("e", { metaKey: true }).defaultPrevented).toBe(true);
    expect(press(",", mod).defaultPrevented).toBe(true);
    unsubscribe();

    expect(calls.openProjectLibrary).toHaveBeenCalledOnce();
    expect(calls.openExportDialog).toHaveBeenCalledOnce();
    expect(settingsRequests).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("offers Export only with a project open, like the app bar button", () => {
    const { calls, unsubscribe } = setup({ hasProject: false });

    expect(press("e", mod).defaultPrevented).toBe(false);
    press("o", mod);
    unsubscribe();

    expect(calls.openExportDialog).not.toHaveBeenCalled();
    expect(calls.openProjectLibrary).toHaveBeenCalledOnce();
  });

  it("does nothing while a dialog is open, so a second library or export never stacks", () => {
    const { calls, settingsRequests, unsubscribe } = setup();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);

    expect(press("o", mod).defaultPrevented).toBe(false);
    press("e", mod);
    press(",", mod);
    dialog.remove();
    unsubscribe();

    expect(calls.openProjectLibrary).not.toHaveBeenCalled();
    expect(calls.openExportDialog).not.toHaveBeenCalled();
    expect(settingsRequests).not.toHaveBeenCalled();
  });

  it("follows rebinding live and stops answering the old keys", () => {
    const { calls, unsubscribe } = setup();

    act(() => setAppPreference("shortcutBindings", { "app.projects": ["Mod+Shift+P"] }));
    press("o", mod);
    press("p", { ...mod, shiftKey: true });
    unsubscribe();

    expect(calls.openProjectLibrary).toHaveBeenCalledOnce();
  });
});

describe("workspace shortcuts", () => {
  it("jumps straight to a module with its key", () => {
    const { calls, unsubscribe } = setup({ workspaceModule: "scales" });

    expect(press("1").defaultPrevented).toBe(true);
    press("2");
    press("3");
    press("4");
    unsubscribe();

    expect(calls.setWorkspaceModule.mock.calls).toEqual([
      ["measurements"],
      ["takeoff"],
      ["classifications"],
      ["scales"],
    ]);
  });

  it("steps to the next and previous module and wraps once they are bound", () => {
    const { calls, unsubscribe } = setup({ workspaceModule: "scales" });
    act(() =>
      setAppPreference("shortcutBindings", {
        "workspace.next": ["Alt+PageDown"],
        "workspace.previous": ["Alt+PageUp"],
      }),
    );

    press("PageDown", { altKey: true });
    press("PageUp", { altKey: true });
    unsubscribe();

    expect(calls.setWorkspaceModule.mock.calls).toEqual([["measurements"], ["classifications"]]);
  });

  it("leaves the keys alone without a project, in a dialog or in a text field", () => {
    const withoutProject = setup({ hasProject: false });
    expect(press("1").defaultPrevented).toBe(false);
    expect(withoutProject.calls.setWorkspaceModule).not.toHaveBeenCalled();
    withoutProject.unsubscribe();
    act(() => root!.unmount());
    container!.remove();

    const { calls, unsubscribe } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    press("2", {}, input);
    input.remove();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    press("3");
    dialog.remove();
    unsubscribe();

    expect(calls.setWorkspaceModule).not.toHaveBeenCalled();
  });

  it("follows rebinding live", () => {
    const { calls, unsubscribe } = setup();

    act(() => setAppPreference("shortcutBindings", { "workspace.takeoff": ["Q"] }));
    press("2");
    press("q");
    unsubscribe();

    expect(calls.setWorkspaceModule.mock.calls).toEqual([["takeoff"]]);
  });
});
