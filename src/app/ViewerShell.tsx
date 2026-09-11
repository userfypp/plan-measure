import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ViewerNavigationProvider,
  type ViewerNavigationModel,
} from "../features/viewer/ViewerNavigation";
import { ViewerInteractionCommandsProvider } from "../features/viewer/ViewerInteractionCommands";
import { ViewerBottomExclusionProvider } from "../features/viewer/viewerLayout";
import {
  AuthoringCapabilityProvider,
  computeAuthoringCapability,
  useFinePointerAvailable,
  type AuthoringCapability,
} from "../features/viewer/AuthoringCapability";
import { ViewerDockContainer } from "./ViewerDockContainer";
import styles from "./ViewerShell.module.css";

interface ViewerShellProps {
  children?: ReactNode;
  toolRail?: ReactNode;
  contextToolbar?: ReactNode;
  rightObstruction?: number;
  onAuthoringCapabilityChange?: (
    capability: AuthoringCapability,
    capabilityWithoutRightObstruction: AuthoringCapability,
  ) => void;
}

export function ViewerShell({
  children,
  toolRail,
  contextToolbar,
  rightObstruction = 0,
  onAuthoringCapabilityChange,
}: ViewerShellProps) {
  const [navigation, setNavigation] = useState<
    Pick<ViewerNavigationModel, "pageNumber" | "pageCount" | "zoom"> | null
  >(null);
  const [dockBottomExclusion, setDockBottomExclusion] = useState(0);
  const [viewerFrameSize, setViewerFrameSize] = useState({ width: 0, height: 0 });
  const navigationActionsRef = useRef<
    Pick<ViewerNavigationModel, "onPageChange" | "onZoomIn" | "onZoomOut" | "onFit"> | null
  >(null);
  const viewerFrameRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const finePointer = useFinePointerAvailable();
  const registerNavigation = useCallback((next: ViewerNavigationModel) => {
    navigationActionsRef.current = {
      onPageChange: next.onPageChange,
      onZoomIn: next.onZoomIn,
      onZoomOut: next.onZoomOut,
      onFit: next.onFit,
    };
    setNavigation((current) =>
      current &&
      current.pageNumber === next.pageNumber &&
      current.pageCount === next.pageCount &&
      current.zoom === next.zoom
        ? current
        : { pageNumber: next.pageNumber, pageCount: next.pageCount, zoom: next.zoom },
    );
  }, []);

  const showDock = Boolean(navigation);

  useLayoutEffect(() => {
    const frame = viewerFrameRef.current;
    if (!frame) return;

    const updateGeometry = () => {
      const frameRect = frame.getBoundingClientRect();
      setViewerFrameSize((current) =>
        Math.abs(current.width - frameRect.width) < 0.5 &&
        Math.abs(current.height - frameRect.height) < 0.5
          ? current
          : { width: frameRect.width, height: frameRect.height },
      );
      const dock = dockRef.current;
      const nextExclusion = dock
        ? Math.max(0, frameRect.bottom - dock.getBoundingClientRect().top)
        : 0;
      setDockBottomExclusion((current) =>
        Math.abs(current - nextExclusion) < 0.5 ? current : nextExclusion,
      );
    };

    updateGeometry();
    const initialFrame = window.requestAnimationFrame(updateGeometry);
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(frame);
    const dock = dockRef.current;
    if (dock) observer.observe(dock);
    window.addEventListener("resize", updateGeometry);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      observer.disconnect();
      window.removeEventListener("resize", updateGeometry);
    };
  }, [showDock]);

  const authoringCapability = useMemo(
    () =>
      computeAuthoringCapability({
        viewerSize: viewerFrameSize,
        rightObstruction,
        bottomExclusion: dockBottomExclusion,
        finePointer,
      }),
    [dockBottomExclusion, finePointer, rightObstruction, viewerFrameSize],
  );
  const authoringCapabilityWithoutRightObstruction = useMemo(
    () =>
      computeAuthoringCapability({
        viewerSize: viewerFrameSize,
        rightObstruction: 0,
        bottomExclusion: dockBottomExclusion,
        finePointer,
      }),
    [dockBottomExclusion, finePointer, viewerFrameSize],
  );
  const viewerFrameStyle = {
    "--viewer-right-obstruction": `${authoringCapability.rightObstruction}px`,
    "--viewer-dock-bottom-exclusion": `${dockBottomExclusion}px`,
  } as CSSProperties;

  useLayoutEffect(() => {
    onAuthoringCapabilityChange?.(
      authoringCapability,
      authoringCapabilityWithoutRightObstruction,
    );
  }, [
    authoringCapability,
    authoringCapabilityWithoutRightObstruction,
    onAuthoringCapabilityChange,
  ]);

  return (
    <section className={styles.viewerShell} aria-label="PDF viewer" data-layout-slot="viewer">
      <ViewerInteractionCommandsProvider>
        <AuthoringCapabilityProvider capability={authoringCapability}>
          <div
            className={styles.viewerFrame}
            ref={viewerFrameRef}
            style={viewerFrameStyle}
            data-authoring-capability={
              authoringCapability.measured
                ? authoringCapability.available
                  ? "available"
                  : "gated"
                : "measuring"
            }
            data-usable-width={Math.round(authoringCapability.usableSize.width)}
            data-usable-height={Math.round(authoringCapability.usableSize.height)}
          >
            {toolRail}
            {contextToolbar}
            {authoringCapability.measured && !authoringCapability.available && (
              <div className={styles.authoringNotice} role="status">
                {authoringCapability.unavailableReason}
              </div>
            )}
            <ViewerBottomExclusionProvider bottomExclusion={dockBottomExclusion}>
              <ViewerNavigationProvider registerNavigation={registerNavigation}>
                <div className={styles.viewerSurface}>{children}</div>
              </ViewerNavigationProvider>
            </ViewerBottomExclusionProvider>
            {navigation && (
              <div className={styles.dock} ref={dockRef}>
                <ViewerDockContainer
                  navigation={{
                    ...navigation,
                    onPageChange: (pageNumber) =>
                      navigationActionsRef.current?.onPageChange(pageNumber),
                    onZoomIn: () => navigationActionsRef.current?.onZoomIn(),
                    onZoomOut: () => navigationActionsRef.current?.onZoomOut(),
                    onFit: () => navigationActionsRef.current?.onFit(),
                  }}
                />
              </div>
            )}
          </div>
        </AuthoringCapabilityProvider>
      </ViewerInteractionCommandsProvider>
    </section>
  );
}
