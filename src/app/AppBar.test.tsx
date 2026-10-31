/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import buttonStyles from "../components/ui/Button.module.css";
import { ThemeProvider } from "./themeState";
import { AppBar } from "./AppBar";
import { stubDialogMethods, stubMatchMedia } from "../test/domTestUtils";
import { resetAppPreferences, setAppPreference } from "../utils/appPreferences";
import { requestSettingsDialog } from "./settingsDialogRequest";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let restoreDialogMethods = () => {};

function buttonByLabel(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button ${label} was not rendered.`);
  return button;
}

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.activeElement?.dispatchEvent(event);
  });
  return event;
}

function renderAppBar({
  documentName = "North Studio — Level 01.pdf",
  canExport = true,
  savedProjectCount = 0,
  canUndo = true,
  canRedo = true,
  onExport = vi.fn(),
  onOpenProjects = vi.fn(),
  onCloseProject = vi.fn(),
  onUndo = vi.fn(),
  onRedo = vi.fn(),
}: {
  documentName?: string | null;
  canExport?: boolean;
  savedProjectCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onExport?: () => void;
  onOpenProjects?: () => void;
  onCloseProject?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
} = {}) {
  act(() => {
    root!.render(
      <ThemeProvider>
        <AppBar
          documentName={documentName}
          canExport={canExport}
          savedProjectCount={savedProjectCount}
          canUndo={canUndo}
          canRedo={canRedo}
          measurementDecimalPlaces={2}
          confirmMeasurementDeletion
          recoveredPlanStartupWorkspace="scales"
          onExport={onExport}
          onOpenProjects={onOpenProjects}
          onCloseProject={onCloseProject}
          onUndo={onUndo}
          onRedo={onRedo}
          onMeasurementDecimalPlacesChange={vi.fn()}
          onConfirmMeasurementDeletionChange={vi.fn()}
          onRecoveredPlanStartupWorkspaceChange={vi.fn()}
        />
      </ThemeProvider>,
    );
  });
  return { onExport, onOpenProjects, onCloseProject, onUndo, onRedo };
}

beforeEach(() => {
  restoreDialogMethods = stubDialogMethods();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  stubMatchMedia();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  resetAppPreferences();
  if (root) act(() => root?.unmount());
  restoreDialogMethods();
  container?.remove();
  vi.restoreAllMocks();
  root = null;
  container = null;
});

function tooltipOf(button: HTMLElement): string | undefined {
  act(() => setAppPreference("tooltipDelay", "instant"));
  act(() => button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  const text = document.querySelector('[role="tooltip"]')?.textContent ?? undefined;
  act(() => button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
  return text;
}

/** Settings loads lazily, so wait for the module before asserting on the dialog. */
async function clickAndLoad(button: HTMLElement) {
  await import("./SettingsDialog");
  await act(async () => {
    button.click();
  });
}

describe("AppBar", () => {
  it("owns document/global actions without reintroducing Viewer Dock responsibilities", () => {
    const callbacks = renderAppBar({ savedProjectCount: 2 });

    expect(container?.textContent).toContain("Plan Measure");
    expect(container?.textContent).toContain("North Studio — Level 01.pdf");
    expect(container?.textContent).not.toContain("View");
    expect(container?.textContent).not.toContain("Active scale");

    const exportButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Export",
    );
    if (!exportButton) throw new Error("App Bar document actions were not rendered.");
    act(() => exportButton.click());
    act(() => buttonByLabel("Projects, 2 saved").click());

    expect(callbacks.onExport).toHaveBeenCalledOnce();
    expect(callbacks.onOpenProjects).toHaveBeenCalledOnce();
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
    expect(
      Array.from(
        container!.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
          "header button, header a",
        ),
      ).map((action) => action.getAttribute("aria-label") || action.textContent?.trim()),
    ).toEqual([
      "Close project",
      "Undo",
      "Redo",
      "Export",
      "Projects, 2 saved",
      "Feedback",
      "Settings",
    ]);
  });

  it("uses the primary variant for Export", () => {
    renderAppBar();
    const actions = Array.from(container!.querySelectorAll<HTMLButtonElement>("header button"));
    const exportButton = actions.find((button) => button.textContent === "Export");
    if (!exportButton) throw new Error("App Bar document actions were not rendered.");

    expect(exportButton.classList.contains(buttonStyles.primary!)).toBe(true);
    expect(exportButton.classList.contains(buttonStyles.ghost!)).toBe(false);
    expect(actions.some((button) => button.textContent === "Open PDF")).toBe(false);
  });

  it("uses one Tab stop for AppBar actions and arrow keys within that group", () => {
    renderAppBar();
    const toolbar = container?.querySelector<HTMLElement>('[role="toolbar"]');
    if (!toolbar) throw new Error("Application actions toolbar was not rendered.");
    const actions = Array.from(toolbar.querySelectorAll<HTMLElement>("button, a[href]"));

    expect(toolbar.getAttribute("aria-label")).toBe("Application actions");
    expect(
      actions.map((action) => action.getAttribute("aria-label") || action.textContent),
    ).toEqual(["Undo", "Redo", "Export", "Projects", "Feedback", "Settings"]);
    expect(actions.map((action) => action.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);

    act(() => actions[0]?.focus());
    press("ArrowRight");
    expect(document.activeElement).toBe(actions[1]);
    press("ArrowRight");
    expect(document.activeElement).toBe(actions[2]);
    press("End");
    expect(document.activeElement).toBe(actions[5]);
    press("ArrowRight");
    expect(document.activeElement).toBe(actions[0]);
    expect(actions.filter((action) => action.tabIndex === 0)).toEqual([actions[0]]);
  });

  it("does not route portal Home/End keys back through the AppBar toolbar", async () => {
    renderAppBar();
    await clickAndLoad(buttonByLabel("Settings"));
    const done = Array.from(document.querySelectorAll("dialog button")).find(
      (button) => button.textContent === "Done",
    ) as HTMLButtonElement;
    act(() => done.focus());
    const focusedSetting = document.activeElement;
    expect(focusedSetting?.closest('[role="toolbar"]')).toBeNull();

    expect(press("Home").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(focusedSetting);
    expect(press("End").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(focusedSetting);
  });

  it("opens Settings as a modal dialog with side navigation", async () => {
    renderAppBar();
    const settings = buttonByLabel("Settings");
    expect(settings.getAttribute("aria-haspopup")).toBe("dialog");
    expect(settings.getAttribute("aria-expanded")).toBe("false");

    await clickAndLoad(settings);

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Settings");
    expect(dialog?.querySelector('[role="tablist"]')).not.toBeNull();
    expect(dialog?.querySelector('[role="menu"]')).toBeNull();
    expect(settings.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens Feedback options with the discussion and existing issue templates", () => {
    renderAppBar();
    const feedback = buttonByLabel("Feedback");
    expect(feedback.getAttribute("aria-haspopup")).toBe("menu");
    expect(feedback.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="menu"]')).toBeNull();

    act(() => feedback.click());

    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.getAttribute("aria-label")).toBe("Feedback options");
    expect(feedback.getAttribute("aria-expanded")).toBe("true");
    expect(feedback.getAttribute("aria-controls")).toBe(menu?.id);
    const links = Array.from(menu!.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'));
    expect(links.map((link) => [link.textContent, link.href])).toEqual([
      ["Give feedback", "https://github.com/userfypp/plan-measure/discussions/1"],
      [
        "Request a feature",
        "https://github.com/userfypp/plan-measure/issues/new?template=feature_request.yml",
      ],
      [
        "Report a bug",
        "https://github.com/userfypp/plan-measure/issues/new?template=bug_report.yml",
      ],
    ]);
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noopener noreferrer");
    }
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
  });

  it("navigates Feedback links with the keyboard and restores trigger focus on dismissal", () => {
    renderAppBar();
    const feedback = buttonByLabel("Feedback");
    act(() => feedback.click());
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'));
    expect(document.activeElement).toBe(links[0]);
    expect(links.map((link) => link.tabIndex)).toEqual([0, -1, -1]);
    press("ArrowDown");
    expect(document.activeElement).toBe(links[1]);
    press("End");
    expect(document.activeElement).toBe(links[2]);
    press("Home");
    expect(document.activeElement).toBe(links[0]);
    press("Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(feedback.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(feedback);
  });

  it.each(["click", "Enter", " "])(
    "activates a Feedback link with %s and closes the menu",
    (activation) => {
      renderAppBar();
      const feedback = buttonByLabel("Feedback");
      act(() => feedback.click());
      press("ArrowDown");
      const link = document.activeElement as HTMLAnchorElement;
      const onClick = vi.fn((event: MouseEvent) => event.preventDefault());
      link.addEventListener("click", onClick);
      if (activation === "click") act(() => link.click());
      else press(activation);

      expect(onClick).toHaveBeenCalledOnce();
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(feedback);
    },
  );

  it("keeps Export unavailable before a document is open while retaining Feedback and Settings", () => {
    renderAppBar({ documentName: null, canExport: false });

    expect(container?.textContent).toContain("No PDF loaded");
    expect(container?.textContent).not.toContain("Export");
    expect(document.querySelector('button[aria-label="Feedback"]')).not.toBeNull();
    act(() => buttonByLabel("Feedback").click());
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    expect(buttonByLabel("Settings")).toBeTruthy();
  });

  it("closes the open project from beside its name", () => {
    const { onCloseProject } = renderAppBar();

    act(() => buttonByLabel("Close project").click());

    expect(onCloseProject).toHaveBeenCalledTimes(1);
  });

  it("offers no Close project action when no document is open", () => {
    renderAppBar({ documentName: null, canExport: false });

    expect(document.querySelector('button[aria-label="Close project"]')).toBeNull();
  });

  it("shows the undo and redo shortcuts in the tooltip and key shortcuts", () => {
    renderAppBar();

    expect(tooltipOf(buttonByLabel("Undo"))).toBe("Undo (Ctrl+Z)");
    expect(buttonByLabel("Undo").getAttribute("aria-keyshortcuts")).toBe("Control+Z Meta+Z");
    expect(tooltipOf(buttonByLabel("Redo"))).toBe("Redo (Ctrl+Shift+Z)");
    expect(buttonByLabel("Redo").getAttribute("aria-keyshortcuts")).toBe(
      "Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y",
    );
  });

  it("follows rebound undo and redo keys, and drops the text when a key is cleared", () => {
    renderAppBar();

    act(() => setAppPreference("shortcutBindings", { "edit.undo": ["Mod+U"], "edit.redo": [] }));

    expect(tooltipOf(buttonByLabel("Undo"))).toBe("Undo (Ctrl+U)");
    expect(buttonByLabel("Undo").getAttribute("aria-keyshortcuts")).toBe("Control+U Meta+U");
    expect(tooltipOf(buttonByLabel("Redo"))).toBe("Redo");
    expect(buttonByLabel("Redo").hasAttribute("aria-keyshortcuts")).toBe(false);
  });

  it("shows the Export, Projects and Settings shortcuts in their labels and key shortcuts", () => {
    renderAppBar();
    const exportButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Export",
    )!;

    expect(tooltipOf(exportButton)).toBe("Export (Ctrl+E)");
    expect(exportButton.getAttribute("aria-keyshortcuts")).toBe("Control+E Meta+E");
    expect(tooltipOf(buttonByLabel("Projects"))).toBe("Projects (Ctrl+O)");
    expect(buttonByLabel("Projects").getAttribute("aria-keyshortcuts")).toBe("Control+O Meta+O");
    expect(tooltipOf(buttonByLabel("Settings"))).toBe("Settings (Ctrl+,)");
    expect(buttonByLabel("Settings").getAttribute("aria-keyshortcuts")).toBe("Control+, Meta+,");
  });

  it("follows rebound Export, Projects and Settings keys, and drops them when cleared", () => {
    renderAppBar();
    const exportButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Export",
    )!;

    act(() =>
      setAppPreference("shortcutBindings", {
        "app.export": ["Mod+Shift+E"],
        "app.projects": [],
        "app.settings": [],
      }),
    );

    expect(tooltipOf(exportButton)).toBe("Export (Ctrl+Shift+E)");
    expect(exportButton.getAttribute("aria-keyshortcuts")).toBe("Control+Shift+E Meta+Shift+E");
    expect(tooltipOf(buttonByLabel("Projects"))).toBeUndefined();
    expect(buttonByLabel("Projects").hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(tooltipOf(buttonByLabel("Settings"))).toBe("Settings");
    expect(buttonByLabel("Settings").hasAttribute("aria-keyshortcuts")).toBe(false);
  });

  it("opens Settings on the requested section, or on Interface when none is given", async () => {
    renderAppBar();
    await import("./SettingsDialog");

    await act(async () => requestSettingsDialog("shortcuts"));
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe(
      "Shortcuts",
    );

    act(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button'))
        .find((button) => button.textContent === "Done")
        ?.click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => requestSettingsDialog());
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe(
      "Interface",
    );
  });
});
