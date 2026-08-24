import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  ViewerNavigation,
  ViewerNavigationProvider,
  type ViewerNavigationModel,
} from "../features/viewer/ViewerNavigation";
import styles from "./ViewerShell.module.css";

interface ViewerShellProps {
  children?: ReactNode;
  contextBar?: ReactNode;
}

export function ViewerShell({ children, contextBar }: ViewerShellProps) {
  const [navigation, setNavigation] = useState<
    Pick<ViewerNavigationModel, "pageNumber" | "pageCount" | "zoom"> | null
  >(null);
  const navigationActionsRef = useRef<
    Pick<ViewerNavigationModel, "onPageChange" | "onZoomIn" | "onZoomOut" | "onFit"> | null
  >(null);
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

  return (
    <section className={styles.viewerShell} aria-label="PDF viewer" data-layout-slot="viewer">
      <div className={styles.contextBar}>{contextBar}</div>
      <ViewerNavigationProvider registerNavigation={registerNavigation}>
        <div className={styles.viewerSurface}>{children}</div>
      </ViewerNavigationProvider>
      {navigation && (
        <div className={styles.navigation}>
          <ViewerNavigation
            {...navigation}
            onPageChange={(pageNumber) => navigationActionsRef.current?.onPageChange(pageNumber)}
            onZoomIn={() => navigationActionsRef.current?.onZoomIn()}
            onZoomOut={() => navigationActionsRef.current?.onZoomOut()}
            onFit={() => navigationActionsRef.current?.onFit()}
          />
        </div>
      )}
    </section>
  );
}
