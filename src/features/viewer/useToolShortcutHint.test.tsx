/* @vitest-environment jsdom */

import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAppPreferences, setAppPreference } from "../../utils/appPreferences";
import type { ShortcutBindings } from "../../utils/shortcuts/bindings";
import { toolRailRegistry } from "./toolRegistry";
import { useToolShortcutHint } from "./useToolShortcutHint";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let renders = 0;

function Hint() {
  return <p>{useToolShortcutHint()}</p>;
}

function hint(): string | undefined {
  return container?.querySelector("p")?.textContent ?? undefined;
}

function bind(bindings: ShortcutBindings) {
  act(() => setAppPreference("shortcutBindings", bindings));
}

/** Every tool without a key, except the ones given. */
function onlyTools(keys: Record<string, string>): ShortcutBindings {
  return Object.fromEntries(
    toolRailRegistry.flatMap(({ actionId }) =>
      actionId ? [[actionId, actionId in keys ? [keys[actionId]!] : []]] : [],
    ),
  );
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  renders = 0;
  act(() =>
    root!.render(
      <Profiler id="hint" onRender={() => (renders += 1)}>
        <Hint />
      </Profiler>,
    ),
  );
});

afterEach(() => {
  resetAppPreferences();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("useToolShortcutHint", () => {
  it("lists the tool keys in rail order", () => {
    expect(hint()).toBe("Use V, H, L, M, P, R, I, K, or C to select a tool.");
  });

  it("reads naturally with two keys, one key and none", () => {
    bind(onlyTools({ "tool.select": "V", "tool.hand": "H" }));
    expect(hint()).toBe("Use V or H to select a tool.");
    bind(onlyTools({ "tool.cloud": "Q" }));
    expect(hint()).toBe("Use Q to select a tool.");
    bind(onlyTools({}));
    expect(hint()).toBe("");
  });

  it("does not re-render for changes that leave the text alone", () => {
    const before = renders;
    bind({ "view.zoomIn": ["Z"] });
    act(() => setAppPreference("tooltipDelay", "instant"));
    expect(renders).toBe(before);
    bind({ "tool.line": ["Q"] });
    expect(renders).toBe(before + 1);
  });
});
