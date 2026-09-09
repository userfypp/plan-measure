import { createContext, useContext, type ReactNode } from "react";

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
