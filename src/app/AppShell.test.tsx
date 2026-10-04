/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { AppProvider, useAppState } from "./state";

vi.mock("./AppBar", () => ({ AppBar: () => <header>Application bar</header> }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function render(message: string | null, onDismiss?: () => void, actions?: ReactNode) {
  act(() => root.render(
    <AppShell
      documentName={null}
      canExport={false}
      onExport={() => undefined}
      statusMessage={message}
      onDismissStatus={onDismiss}
      statusActions={actions}
    >
      <main>Workspace</main>
    </AppShell>,
  ));
}

function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

function ErrorStackHarness() {
  const { state, setError, clearError, dismissError } = useAppState();
  return (
    <>
      <button data-error="First" onClick={() => setError("First")}>First error</button>
      <button data-error="Second" onClick={() => setError("Second")}>Second error</button>
      <button data-clear onClick={clearError}>Successful action</button>
      <AppShell
        documentName={null}
        canExport={false}
        onExport={() => undefined}
        errorNotifications={state.errorNotifications}
        onDismissError={dismissError}
        statusMessage="Autosave is unavailable."
        statusTone="warning"
        statusActions={<button>Retry saving</button>}
      >
        <main>Workspace</main>
      </AppShell>
    </>
  );
}

function renderStack() {
  act(() => root.render(<AppProvider><ErrorStackHarness /></AppProvider>));
}

function triggerError(message: string) {
  act(() => container.querySelector<HTMLButtonElement>(`[data-error="${message}"]`)!.click());
}

function messages() {
  return Array.from(container.querySelectorAll('[role="alert"] > span'), (span) => span.textContent);
}

describe("AppShell notifications", () => {
  it("stacks errors with independent expiry while keeping autosave recovery visible", () => {
    renderStack();
    triggerError("First");
    advance(2000);
    triggerError("Second");
    expect(messages()).toEqual(["Autosave is unavailable.", "First", "Second"]);
    advance(6000);
    expect(messages()).toEqual(["Autosave is unavailable.", "Second"]);
    advance(1999);
    expect(messages()).toContain("Second");
    advance(1);
    expect(messages()).toEqual(["Autosave is unavailable."]);
  });

  it("keeps repeated errors as separate notices and dismisses only the chosen one", () => {
    renderStack();
    triggerError("First");
    triggerError("First");
    triggerError("Second");
    act(() => container.querySelector<HTMLButtonElement>('[data-clear]')!.click());
    expect(messages()).toEqual(["Autosave is unavailable.", "First", "First", "Second"]);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss message"]')!.click());
    expect(messages()).toEqual(["Autosave is unavailable.", "First", "Second"]);
    advance(8000);
    expect(messages()).toEqual(["Autosave is unavailable."]);
  });

  it("pauses only the notice under interaction", () => {
    renderStack();
    triggerError("First");
    triggerError("Second");
    const second = container.querySelectorAll('[role="alert"]')[2]!;
    act(() => second.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    advance(8000);
    expect(messages()).toEqual(["Autosave is unavailable.", "Second"]);
    act(() => second.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    advance(8000);
    expect(messages()).toEqual(["Autosave is unavailable."]);
  });

  it("dismisses a transient message after eight seconds", () => {
    const dismiss = vi.fn(() => render(null));
    render("Select a valid scale.", dismiss);
    advance(7999);
    expect(dismiss).not.toHaveBeenCalled();
    advance(1);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("gives a new message a full timeout and cancels the previous timer", () => {
    const dismiss = vi.fn();
    render("First error", dismiss);
    advance(7000);
    render("Second error", dismiss);
    advance(1000);
    expect(dismiss).not.toHaveBeenCalled();
    advance(7000);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("pauses dismissal while the mouse is over the notice", () => {
    const dismiss = vi.fn();
    render("Error", dismiss);
    const alert = container.querySelector('[role="alert"]')!;
    advance(7000);
    act(() => alert.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    advance(10000);
    expect(dismiss).not.toHaveBeenCalled();
    act(() => alert.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    advance(8000);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("pauses dismissal during keyboard interaction and preserves manual dismissal", () => {
    const dismiss = vi.fn();
    render("Error", dismiss);
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Dismiss message"]')!;
    act(() => button.focus());
    advance(10000);
    expect(dismiss).not.toHaveBeenCalled();
    act(() => button.blur());
    advance(7999);
    expect(dismiss).not.toHaveBeenCalled();
    act(() => button.click());
    expect(dismiss).toHaveBeenCalledOnce();
    render(null);
    advance(10000);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("keeps persistent warnings and their recovery actions available", () => {
    const retry = vi.fn();
    render("Autosave is unavailable.", undefined, <button onClick={retry}>Retry saving</button>);
    advance(60000);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Autosave");
    expect(container.querySelector('[aria-label="Dismiss message"]')).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
