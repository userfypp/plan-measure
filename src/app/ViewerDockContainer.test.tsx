// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ViewerNavigationModel } from "../features/viewer/ViewerNavigation";
import { stubMatchMedia } from "../test/domTestUtils";
import { SessionProvider } from "./sessionState";
import { AppProvider } from "./state";
import { ViewerDockContainer } from "./ViewerDockContainer";
import { WorkspaceProvider } from "./workspaceState";

let root: Root;
let container: HTMLDivElement;

const navigation: ViewerNavigationModel = {
  pageNumber: 1,
  pageCount: 1,
  zoom: 1,
  onPageChange: vi.fn(),
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onFit: vi.fn(),
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("renders nothing without a session", async () => {
  await act(async () =>
    root.render(
      <AppProvider>
        <SessionProvider>
          <WorkspaceProvider>
            <ViewerDockContainer
              navigation={navigation}
              sourcePageLabels={null}
              logicalPageBounds={null}
            />
          </WorkspaceProvider>
        </SessionProvider>
      </AppProvider>,
    ),
  );
  expect(container.innerHTML).toBe("");
});
