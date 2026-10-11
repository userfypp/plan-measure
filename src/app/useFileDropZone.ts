import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

export function useFileDropZone(chooseFile: (file: File) => Promise<void> | void) {
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  const clearDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setDragActive(false);
  }, []);

  useEffect(() => {
    window.addEventListener("blur", clearDragState);
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    document.addEventListener("visibilitychange", clearDragState);
    return () => {
      window.removeEventListener("blur", clearDragState);
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
      document.removeEventListener("visibilitychange", clearDragState);
    };
  }, [clearDragState]);

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) clearDragState();
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    clearDragState();
    const file = event.dataTransfer.files[0];
    if (file) void chooseFile(file);
  }

  return { dragActive, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
}
