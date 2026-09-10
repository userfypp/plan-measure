import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEventHandler,
  type ReactNode,
} from "react";
import { Button } from "../components/ui";
import type { AuthoringCapability } from "../features/viewer/AuthoringCapability";
import { ViewerShell } from "./ViewerShell";
import {
  responsiveModeForWidth,
  workspaceGeometry,
  type ResponsiveMode,
} from "./responsiveLayout";
import { WorkspaceDrawerProvider } from "./WorkspaceDrawerContext";
import styles from "./WorkspaceShell.module.css";

const WORKSPACE_DRAWER_ID = "workspace-drawer";

function WorkspaceIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="3" y="3.5" width="14" height="13" rx="1" />
      <path d="M7.2 3.5v13M9.8 7h4M9.8 10h4M9.8 13h4" />
    </svg>
  );
}

interface WorkspaceShellProps {
  isEmpty?: boolean;
  dragActive: boolean;
  onDragEnter: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
  workspacePanel?: ReactNode;
  toolRail?: ReactNode;
  contextToolbar?: ReactNode;
  viewer?: ReactNode;
  emptyState?: ReactNode;
  dropOverlay?: ReactNode;
  onAuthoringCapabilityChange?: (capability: AuthoringCapability) => void;
  authoringIntentScopeKey?: string | number;
}

