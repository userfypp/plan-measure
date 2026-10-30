/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHORTCUTS_NOTICE_STORAGE_KEY as KEY } from "./notice";

type NoticeModule = typeof import("./notice");

/** A page load: the module evaluates now, so it sees whatever the storage holds at this moment. */
async function loadPage(): Promise<NoticeModule> {
  vi.resetModules();
  return import("./notice");
}

const marker = () => window.localStorage.getItem(KEY);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.doUnmock("./bindings");
  window.localStorage.clear();
});

describe("shortcuts notice decision", () => {
  it("does not show on a fresh install and remembers it as done", async () => {
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
    expect(marker()).toBe("done");
  });

  it("shows for a browser that already holds app keys and writes nothing until it is shown", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
    expect(marker()).toBeNull();
  });

  it("ignores storage keys that do not belong to the app", async () => {
    window.localStorage.setItem("other-app.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
  });

  it("is not fooled by keys the app writes after the module loaded", async () => {
    const notice = await loadPage();
    window.localStorage.setItem("plan-measure.theme", "dark");
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
    expect(marker()).toBe("done");
  });

  it("honours a done marker even when the browser holds app keys", async () => {
    window.localStorage.setItem(KEY, "done");
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
    expect(marker()).toBe("done");
  });

  it("treats an unknown marker like a missing one", async () => {
    window.localStorage.setItem(KEY, "later");
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
    expect(notice.markShortcutsNoticeShown()).toBe(true);
    expect(marker()).toBe("done");
  });

  it("decides once per page load", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
    window.localStorage.setItem(KEY, "done");
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
  });

  it("never shows once Default no longer differs from Legacy", async () => {
    vi.doMock("./bindings", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./bindings")>()),
      DEFAULT_CHANGES_LEGACY: false,
    }));
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
    expect(marker()).toBe("done");
  });

  it("marking it shown writes done at once, and neither this nor the next page load shows it again", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
    expect(notice.markShortcutsNoticeShown()).toBe(true);
    expect(marker()).toBe("done");
    expect(notice.shouldShowShortcutsNotice()).toBe(false);

    const nextVisit = await loadPage();
    expect(nextVisit.shouldShowShortcutsNotice()).toBe(false);
  });

  it("shows again on the next page load while it has not been shown", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    expect((await loadPage()).shouldShowShortcutsNotice()).toBe(true);
    expect((await loadPage()).shouldShowShortcutsNotice()).toBe(true);
  });

  it("looks at the stored keys again after a test reset", async () => {
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
    window.localStorage.clear();
    window.localStorage.setItem("plan-measure.preferences", "{}");
    notice.resetShortcutsNoticeForTests();
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
  });
});

describe("shortcuts notice with unusable storage", () => {
  it("never shows when reading the marker throws", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
  });

  it("reports that the marker could not be written, so the notice stays hidden", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(notice.markShortcutsNoticeShown()).toBe(false);
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
  });

  it("never shows when the marker cannot be written on a fresh install", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
  });

  it("treats storage that cannot be listed as a fresh install", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
  });

  it("copes with no localStorage at all", async () => {
    vi.stubGlobal("window", {});
    try {
      const notice = await loadPage();
      expect(notice.shouldShowShortcutsNotice()).toBe(false);
      expect(notice.markShortcutsNoticeShown()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("saved projects as a second signal", () => {
  it("turns a browser with projects but no app keys into an upgrading one", async () => {
    const notice = await loadPage();
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
    expect(notice.noteSavedProjectsAtStartup(true)).toBe(true);
    expect(notice.shouldShowShortcutsNotice()).toBe(true);
    expect(notice.markShortcutsNoticeShown()).toBe(true);
    expect(marker()).toBe("done");
    expect(notice.shouldShowShortcutsNotice()).toBe(false);
  });

  it("decides on the first call only, so a project made this visit changes nothing", async () => {
    const notice = await loadPage();
    expect(notice.noteSavedProjectsAtStartup(false)).toBe(false);
    expect(notice.noteSavedProjectsAtStartup(true)).toBe(false);
    expect(marker()).toBe("done");
  });

  it("settles the decision itself when it is the first to ask", async () => {
    const notice = await loadPage();
    expect(notice.noteSavedProjectsAtStartup(true)).toBe(true);
  });

  it("leaves a user who already saw the notice alone", async () => {
    window.localStorage.setItem(KEY, "done");
    const notice = await loadPage();
    expect(notice.noteSavedProjectsAtStartup(true)).toBe(false);
    expect(marker()).toBe("done");
  });

  it("keeps an upgrading user due", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.noteSavedProjectsAtStartup(true)).toBe(true);
    expect(notice.noteSavedProjectsAtStartup(false)).toBe(true);
  });

  it("stops being due once the notice has been shown", async () => {
    window.localStorage.setItem("plan-measure.preferences", "{}");
    const notice = await loadPage();
    expect(notice.noteSavedProjectsAtStartup(true)).toBe(true);
    notice.markShortcutsNoticeShown();
    expect(notice.noteSavedProjectsAtStartup(true)).toBe(false);
  });
});
