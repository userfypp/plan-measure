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

function renderAppBar({
  documentName = "North Studio — Level 01.pdf",
  canExport = true,
  onOpenPdf = vi.fn(),
  onExport = vi.fn(),
}: {
  documentName?: string | null;
  canExport?: boolean;
  onOpenPdf?: () => void;
  onExport?: () => void;
} = {}) {
  act(() => {
    root!.render(
      <ThemeProvider>
        <AppBar
          documentName={documentName}
          canExport={canExport}
          measurementDecimalPlaces={2}
          confirmMeasurementDeletion
          recoveredPlanStartupWorkspace="scales"
          onOpenPdf={onOpenPdf}
          onExport={onExport}
          onMeasurementDecimalPlacesChange={vi.fn()}
          onConfirmMeasurementDeletionChange={vi.fn()}
          onRecoveredPlanStartupWorkspaceChange={vi.fn()}
        />
      </ThemeProvider>,
    );
  });
  return { onOpenPdf, onExport };
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
    const callbacks = renderAppBar();

    expect(container?.textContent).toContain("Plan Measure");
    expect(container?.textContent).toContain("North Studio — Level 01.pdf");
    expect(container?.textContent).not.toContain("View");
    expect(container?.textContent).not.toContain("Active scale");

    const open = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Open PDF",
    );
    const exportButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Export",
    );
    if (!open || !exportButton) throw new Error("App Bar document actions were not rendered.");
    act(() => open.click());
    act(() => exportButton.click());

    expect(callbacks.onOpenPdf).toHaveBeenCalledOnce();
    expect(callbacks.onExport).toHaveBeenCalledOnce();
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
    expect(
      Array.from(
        container!.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
          "header button, header a",
        ),
      ).map((action) => action.textContent?.trim() || action.getAttribute("aria-label")),
    ).toEqual(["Open PDF", "Export", "Feedback", "Settings"]);
  });

  it("uses the same ghost command hierarchy for Open PDF and Export", () => {
    renderAppBar();
    const actions = Array.from(container!.querySelectorAll<HTMLButtonElement>("header button"));
    const open = actions.find((button) => button.textContent === "Open PDF");
    const exportButton = actions.find((button) => button.textContent === "Export");
    if (!open || !exportButton) throw new Error("App Bar document actions were not rendered.");

    expect(open.classList.contains(buttonStyles.ghost!)).toBe(true);
    expect(exportButton.classList.contains(buttonStyles.ghost!)).toBe(true);
    expect(open.classList.contains(buttonStyles.secondary!)).toBe(false);
    expect(exportButton.classList.contains(buttonStyles.secondary!)).toBe(false);
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

  it("keeps Feedback first-level with its destination and removes the empty More menu", () => {
    renderAppBar();
    const feedback = container?.querySelector<HTMLAnchorElement>("a");
    expect(feedback?.textContent).toBe("Feedback");
    expect(feedback?.href).toBe("https://github.com/userfypp/plan-measure/discussions/1");
    expect(feedback?.target).toBe("_blank");
    expect(feedback?.rel).toBe("noopener noreferrer");
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
  });

  it("keeps Export unavailable before a document is open while retaining Feedback and Settings", () => {
    renderAppBar({ documentName: null, canExport: false });

    expect(container?.textContent).toContain("No PDF loaded");
    expect(container?.textContent).not.toContain("Export");
    expect(container?.textContent).toContain("Feedback");
    expect(buttonByLabel("Settings")).toBeTruthy();
  });
});
