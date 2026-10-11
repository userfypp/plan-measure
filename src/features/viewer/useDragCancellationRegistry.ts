import { useCallback, useRef } from "react";
import { createWholeMeasurementDragCancellationRegistry } from "./measurementDrag";
import { createMeasurementVertexDragCancellationRegistry } from "./measurementVertexDrag";

export function useDragCancellationRegistry() {
  const wholeMeasurementDragCancellationRegistryRef = useRef(
    createWholeMeasurementDragCancellationRegistry(),
  );
  const vertexDragCancellationRegistryRef = useRef(
    createMeasurementVertexDragCancellationRegistry(),
  );
  const calibrationReferenceDragCancellationRef = useRef<{
    owner: object;
    cancel: () => void;
  } | null>(null);

  const registerWholeMeasurementDragCancellation = useCallback(
    (measurementId: string, cancel: (() => void) | null) => {
      wholeMeasurementDragCancellationRegistryRef.current.set(measurementId, cancel);
    },
    [],
  );

  const cancelActiveWholeMeasurementDrag = useCallback(() => {
    wholeMeasurementDragCancellationRegistryRef.current.cancelActive();
  }, []);

  const registerVertexDragCancellation = useCallback(
    (measurementId: string, owner: object, cancel: (() => void) | null) => {
      vertexDragCancellationRegistryRef.current.set(measurementId, owner, cancel);
    },
    [],
  );

  const cancelActiveVertexDrag = useCallback(() => {
    vertexDragCancellationRegistryRef.current.cancelActive();
  }, []);

  const registerCalibrationReferenceDragCancellation = useCallback(
    (owner: object, cancel: (() => void) | null) => {
      if (cancel) {
        calibrationReferenceDragCancellationRef.current = { owner, cancel };
      } else if (calibrationReferenceDragCancellationRef.current?.owner === owner) {
        calibrationReferenceDragCancellationRef.current = null;
      }
    },
    [],
  );

  const cancelActiveCalibrationReferenceDrag = useCallback(() => {
    const active = calibrationReferenceDragCancellationRef.current;
    if (!active) return;
    calibrationReferenceDragCancellationRef.current = null;
    active.cancel();
  }, []);

  return {
    wholeMeasurementDragCancellationRegistryRef,
    vertexDragCancellationRegistryRef,
    registerWholeMeasurementDragCancellation,
    cancelActiveWholeMeasurementDrag,
    registerVertexDragCancellation,
    cancelActiveVertexDrag,
    registerCalibrationReferenceDragCancellation,
    cancelActiveCalibrationReferenceDrag,
  };
}
