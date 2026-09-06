import type { PasteMeasurementCommand } from "./sessionState";
import type { MeasurementClipboard } from "./workspaceState";
import type { LogicalPageBounds, Measurement, PageState } from "../types/domain";
import { getMeasurementCalibration } from "../utils/calibration";
import { isPointInPage } from "../utils/coordinates";
import { hasValidMeasurementPoints } from "../utils/geometry";

export const MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX = 12;

interface PasteMeasurementClipboardOptions {
  clipboard: MeasurementClipboard;
  pageNumber: number;
  destinationBounds?: LogicalPageBounds | null;
  destinationZoom?: number | null;
  pasteMeasurement: (command: PasteMeasurementCommand) => boolean;
  selectMeasurement: (measurementId: string) => void;
  createId?: () => string;
}

interface DuplicateMeasurementOptions {
  measurement: Measurement;
  pageNumber: number;
  destinationBounds?: LogicalPageBounds | null;
  destinationZoom?: number | null;
  pasteMeasurement: (command: PasteMeasurementCommand) => boolean;
  selectMeasurement: (measurementId: string) => void;
  createId?: () => string;
}

export function offsetMeasurementForSamePageDuplicate(
  measurement: Measurement,
  bounds: LogicalPageBounds | null,
  zoom: number | null,
  offsetScreenPx = MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX,
): Measurement {
  if (!bounds || !zoom || !Number.isFinite(zoom) || zoom <= 0 || offsetScreenPx <= 0) {
    return measurement;
  }

  const offsetPageUnits = offsetScreenPx / zoom;
  for (const direction of [1, -1] as const) {
    const delta = direction * offsetPageUnits;
    const points = measurement.points.map((point) => ({
      x: point.x + delta,
      y: point.y + delta,
    }));
    if (points.every((point) => isPointInPage(point, bounds))) {
      return { ...measurement, points };
    }
  }

  return measurement;
}

export function measurementClipboardFitsPage(
  clipboard: MeasurementClipboard,
  pageNumber: number,
  bounds: LogicalPageBounds | null,
): boolean {
  if (clipboard.sourcePageNumber === pageNumber) return true;
  return Boolean(
    bounds && clipboard.measurement.points.every((point) => isPointInPage(point, bounds)),
  );
}

export function canDuplicateMeasurement(
  page: Pick<PageState, "calibrations">,
  measurement: Measurement,
): boolean {
  return (
    getMeasurementCalibration(page, measurement) !== null &&
    hasValidMeasurementPoints(measurement.type, measurement.points)
  );
}

interface MeasurementClipboardInteractionState {
  measurementEditActive: boolean;
  draftActive: boolean;
  calibrationFlowActive: boolean;
  calibrationCandidateActive: boolean;
  calibrationReferenceEditActive: boolean;
}

export function isMeasurementClipboardActionBlocked(
  action: "copy-measurement" | "paste-measurement",
  state: MeasurementClipboardInteractionState,
): boolean {
  if (state.measurementEditActive) return true;
  return (
    action === "paste-measurement" &&
    (state.draftActive ||
      state.calibrationFlowActive ||
      state.calibrationCandidateActive ||
      state.calibrationReferenceEditActive)
  );
}

interface MeasurementClipboardInvalidationOptions {
  documentTarget: EventTarget;
  windowTarget: EventTarget;
  applicationCopyInProgress: () => boolean;
  clearClipboard: () => void;
}

export function registerMeasurementClipboardInvalidation({
  documentTarget,
  windowTarget,
  applicationCopyInProgress,
  clearClipboard,
}: MeasurementClipboardInvalidationOptions): () => void {
  function invalidateNativeClipboardCopy() {
    if (!applicationCopyInProgress()) clearClipboard();
  }

  documentTarget.addEventListener("copy", invalidateNativeClipboardCopy);
  documentTarget.addEventListener("cut", invalidateNativeClipboardCopy);
  windowTarget.addEventListener("blur", clearClipboard);

  return () => {
    documentTarget.removeEventListener("copy", invalidateNativeClipboardCopy);
    documentTarget.removeEventListener("cut", invalidateNativeClipboardCopy);
    windowTarget.removeEventListener("blur", clearClipboard);
  };
}

export function pasteMeasurementClipboard({
  clipboard,
  pageNumber,
  destinationBounds = null,
  destinationZoom = null,
  pasteMeasurement,
  selectMeasurement,
  createId = () => crypto.randomUUID(),
}: PasteMeasurementClipboardOptions): string | null {
  const id = createId();
  const measurement =
    clipboard.sourcePageNumber === pageNumber
      ? offsetMeasurementForSamePageDuplicate(
          clipboard.measurement,
          destinationBounds,
          destinationZoom,
        )
      : clipboard.measurement;
  const accepted = pasteMeasurement({
    pageNumber,
    id,
    sourcePageNumber: clipboard.sourcePageNumber,
    measurement,
  });
  if (!accepted) return null;
  selectMeasurement(id);
  return id;
}

export function duplicateMeasurement({
  measurement,
  pageNumber,
  destinationBounds = null,
  destinationZoom = null,
  pasteMeasurement,
  selectMeasurement,
  createId,
}: DuplicateMeasurementOptions): string | null {
  return pasteMeasurementClipboard({
    clipboard: { sourcePageNumber: pageNumber, measurement },
    pageNumber,
    destinationBounds,
    destinationZoom,
    pasteMeasurement,
    selectMeasurement,
    createId,
  });
}