export function WorkspaceShell({
  isEmpty = false,
  dragActive,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  workspacePanel,
  toolRail,
  contextToolbar,
  viewer,
  emptyState,
  dropOverlay = "Drop PDF to replace current session",
  onAuthoringCapabilityChange,
  authoringIntentScopeKey = "default",
}: WorkspaceShellProps) {
  const workspaceRef = useRef<HTMLElement>(null);
  const workspacePanelRef = useRef<HTMLDivElement>(null);
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusOnCloseRef = useRef(false);
  const workspaceLauncherFocusedRef = useRef(false);
  const [responsiveMode, setResponsiveMode] = useState<ResponsiveMode>(() =>
    responsiveModeForWidth(typeof window === "undefined" ? 0 : window.innerWidth),
  );
  const responsiveModeRef = useRef(responsiveMode);
  const [narrowVersion, setNarrowVersion] = useState(responsiveMode === "narrow" ? 1 : 0);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [capabilitySnapshot, setCapabilitySnapshot] = useState<{
    current: AuthoringCapability;
    withoutDrawer: AuthoringCapability;
  } | null>(null);
  const pendingAuthoringIntentRef = useRef<{
    start: () => void;
    scopeKey: string | number;
  } | null>(null);
  const isNarrow = responsiveMode === "narrow";
  const previousIsNarrowRef = useRef(isNarrow);
  const geometry = workspaceGeometry(responsiveMode, workspaceDrawerOpen);
  const currentCapability = capabilitySnapshot?.current ?? null;
  const capabilityWithoutDrawer = capabilitySnapshot?.withoutDrawer ?? null;
  const canRecoverAuthoringByClosingWorkspace = Boolean(
    isNarrow &&
      workspaceDrawerOpen &&
      currentCapability?.measured &&
      !currentCapability.available &&
      capabilityWithoutDrawer?.available,
  );
  const precisionActionAvailable = Boolean(
    currentCapability?.available || canRecoverAuthoringByClosingWorkspace,
  );
  const precisionDisabledReason =
    currentCapability?.unavailableReason ??
    "Precision drawing and editing need more unobscured viewer space and a fine pointer.";

  const closeWorkspaceDrawer = useCallback((returnFocus = true) => {
    returnFocusOnCloseRef.current = returnFocus;
    setWorkspaceDrawerOpen(false);
  }, []);

  function requestPrecisionAuthoring(start: () => void) {
    if (capabilitySnapshot?.current.available) {
      start();
      return true;
    }
    if (!canRecoverAuthoringByClosingWorkspace || pendingAuthoringIntentRef.current) {
      return false;
    }
    pendingAuthoringIntentRef.current = { start, scopeKey: authoringIntentScopeKey };
    closeWorkspaceDrawer(true);
    return true;
  }

  useLayoutEffect(() => {
    const pending = pendingAuthoringIntentRef.current;
    if (!pending) return;
    if (pending.scopeKey !== authoringIntentScopeKey) {
      pendingAuthoringIntentRef.current = null;
      return;
    }
    if (workspaceDrawerOpen) return;
    const current = capabilitySnapshot?.current;
    if (!current || !current.measured || current.rightObstruction > 0) return;
    pendingAuthoringIntentRef.current = null;
    if (current.available) pending.start();
  }, [authoringIntentScopeKey, capabilitySnapshot, workspaceDrawerOpen]);

  useLayoutEffect(() => {
    const pending = pendingAuthoringIntentRef.current;
    if (pending && pending.scopeKey !== authoringIntentScopeKey) {
      pendingAuthoringIntentRef.current = null;
    }
  }, [authoringIntentScopeKey]);

  const handleAuthoringCapabilityChange = useCallback(
    (
      current: AuthoringCapability,
      withoutRightObstruction: AuthoringCapability,
    ) => {
      setCapabilitySnapshot((previous) =>
        previous?.current === current && previous.withoutDrawer === withoutRightObstruction
          ? previous
          : { current, withoutDrawer: withoutRightObstruction },
      );
      onAuthoringCapabilityChange?.(current);
    },
    [onAuthoringCapabilityChange],
  );

  useLayoutEffect(() => {
    if (!isNarrow || workspaceDrawerOpen || !returnFocusOnCloseRef.current) return;
    returnFocusOnCloseRef.current = false;
    workspaceTriggerRef.current?.focus({ preventScroll: true });
  }, [isNarrow, workspaceDrawerOpen]);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const updateMode = (width: number) => {
      const next = responsiveModeForWidth(width);
      if (responsiveModeRef.current === next) return;
      if (next === "narrow") setNarrowVersion((current) => current + 1);
      responsiveModeRef.current = next;
      if (next !== "narrow") setWorkspaceDrawerOpen(false);
      setResponsiveMode(next);
    };
    updateMode(workspace.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateMode(entry.contentRect.width);
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const wasNarrow = previousIsNarrowRef.current;
    previousIsNarrowRef.current = isNarrow;
    if (wasNarrow === isNarrow) return;

    if (isNarrow) {
      if (workspaceDrawerOpen) return;
      const active = document.activeElement;
      if (active && workspacePanelRef.current?.contains(active)) {
        workspaceTriggerRef.current?.focus({ preventScroll: true });
      }
      return;
    }

    if (workspaceLauncherFocusedRef.current) {
      workspaceLauncherFocusedRef.current = false;
      workspacePanelRef.current
        ?.querySelector<HTMLElement>('button[aria-label^="Workspace module:"]')
        ?.focus({ preventScroll: true });
    }
  }, [isNarrow, workspaceDrawerOpen]);

  useEffect(() => {
    if (!isNarrow || !workspaceDrawerOpen) return;

    const focusWorkspace = window.requestAnimationFrame(() => {
      const firstControl = workspacePanelRef.current?.querySelector<HTMLElement>(
        'button[aria-label^="Workspace module:"]',
      );
      firstControl?.focus({ preventScroll: true });
    });
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeWorkspaceDrawer(true);
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (workspacePanelRef.current?.contains(target) || workspaceTriggerRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('[role="menu"], [role="dialog"]')) return;
      closeWorkspaceDrawer(false);
    };
    window.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      window.cancelAnimationFrame(focusWorkspace);
      window.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [closeWorkspaceDrawer, isNarrow, workspaceDrawerOpen]);

  const dropZoneProps = {
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  };

  if (isEmpty) {
    return (
      <main
        ref={workspaceRef}
        className={`${styles.emptyState} ${dragActive ? styles.dragActive : ""}`}
        data-responsive-mode={responsiveMode}
        {...dropZoneProps}
      >
        {emptyState}
      </main>
    );
  }

  return (
    <main
      ref={workspaceRef}
      className={`${styles.workspace} ${dragActive ? styles.dragActive : ""}`}
      data-responsive-mode={responsiveMode}
      data-workspace-drawer-open={isNarrow ? workspaceDrawerOpen : undefined}
      {...dropZoneProps}
    >
      <WorkspaceDrawerProvider
        value={{
          isNarrow,
          narrowVersion,
          open: workspaceDrawerOpen,
          close: closeWorkspaceDrawer,
          currentCapability,
          capabilityWithoutDrawer,
          canRecoverAuthoringByClosingWorkspace,
          precisionActionAvailable,
          precisionDisabledReason,
          requestPrecisionAuthoring,
        }}
      >
        <div
          ref={workspacePanelRef}
          id={WORKSPACE_DRAWER_ID}
          className={styles.workspacePanel}
          data-layout-slot="workspace-panel-host"
          data-presentation={isNarrow ? "drawer" : "docked"}
          hidden={isNarrow && !workspaceDrawerOpen}
        >
          {workspacePanel}
        </div>
        <ViewerShell
          toolRail={toolRail}
          contextToolbar={contextToolbar}
          rightObstruction={geometry.rightObstruction}
          onAuthoringCapabilityChange={handleAuthoringCapabilityChange}
        >
          {viewer}
        </ViewerShell>
        {isNarrow && (
          <button
            ref={workspaceTriggerRef}
            type="button"
            className={styles.workspaceLauncher}
            aria-label={workspaceDrawerOpen ? "Workspace open" : "Open workspace"}
            aria-controls={WORKSPACE_DRAWER_ID}
            aria-expanded={workspaceDrawerOpen}
            hidden={workspaceDrawerOpen}
            title="Workspace"
            onFocus={() => {
              workspaceLauncherFocusedRef.current = true;
            }}
            onBlur={() => {
              workspaceLauncherFocusedRef.current = false;
            }}
            onClick={() => {
              if (workspaceDrawerOpen) closeWorkspaceDrawer(true);
              else setWorkspaceDrawerOpen(true);
            }}
          >
            <WorkspaceIcon />
          </button>
        )}
        {dragActive && <div className={styles.dropOverlay}>{dropOverlay}</div>}
      </WorkspaceDrawerProvider>
    </main>
  );
}

export function EmptyWorkspaceState({ onOpenPdf }: { onOpenPdf: () => void }) {
  return (
    <div className={styles.dropCard}>
      <div className={styles.documentMark} aria-hidden="true">
        PDF
      </div>
      <h1>Drop a PDF here</h1>
      <p>or</p>
      <Button onClick={onOpenPdf}>Open PDF</Button>
      <small>PDF files up to 100 MB · Your plan stays in this browser</small>
    </div>
  );
}
