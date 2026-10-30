import { vi } from "vitest";

const DIALOG_METHODS = ["show", "showModal", "close"] as const;

/**
 * jsdom has no `show()`, `showModal()` or `close()` on `<dialog>`. These stand-ins toggle `open`
 * and, like a browser, fire `close` only when an open dialog closes. Call it in `beforeEach` and
 * the returned function in `afterEach`, after unmounting, to put back what was there before.
 */
export function stubDialogMethods(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const saved = DIALOG_METHODS.map(
    (name) => [name, Object.getOwnPropertyDescriptor(prototype, name)] as const,
  );
  function open(this: HTMLDialogElement) {
    this.open = true;
  }
  Object.defineProperty(prototype, "show", { configurable: true, value: open });
  Object.defineProperty(prototype, "showModal", { configurable: true, value: open });
  Object.defineProperty(prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  return () => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else Reflect.deleteProperty(prototype, name);
    }
  };
}

/**
 * Replaces `matchMedia` for the current test; `unstubGlobals` in the Vitest config puts it back.
 * A query matches when `matches(query)` returns true. Listeners are accepted but never called.
 */
export function stubMatchMedia(matches: (query: string) => boolean = () => false): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(
      (query: string) =>
        ({
          media: query,
          matches: matches(query),
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
        }) as MediaQueryList,
    ),
  );
}
