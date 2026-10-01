/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import buttonStyles from "../components/ui/Button.module.css";
import { ThemeProvider } from "./themeState";
import { AppBar } from "./AppBar";

class MatchMediaController {
  readonly matchMedia = (query: string): MediaQueryList =>
    ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }) as MediaQueryList;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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
          onUndo={onUndo}
          onRedo={onRedo}
          onMeasurementDecimalPlacesChange={vi.fn()}
          onConfirmMeasurementDeletionChange={vi.fn()}
          onRecoveredPlanStartupWorkspaceChange={vi.fn()}
        />
      </ThemeProvider>,
    );
  });
  return { onExport, onOpenProjects, onUndo, onRedo };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: new MatchMediaController().matchMedia,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  root = null;
  container = null;
});

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
      "Export",
      "Projects, 2 saved",
      "Undo",
      "Redo",
      "Feedback",
      "Settings",
    ]);
  });

  it("uses a ghost command for Export", () => {
    renderAppBar();
    const actions = Array.from(container!.querySelectorAll<HTMLButtonElement>("header button"));
    const exportButton = actions.find((button) => button.textContent === "Export");
    if (!exportButton) throw new Error("App Bar document actions were not rendered.");

    expect(exportButton.classList.contains(buttonStyles.ghost!)).toBe(true);
    expect(exportButton.classList.contains(buttonStyles.secondary!)).toBe(false);
    expect(actions.some((button) => button.textContent === "Open PDF")).toBe(false);
  });

  it("uses one Tab stop for AppBar actions and arrow keys within that group", () => {
    renderAppBar();
    const toolbar = container?.querySelector<HTMLElement>('[role="toolbar"]');
    if (!toolbar) throw new Error("Application actions toolbar was not rendered.");
    const actions = Array.from(
      toolbar.querySelectorAll<HTMLElement>("button, a[href]"),
    );

    expect(toolbar.getAttribute("aria-label")).toBe("Application actions");
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

  it("does not route portal Home/End keys back through the AppBar toolbar", () => {
    renderAppBar();
    act(() => buttonByLabel("Settings").click());
    const focusedSetting = document.activeElement;
    expect(focusedSetting?.closest('[role="toolbar"]')).toBeNull();

    expect(press("Home").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(focusedSetting);
    expect(press("End").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(focusedSetting);
  });

  it("delegates Settings to the structured dialog popover", () => {
    renderAppBar();
    const settings = buttonByLabel("Settings");
    expect(settings.getAttribute("aria-haspopup")).toBe("dialog");
    expect(settings.getAttribute("aria-expanded")).toBe("false");

    act(() => settings.click());

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Settings");
    expect(dialog?.textContent).toContain("INTERFACE");
    expect(dialog?.textContent).toContain("MEASUREMENTS");
    expect(dialog?.querySelector('[role="menu"]')).toBeNull();
    expect(settings.getAttribute("aria-expanded")).toBe("true");
    expect(settings.getAttribute("aria-controls")).toBe(dialog?.id);
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
    expect(container?.textContent).toContain("Feedback");
    act(() => buttonByLabel("Feedback").click());
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    expect(buttonByLabel("Settings")).toBeTruthy();
  });
});
