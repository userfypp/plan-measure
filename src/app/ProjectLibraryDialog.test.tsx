/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedProjectSummary } from "../services/persistence";
import { ProjectLibraryDialog } from "./ProjectLibraryDialog";

const projects: SavedProjectSummary[] = [
  { id: "current", name: "Level 01.pdf", pageCount: 2, savedAt: 1_800_000_000_000, isCurrent: true },
  { id: "other", name: "Level 02.pdf", pageCount: 4, savedAt: 1_799_000_000_000, isCurrent: false },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let showModalDescriptor: PropertyDescriptor | undefined;
let closeDescriptor: PropertyDescriptor | undefined;

function render({
  savedProjects = projects,
  currentSessionLoaded = true,
  onOpenProject = vi.fn(),
  onOpenPdf = vi.fn(),
  onClose = vi.fn(),
}: {
  savedProjects?: SavedProjectSummary[];
  currentSessionLoaded?: boolean;
  onOpenProject?: (id: string) => void;
  onOpenPdf?: () => void;
  onClose?: () => void;
} = {}) {
  act(() => {
    root!.render(
      <ProjectLibraryDialog
        open
        projects={savedProjects}
        currentSessionLoaded={currentSessionLoaded}
        opening={false}
        confirmDiscard={false}
        onOpenProject={onOpenProject}
        onOpenPdf={onOpenPdf}
        onRequestDiscard={vi.fn()}
        onCancelDiscard={vi.fn()}
        onConfirmDiscard={vi.fn()}
        onClose={onClose}
      />,
    );
  });
  return { onOpenProject, onOpenPdf, onClose };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

    expect(container?.textContent).toContain("Projects are saved on this device");
    expect(container?.textContent).toContain("Level 01.pdf");
    expect(container?.textContent).toContain("Current");
    expect(container?.textContent).toContain("4 pages");
    const openButton = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="Open project Level 02.pdf"]',
    );
    if (!openButton) throw new Error("The saved project action was not rendered.");
    act(() => openButton.click());

    expect(callbacks.onOpenProject).toHaveBeenCalledWith("other");
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

    render({ savedProjects: [], onOpenPdf });
    expect(container?.textContent).toContain("No saved projects yet");
    const openPdf = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Open PDF",
    );
    if (!openPdf) throw new Error("The new project action was not rendered.");
    act(() => openPdf.click());
    expect(callbacks.onOpenPdf).toHaveBeenCalledOnce();
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
          opening={false}
          confirmDiscard
          onOpenProject={vi.fn()}
          onOpenPdf={vi.fn()}
          onRequestDiscard={vi.fn()}
          onCancelDiscard={onCancelDiscard}
          onConfirmDiscard={onConfirmDiscard}
          onClose={vi.fn()}
        />,
      );
    });
    expect(container?.textContent).toContain("Other saved projects will remain available.");
    const keep = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Keep project",
    );
    const discard = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Discard project",
    );
    if (!keep || !discard) throw new Error("Project discard confirmation actions were not rendered.");
    act(() => keep.click());
    act(() => discard.click());
    expect(onCancelDiscard).toHaveBeenCalledOnce();
    expect(onConfirmDiscard).toHaveBeenCalledOnce();
  });
});
