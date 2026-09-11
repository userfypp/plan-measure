import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ViewerSize } from "./viewerLayout";

export const AUTHORING_MIN_USABLE_WIDTH = 480;
export const AUTHORING_MIN_USABLE_HEIGHT = 360;
export const FINE_POINTER_QUERY = "(any-pointer: fine)";

export interface AuthoringCapability {
  available: boolean;
  measured: boolean;
  finePointer: boolean;
  viewerSize: ViewerSize;
  usableSize: ViewerSize;
  rightObstruction: number;
  bottomExclusion: number;
  unavailableReason: string | null;
}

export function computeAuthoringCapability({
  viewerSize,
  rightObstruction,
  bottomExclusion,
  finePointer,
}: {
  viewerSize: ViewerSize;
  rightObstruction: number;
  bottomExclusion: number;
  finePointer: boolean;
}): AuthoringCapability {
  const width = Math.max(0, viewerSize.width);
  const height = Math.max(0, viewerSize.height);
  const obstruction = Math.min(width, Math.max(0, rightObstruction));
  const exclusion = Math.min(height, Math.max(0, bottomExclusion));
  const usableSize = {
    width: Math.max(0, width - obstruction),
    height: Math.max(0, height - exclusion),
  };
  const measured = width > 0 && height > 0;
  const widthAvailable = usableSize.width >= AUTHORING_MIN_USABLE_WIDTH;
  const heightAvailable = usableSize.height >= AUTHORING_MIN_USABLE_HEIGHT;
  const available = measured && finePointer && widthAvailable && heightAvailable;

  let unavailableReason: string | null = null;
  if (measured && !available) {
    if (!finePointer) {
      unavailableReason = "Precision drawing and editing require a fine pointer.";
    } else if (!widthAvailable && !heightAvailable) {
      unavailableReason =
        "Precision drawing and editing need at least 480 × 360 px of unobscured viewer space.";
    } else if (!widthAvailable) {
      unavailableReason =
        "Precision drawing and editing need at least 480 px of unobscured viewer width.";
    } else {
      unavailableReason =
        "Precision drawing and editing need at least 360 px of unobscured viewer height.";
    }
  }

  return {
    available,
    measured,
    finePointer,
    viewerSize: { width, height },
    usableSize,
    rightObstruction: obstruction,
    bottomExclusion: exclusion,
    unavailableReason,
  };
}

const DEFAULT_CAPABILITY: AuthoringCapability = {
  available: true,
  measured: false,
  finePointer: true,
  viewerSize: { width: 0, height: 0 },
  usableSize: { width: 0, height: 0 },
  rightObstruction: 0,
  bottomExclusion: 0,
  unavailableReason: null,
};

const AuthoringCapabilityContext = createContext<AuthoringCapability>(DEFAULT_CAPABILITY);

export function AuthoringCapabilityProvider({
  capability,
  children,
}: {
  capability: AuthoringCapability;
  children: ReactNode;
}) {
  return (
    <AuthoringCapabilityContext.Provider value={capability}>
      {children}
    </AuthoringCapabilityContext.Provider>
  );
}

export function useAuthoringCapability(): AuthoringCapability {
  return useContext(AuthoringCapabilityContext);
}

export function useFinePointerAvailable(): boolean {
  const media = useMemo(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(FINE_POINTER_QUERY)
        : null,
    [],
  );
  return useSyncExternalStore(
    (onStoreChange) => {
      if (!media) return () => undefined;
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => media?.matches ?? true,
    () => true,
  );
}
