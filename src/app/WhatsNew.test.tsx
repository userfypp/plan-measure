/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDialogMethods } from "../test/domTestUtils";
import type { ReleaseNote } from "../types/releaseNotes";
import WhatsNew, { WhatsNewList } from "./WhatsNew";
import { WHATS_NEW_SEEN_STORAGE_KEY, readSeenRelease, writeSeenRelease } from "./whatsNewSeen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const releases: ReleaseNote[] = [
  {
    version: "2.1.0",
    date: "2026-02-03",
    url: "https://github.com/acme/app/releases/tag/v2.1.0",
    sections: [
      { title: "Added", entries: ["Add CSV bundles"] },
      { title: "Fixed", entries: ["Fix a label", "Fix a crash"] },
    ],
    more: 3,
  },
  { version: "2.0.0", date: "2026-01-01", url: null, sections: [], more: 0 },
];

let container: HTMLDivElement;
let root: Root;
let restoreDialogMethods: () => void;

beforeEach(() => {
  restoreDialogMethods = stubDialogMethods();
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  restoreDialogMethods();
  window.localStorage.clear();
});

function trigger(): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.startsWith("What's new"),
  );
  if (!match) throw new Error("Missing What's new button");
  return match;
}

describe("WhatsNewList", () => {
  it("lists each release with its entries, a release link and what was left out", () => {
    act(() => root.render(<WhatsNewList releases={releases} highlightLatest={false} />));
    expect([...container.querySelectorAll("h3")].map((h) => h.textContent)).toEqual([
      "2.1.0",
      "2.0.0",
    ]);
    expect([...container.querySelectorAll("h4")].map((h) => h.textContent)).toEqual([
      "Added",
      "Fixed",
    ]);
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Add CSV bundles",
      "Fix a label",
      "Fix a crash",
    ]);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe(releases[0]!.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-label")).toBe("Release notes for 2.1.0 on GitHub");
    expect(container.textContent).toContain("and 3 more changes");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.textContent).not.toContain("New");
  });

  it("badges only the newest release, and only while it is highlighted", () => {
    act(() => root.render(<WhatsNewList releases={releases} highlightLatest />));
    const headers = [...container.querySelectorAll("article > header")];
    expect(headers[0]!.textContent).toContain("New");
    expect(headers[1]!.textContent).not.toContain("New");
  });
});

describe("WhatsNew", () => {
  it("offers a button that opens the release dialog and closes it again", () => {
    act(() => root.render(<WhatsNew />));
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(false);

    act(() => trigger().click());
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("What's new");
    expect(dialog.querySelectorAll("article").length).toBeGreaterThan(0);

    const close = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Close")!;
    act(() => close.click());
    expect(dialog.open).toBe(false);
  });

  it("badges the button until the current version has been opened, then remembers it", () => {
    act(() => root.render(<WhatsNew />));
    expect(trigger().textContent).toBe("What's newNew");
    expect(readSeenRelease()).toBeNull();

    act(() => trigger().click());
    const version = container.querySelector("h3")!.textContent!;
    expect(readSeenRelease()).toBe(version);
    expect(trigger().textContent).toBe("What's new");
    // The dialog keeps its badge for this reading.
    expect(container.querySelector("article > header")?.textContent).toContain("New");

    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<WhatsNew />));
    expect(trigger().textContent).toBe("What's new");
  });

  it("treats a seen older version as new and survives unavailable storage", () => {
    writeSeenRelease("0.0.1");
    act(() => root.render(<WhatsNew />));
    expect(trigger().textContent).toBe("What's newNew");

    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(readSeenRelease()).toBeNull();
    } finally {
      getItem.mockRestore();
    }
    expect(WHATS_NEW_SEEN_STORAGE_KEY).toBe("plan-measure.whats-new-seen");
  });
});
