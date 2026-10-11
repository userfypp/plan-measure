import { useEffect, useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Point } from "../../types/domain";
import { needsSoftwareCursor } from "./softwareCursor";

export function useSoftwareCursor({ viewerRef }: { viewerRef: RefObject<HTMLDivElement | null> }) {
  const softwareCursorRef = useRef<HTMLDivElement>(null);
  const softwarePointerRef = useRef<Point | null>(null);
  const softwareCursor = needsSoftwareCursor();
  const updateSoftwareCursor = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const cursorElement = softwareCursorRef.current;
    if (!cursorElement) return;
    if (event.pointerType === "touch" ||
      (event.target instanceof Element && event.target.closest("[data-keyboard-controls]"))) {
      softwarePointerRef.current = null;
      cursorElement.style.visibility = "hidden";
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
      softwarePointerRef.current = null;
      cursorElement.style.visibility = "hidden";
      return;
    }
    softwarePointerRef.current = { x: event.clientX, y: event.clientY };
    cursorElement.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    cursorElement.style.visibility = "visible";
  }, []);

  const hideSoftwareCursor = useCallback(() => {
    if (softwareCursorRef.current) softwareCursorRef.current.style.visibility = "hidden";
  }, []);

  const leaveSoftwareCursor = useCallback(() => {
    softwarePointerRef.current = null;
    hideSoftwareCursor();
  }, [hideSoftwareCursor]);

  const restoreSoftwareCursor = useCallback(() => {
    const viewer = viewerRef.current;
    const cursorElement = softwareCursorRef.current;
    const point = softwarePointerRef.current;
    if (!viewer || !cursorElement || !point) return;
    // A remembered position must still hit this viewer, not a dialog or toolbar.
    const hit = window.document.elementFromPoint(point.x, point.y);
    if (!hit || !viewer.contains(hit) || hit.closest("[data-keyboard-controls]") || !viewer.matches(":hover")) {
      hideSoftwareCursor();
      return;
    }
    const bounds = viewer.getBoundingClientRect();
    cursorElement.style.transform = `translate3d(${point.x - bounds.left}px, ${point.y - bounds.top}px, 0)`;
    cursorElement.style.visibility = "visible";
  }, [hideSoftwareCursor, viewerRef]);

  useEffect(() => {
    if (!softwareCursor) return;
    window.addEventListener("blur", hideSoftwareCursor);
    window.addEventListener("focus", restoreSoftwareCursor);
    window.document.addEventListener("focusin", restoreSoftwareCursor);
    const onVisibilityChange = () => {
      if (window.document.visibilityState === "hidden") hideSoftwareCursor();
      else restoreSoftwareCursor();
    };
    window.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", hideSoftwareCursor);
      window.removeEventListener("focus", restoreSoftwareCursor);
      window.document.removeEventListener("focusin", restoreSoftwareCursor);
      window.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hideSoftwareCursor, restoreSoftwareCursor, softwareCursor]);

  return { softwareCursor, softwareCursorRef, updateSoftwareCursor, leaveSoftwareCursor };
}
