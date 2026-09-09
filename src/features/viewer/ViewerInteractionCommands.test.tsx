/* @vitest-environment jsdom */

import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useViewerInteractionCommandRegistration,
  useViewerInteractionCommands,
  ViewerInteractionCommandsProvider,
} from "./ViewerInteractionCommands";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let completeCurrentDraft: (() => void) | null = null;

function CommandProbe() {
  const command = useViewerInteractionCommands().completeCurrentDraft;
  useLayoutEffect(() => {
    completeCurrentDraft = command;
    return () => {
      if (completeCurrentDraft === command) completeCurrentDraft = null;
    };
  }, [command]);
  return null;
}

function Registrar({ command }: { command: () => void }) {
  const register = useViewerInteractionCommandRegistration();
  useLayoutEffect(() => register?.({ completeCurrentDraft: command }), [command, register]);
  return null;
}

function render(command: () => void, secondCommand?: () => void) {
  act(() => {
    root!.render(
      <ViewerInteractionCommandsProvider>
        <CommandProbe />
        <Registrar key="first" command={command} />
        {secondCommand && <Registrar key="second" command={secondCommand} />}
      </ViewerInteractionCommandsProvider>,
    );
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  completeCurrentDraft = null;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  completeCurrentDraft = null;
  root = null;
  container = null;
});

describe("ViewerInteractionCommands", () => {
  it("forwards completion to the currently registered Viewer owner", () => {
    const command = vi.fn();
    render(command);
    act(() => completeCurrentDraft?.());
    expect(command).toHaveBeenCalledOnce();
  });

  it("does not let stale cleanup from an older owner clear the current registration", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(first, second);
    act(() => completeCurrentDraft?.());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();

    act(() => {
      root!.render(
        <ViewerInteractionCommandsProvider>
          <CommandProbe />
          <Registrar key="second" command={second} />
        </ViewerInteractionCommandsProvider>,
      );
    });
    act(() => completeCurrentDraft?.());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("becomes inert after the Viewer registration is removed", () => {
    const command = vi.fn();
    render(command);
    act(() => {
      root!.render(
        <ViewerInteractionCommandsProvider>
          <CommandProbe />
        </ViewerInteractionCommandsProvider>,
      );
    });
    act(() => completeCurrentDraft?.());
    expect(command).not.toHaveBeenCalled();
  });
});
