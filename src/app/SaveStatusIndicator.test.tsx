// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { createSaveStatusStore, SAVE_STATUS_TEXT, type SaveState } from "./saveStatus";
import { SessionProvider, useMeasurementCommands } from "./sessionState";
import { AppProvider } from "./state";
import { ThemeProvider } from "./themeState";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("save status and backups", () => {
  it.each(["saving", "saved", "failed", "conflict", "repair-required", "unavailable"] as const)(
    "renders %s as visible text with a polite status region",
    (state) => {
      const store = createSaveStatusStore();
      store.set(state);
      act(() =>
        root.render(
          <SaveStatusIndicator
            store={store}
            pending={false}
            canRetry={false}
            onExport={vi.fn()}
            onRetry={vi.fn()}
            onReload={vi.fn()}
          />,
        ),
      );
      expect(container.querySelector("button")!.textContent).toBe(SAVE_STATUS_TEXT[state]);
      expect(container.querySelector('[role="status"]')!.getAttribute("aria-live")).toBe("polite");
      act(() => container.querySelector("button")!.click());
      const details = document.querySelector('[role="dialog"]')!;
      expect(details.querySelector("h2")!.textContent).toBe("Local autosave");
      expect(details.textContent).toContain("only in this browser");
      expect(details.textContent).toContain("Clearing site data removes saved projects");
      expect(details.textContent).toContain("PDF and editable project data");
      if (state === "unavailable")
        expect(details.textContent).toContain("Browser recovery is unavailable");
    },
  );

  it("announces problems and recovery without announcing routine autosaves", () => {
    const store = createSaveStatusStore();
    act(() =>
      root.render(
        <SaveStatusIndicator
          store={store}
          pending={false}
          canRetry={false}
          onExport={vi.fn()}
          onRetry={vi.fn()}
          onReload={vi.fn()}
        />,
      ),
    );
    const status = () => container.querySelector('[role="status"]')!.textContent;
    for (const state of ["saving", "saved", "saving", "saved"] as SaveState[])
      act(() => store.set(state));
    expect(status()).toBe("");
    act(() => store.set("failed"));
    expect(status()).toBe("Couldn't save");
    act(() => store.set("saving"));
    expect(status()).toBe("Couldn't save");
    act(() => store.set("saved"));
    expect(status()).toBe("Saving recovered. Saved on this device.");
    act(() => store.set("saving"));
    act(() => store.set("saved"));
    expect(status()).toBe("Saving recovered. Saved on this device.");
  });

  it("keeps instant saves readable without delaying the confirmed state or flickering", () => {
    vi.useFakeTimers();
    const store = createSaveStatusStore();
    store.set("saved");
    act(() =>
      root.render(
        <SaveStatusIndicator
          store={store}
          pending={false}
          canRetry={false}
          onExport={vi.fn()}
          onRetry={vi.fn()}
          onReload={vi.fn()}
        />,
      ),
    );
    act(() => store.set("saving"));
    act(() => store.set("saved"));
    expect(store.getSnapshot().state).toBe("saved");
    expect(container.querySelector("button")!.textContent).toBe("Saving…");
    act(() => vi.advanceTimersByTime(499));
    expect(container.querySelector("button")!.textContent).toBe("Saving…");
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector("button")!.textContent).toBe("Saved on this device");
  });

  it("provides keyboard access, backup, retry and the existing reload confirmation callback", () => {
    const store = createSaveStatusStore();
    store.set("conflict");
    const onExport = vi.fn(),
      onRetry = vi.fn(),
      onReload = vi.fn();
    act(() =>
      root.render(
        <SaveStatusIndicator
          store={store}
          pending={false}
          canRetry={true}
          onExport={onExport}
          onRetry={onRetry}
          onReload={onReload}
        />,
      ),
    );
    const trigger = container.querySelector("button")!;
    act(() => {
      trigger.focus();
      trigger.click();
    });
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    );
    expect(document.activeElement).toBe(buttons[0]);
    const button = (label: string) => buttons.find((candidate) => candidate.textContent === label)!;
    act(() => button("Retry saving").click());
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onExport).not.toHaveBeenCalled();
    act(() => button("Reload saved projects").click());
    expect(onReload).toHaveBeenCalledOnce();
    act(() => button("Export backup (.planmeasure)").click());
    expect(onExport).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onReload).toHaveBeenCalledOnce();
    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("disables actions during project operations", () => {
    const store = createSaveStatusStore();
    store.set("failed");
    act(() =>
      root.render(
        <SaveStatusIndicator
          store={store}
          pending={true}
          canRetry={true}
          onExport={vi.fn()}
          onRetry={vi.fn()}
          onReload={vi.fn()}
        />,
      ),
    );
    act(() => container.querySelector("button")!.click());
    for (const button of document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      expect(button.disabled).toBe(true);
  });

  it("keeps shape command consumers and the panel isolated from every save update", () => {
    const store = createSaveStatusStore();
    let shapeRenders = 0,
      panelRenders = 0;
    function Shape() {
      useMeasurementCommands();
      shapeRenders++;
      return null;
    }
    function Panel() {
      panelRenders++;
      return null;
    }
    act(() =>
      root.render(
        <ThemeProvider>
          <AppProvider>
            <SessionProvider>
              <AppShell
                documentName="plan.pdf"
                canExport
                onExport={vi.fn()}
                saveStatus={
                  <SaveStatusIndicator
                    store={store}
                    pending={false}
                    canRetry={false}
                    onExport={vi.fn()}
                    onRetry={vi.fn()}
                    onReload={vi.fn()}
                  />
                }
              >
                <Shape />
                <Panel />
              </AppShell>
            </SessionProvider>
          </AppProvider>
        </ThemeProvider>,
      ),
    );
    for (const state of [
      "saving",
      "saved",
      "failed",
      "repair-required",
      "conflict",
      "unavailable",
      "saved",
    ] as SaveState[])
      act(() => store.set(state));
    expect(shapeRenders).toBe(1);
    expect(panelRenders).toBe(1);
    expect(container.querySelector('header [role="status"]')).not.toBeNull();
  });
});
