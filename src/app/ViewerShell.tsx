import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ViewerNavigationProvider,
  type ViewerNavigationModel,
} from "../features/viewer/ViewerNavigation";
import { ViewerBottomExclusionProvider } from "../features/viewer/viewerLayout";
import { ViewerDockContainer } from "./ViewerDockContainer";
import styles from "./ViewerShell.module.css";

interface ViewerShellProps {
  children?: ReactNode;
  contextBar?: ReactNode;
}

export function ViewerShell({ children, contextBar }: ViewerShellProps) {
  const [navigation, setNavigation] = useState<
    Pick<ViewerNavigationModel, "pageNumber" | "pageCount" | "zoom"> | null
  >(null);
  const [dockBottomExclusion, setDockBottomExclusion] = useState(0);
  const navigationActionsRef = useRef<
    Pick<ViewerNavigationModel, "onPageChange" | "onZoomIn" | "onZoomOut" | "onFit"> | null
  >(null);
  const viewerFrameRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
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
    if (!showDock) return;
    const frame = viewerFrameRef.current;
    const dock = dockRef.current;
    if (!frame || !dock) return;

    const updateExclusion = () => {
      const frameRect = frame.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      const nextExclusion = Math.max(0, frameRect.bottom - dockRect.top);
      setDockBottomExclusion((current) =>
        Math.abs(current - nextExclusion) < 0.5 ? current : nextExclusion,
      );
    };

    const initialFrame = window.requestAnimationFrame(updateExclusion);
    const observer = new ResizeObserver(updateExclusion);
    observer.observe(frame);
    observer.observe(dock);
    window.addEventListener("resize", updateExclusion);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      observer.disconnect();
      window.removeEventListener("resize", updateExclusion);
    };
  }, [showDock]);

  return (
    <section className={styles.viewerShell} aria-label="PDF viewer" data-layout-slot="viewer">
      <div className={styles.contextBar}>{contextBar}</div>
      <div className={styles.viewerFrame} ref={viewerFrameRef}>
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
    </section>
  );
}
