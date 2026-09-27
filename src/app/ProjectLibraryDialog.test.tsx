/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedProjectSummary } from "../services/persistence";
import buttonStyles from "../components/ui/Button.module.css";
import dialogStyles from "../components/ui/Dialog.module.css";
import { ProjectLibraryDialog } from "./ProjectLibraryDialog";

const projects: SavedProjectSummary[] = [
  {
    id: "current",
    name: "Level 01.pdf",
    pageCount: 2,
    savedAt: 1_800_000_000_000,
    isCurrent: true,
  },
  { id: "other", name: "Level 02.pdf", pageCount: 4, savedAt: 1_799_000_000_000, isCurrent: false },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let showModalDescriptor: PropertyDescriptor | undefined;
let closeDescriptor: PropertyDescriptor | undefined;

function render({
  savedProjects = projects,
  currentSessionLoaded = true,
  activeProjectId = "current",
  opening = false,
  onOpenProject = vi.fn(),
  onOpenPdf = vi.fn(),
  onImportProject = vi.fn(),
  onExportProject = vi.fn(),
  onRequestDiscard = vi.fn(),
  onConfirmDiscard = vi.fn(),
  onClose = vi.fn(),
}: {
  savedProjects?: SavedProjectSummary[];
  currentSessionLoaded?: boolean;
  activeProjectId?: string | null;
  opening?: boolean;
  onOpenProject?: (id: string) => void;
  onOpenPdf?: () => void;
  onImportProject?: () => void;
  onExportProject?: (id?: string) => void;
  onRequestDiscard?: (id: string) => void;
  onConfirmDiscard?: (id: string) => void;
  onClose?: () => void;
} = {}) {
  act(() => {
    root!.render(
      <ProjectLibraryDialog
        open
        projects={savedProjects}
        currentSessionLoaded={currentSessionLoaded}
        activeProjectId={activeProjectId}
        opening={opening}
        pendingDiscardProjectId={null}
        onOpenProject={onOpenProject}
        onOpenPdf={onOpenPdf}
        onImportProject={onImportProject}
        onExportProject={onExportProject}
        onRequestDiscard={onRequestDiscard}
        onCancelDiscard={vi.fn()}
        onConfirmDiscard={onConfirmDiscard}
        onClose={onClose}
      />,
    );
  });
  return {
    onOpenProject,
    onOpenPdf,
    onImportProject,
    onExportProject,
    onRequestDiscard,
    onConfirmDiscard,
    onClose,
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  if (showModalDescriptor) {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModalDescriptor);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  }
  if (closeDescriptor) {
    Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  }
});

