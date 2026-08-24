import { createContext, useContext, type ReactNode } from "react";
import { Button } from "../../components/ui";
import styles from "./ViewerNavigation.module.css";

export interface ViewerNavigationModel {
  pageNumber: number;
  pageCount: number;
  zoom: number;
  onPageChange: (pageNumber: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export type ViewerNavigationRegistration = (navigation: ViewerNavigationModel) => void;

const ViewerNavigationContext = createContext<ViewerNavigationRegistration | null>(null);

export function ViewerNavigationProvider({
  registerNavigation,
  children,
}: {
  registerNavigation: ViewerNavigationRegistration;
  children: ReactNode;
}) {
  return (
    <ViewerNavigationContext.Provider value={registerNavigation}>
      {children}
    </ViewerNavigationContext.Provider>
  );
}

export function useViewerNavigationRegistration(): ViewerNavigationRegistration | null {
  return useContext(ViewerNavigationContext);
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h14" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h14M12 5v14" />
    </svg>
  );
}

export function ViewerNavigation({
  pageNumber,
  pageCount,
  zoom,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onFit,
}: ViewerNavigationModel) {
  return (
    <nav className={styles.navigation} aria-label="PDF page and zoom controls">
      <Button variant="secondary" size="compact" onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1}>
        Previous
      </Button>
      <span>
        Page {pageNumber} of {pageCount}
      </span>
      <Button
        variant="secondary"
        size="compact"
        onClick={() => onPageChange(pageNumber + 1)}
        disabled={pageNumber >= pageCount}
      >
        Next
      </Button>
      <span className={styles.separator} aria-hidden="true" />
      <Button variant="secondary" size="compact" className={styles.iconButton} aria-label="Zoom out" aria-keyshortcuts="-" title="Zoom out" onClick={onZoomOut}>
        <ZoomOutIcon />
      </Button>
      <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
      <Button variant="secondary" size="compact" className={styles.iconButton} aria-label="Zoom in" aria-keyshortcuts="+" title="Zoom in" onClick={onZoomIn}>
        <ZoomInIcon />
      </Button>
      <Button variant="secondary" size="compact" onClick={onFit}>
        Fit to screen
      </Button>
    </nav>
  );
}
