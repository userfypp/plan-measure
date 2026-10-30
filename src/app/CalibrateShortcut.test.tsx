/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeAuthoringCapability } from "../features/viewer/AuthoringCapability";
import { resetAppPreferences, setAppPreference } from "../utils/appPreferences";
import { CalibrateShortcut } from "./CalibrateShortcut";
import { WorkspaceDrawerProvider } from "./WorkspaceDrawerContext";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const capability = computeAuthoringCapability({
  viewerSize: { width: 768, height: 600 },
  rightObstruction: 0,
  bottomExclusion: 0,
  finePointer: true,
});

function render({
  disabled = false,
  onAddScale = vi.fn(),
  precisionActionAvailable = true,
  requestPrecisionAuthoring = (start: () => void) => {
    start();
    return true;
  },
}: {
  disabled?: boolean;
  onAddScale?: (mode: "uniform") => void;
  precisionActionAvailable?: boolean;
  requestPrecisionAuthoring?: (start: () => void) => boolean;
} = {}) {
  act(() =>
    root!.render(
      <WorkspaceDrawerProvider
        value={{
          isNarrow: false,
          narrowVersion: 0,
          open: false,
          close: () => undefined,
          currentCapability: capability,
          capabilityWithoutDrawer: capability,
          canRecoverAuthoringByClosingWorkspace: false,
          precisionActionAvailable,
          precisionDisabledReason: "Unavailable",
          requestPrecisionAuthoring,
        }}
      >
        <CalibrateShortcut disabled={disabled} onAddScale={onAddScale} />
      </WorkspaceDrawerProvider>,
    ),
  );
  return onAddScale;
}

function bindCalibrate(...combos: string[]) {
  act(() => setAppPreference("shortcutBindings", { "tool.calibrate": combos }));
}

function pressKey(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => document.body.dispatchEvent(event));
  return event;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetAppPreferences();
});

describe("CalibrateShortcut", () => {
  it("starts a Uniform scale and follows rebinding", () => {
    const onAddScale = render();
    bindCalibrate("B");

    expect(pressKey("b").defaultPrevented).toBe(true);
    expect(onAddScale).toHaveBeenCalledExactlyOnceWith("uniform");

    bindCalibrate("G");
    expect(pressKey("b").defaultPrevented).toBe(false);
    pressKey("g");
    expect(onAddScale).toHaveBeenCalledTimes(2);
  });

  it("is unbound by default", () => {
    const onAddScale = render();
    expect(pressKey("b").defaultPrevented).toBe(false);
    expect(onAddScale).not.toHaveBeenCalled();
  });

  it("acts on the latest props, so a running workflow blocks it", () => {
    bindCalibrate("B");
    const first = render();
    const second = render({ disabled: true });

    expect(pressKey("b").defaultPrevented).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    const third = render();
    pressKey("b");
    expect(third).toHaveBeenCalledExactlyOnceWith("uniform");
    expect(first).not.toHaveBeenCalled();
  });

  it("does nothing when precision is unavailable or an overlay is open", () => {
    bindCalibrate("B");
    const unavailable = render({ precisionActionAvailable: false });
    expect(pressKey("b").defaultPrevented).toBe(false);

    const onAddScale = render();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    expect(pressKey("b").defaultPrevented).toBe(false);
    dialog.remove();

    expect(unavailable).not.toHaveBeenCalled();
    expect(onAddScale).not.toHaveBeenCalled();
  });

  it("goes through the shared recoverable-authoring handoff", () => {
    bindCalibrate("B");
    const pending: Array<() => void> = [];
    const onAddScale = render({
      requestPrecisionAuthoring: (start) => {
        pending.push(start);
        return true;
      },
    });

    expect(pressKey("b").defaultPrevented).toBe(true);
    expect(onAddScale).not.toHaveBeenCalled();
    pending.forEach((start) => start());
    expect(onAddScale).toHaveBeenCalledExactlyOnceWith("uniform");
  });

  it("leaves the key alone when the handoff refuses it", () => {
    bindCalibrate("B");
    render({ requestPrecisionAuthoring: () => false });
    expect(pressKey("b").defaultPrevented).toBe(false);
  });
});