describe("ProjectLibraryDialog", () => {
  it("shows saved project details and opens a selected project", () => {
    const callbacks = render();

    expect(container?.textContent).not.toContain("Saved on this device");
    expect(container?.querySelector("dialog")?.classList.contains(dialogStyles.large!)).toBe(true);
    expect(container?.textContent).not.toContain("Open one to continue where you left off");
    expect(container?.textContent).toContain("Level 01.pdf");
    expect(container?.textContent).toContain("Current");
    expect(container?.textContent).toContain("4 pages");
    const currentButton = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="Current project Level 01.pdf"]',
    );
    expect(currentButton?.textContent).toBe("Current");
    expect(currentButton?.getAttribute("aria-disabled")).toBe("true");
    const openButton = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="Open project Level 02.pdf"]',
    );
    if (!openButton) throw new Error("The saved project action was not rendered.");
    const projectRows = container?.querySelectorAll('[aria-label="Saved projects"] > li');
    expect(projectRows).toHaveLength(2);
    expect([...(projectRows ?? [])].map((row) => row.querySelectorAll("button").length)).toEqual([
      3, 3,
    ]);
    const projectButtons = [...(projectRows ?? [])].flatMap((row) => [
      ...row.querySelectorAll<HTMLButtonElement>("button"),
    ]);
    expect(projectButtons).toHaveLength(6);
    expect(projectButtons.every((button) => button.classList.contains(buttonStyles.compact!))).toBe(
      true,
    );
    act(() => openButton.click());

    expect(callbacks.onOpenProject).toHaveBeenCalledWith("other");
    const exportButton = projectRows?.[1]?.querySelector<HTMLButtonElement>(
      'button[aria-label="Export project Level 02.pdf"]',
    );
    if (!exportButton) throw new Error("The project export action was not rendered.");
    act(() => exportButton.click());
    expect(callbacks.onExportProject).toHaveBeenCalledWith("other");
    const discardButton = [...(projectRows?.[1]?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Discard",
    );
    if (!discardButton) throw new Error("The project discard action was not rendered.");
    act(() => discardButton.click());
    expect(callbacks.onRequestDiscard).toHaveBeenCalledWith("other");
  });

  it("offers a continue action before restoring the current project and supports an empty library", () => {
    const onOpenPdf = vi.fn();
    const callbacks = render({ currentSessionLoaded: false, onOpenPdf });
    const continueButton = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Continue",
    );
    if (!continueButton) throw new Error("The current project continue action was not rendered.");
    act(() => continueButton.click());
    expect(callbacks.onOpenProject).toHaveBeenCalledWith("current");

    const emptyCallbacks = render({ savedProjects: [], onOpenPdf });
    expect(container?.textContent).toContain("No saved projects");
    const openPdf = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Open PDF",
    );
    if (!openPdf) throw new Error("The new project action was not rendered.");
    act(() => openPdf.click());
    expect(callbacks.onOpenPdf).toHaveBeenCalledOnce();
    const importProject = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Import project",
    );
    if (!importProject) throw new Error("The project import action was not rendered.");
    const close = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Close",
    );
    if (!close) throw new Error("The project close action was not rendered.");
    const exportCurrent = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Export current project",
    );
    if (!exportCurrent) throw new Error("The current project export action was not rendered.");
    expect(
      [close, exportCurrent, importProject, openPdf].every((button) =>
        button.classList.contains(buttonStyles.compact!),
      ),
    ).toBe(true);
    act(() => importProject.click());
    expect(emptyCallbacks.onImportProject).toHaveBeenCalledOnce();
  });

  it("disables project actions while a project operation is pending", () => {
    render({ opening: true });

    const projectButtons = container?.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Saved projects"] button',
    );
    expect(projectButtons).toHaveLength(6);
    expect(
      [...projectButtons!].every(
        (button) => button.disabled || button.getAttribute("aria-disabled") === "true",
      ),
    ).toBe(true);
    const openPdf = [...(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent === "Open PDF",
    );
    expect(openPdf?.disabled).toBe(true);
  });

  it("offers export for an open project even when it is absent from local storage", () => {
    const onExportProject = vi.fn();
    render({ savedProjects: projects, activeProjectId: "unsaved-project", onExportProject });
    expect(container?.querySelector('[aria-label="Current project Level 01.pdf"]')).toBeNull();
    const exportCurrent = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Export current project",
    );
    if (!exportCurrent) throw new Error("The current project export action was not rendered.");
    act(() => exportCurrent.click());
    expect(onExportProject).toHaveBeenCalledWith();
  });

  it("confirms removal of the pending current project while keeping other projects", () => {
    const onCancelDiscard = vi.fn();
    const onConfirmDiscard = vi.fn();
    act(() => {
      root!.render(
        <ProjectLibraryDialog
          open
          projects={projects}
          currentSessionLoaded={false}
          activeProjectId="current"
          opening={false}
          pendingDiscardProjectId="current"
          onOpenProject={vi.fn()}
          onOpenPdf={vi.fn()}
          onImportProject={vi.fn()}
          onExportProject={vi.fn()}
          onRequestDiscard={vi.fn()}
          onCancelDiscard={onCancelDiscard}
          onConfirmDiscard={onConfirmDiscard}
          onClose={vi.fn()}
        />,
      );
    });
    expect(container?.textContent).toContain("Level 01.pdf");
    expect(container?.textContent).toContain("Other projects stay saved.");
    const discardDialog = container?.querySelector("dialog");
    expect(discardDialog?.classList.contains(dialogStyles.dialog!)).toBe(true);
    expect(discardDialog?.classList.contains(dialogStyles.large!)).toBe(false);
    const keep = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Keep project",
    );
    const discard = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Discard",
    );
    if (!keep || !discard)
      throw new Error("Project discard confirmation actions were not rendered.");
    act(() => keep.click());
    act(() => discard.click());
    expect(onCancelDiscard).toHaveBeenCalledOnce();
    expect(onConfirmDiscard).toHaveBeenCalledWith("current");
  });
});
