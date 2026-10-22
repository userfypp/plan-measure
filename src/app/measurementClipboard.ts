import type { PasteMeasurementCommand } from "./sessionState";
import type { MeasurementClipboard } from "./workspaceState";
import type { LogicalPageBounds, Measurement, PageState } from "../types/domain";
import { getMeasurementCalibration } from "../utils/calibration";
import { isPointInPage } from "../utils/coordinates";
import { hasValidMeasurementPoints, measurementTypeRequiresScale } from "../utils/geometry";

export const MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX = 12;

/** Page offset that keeps a same-page duplicate visibly apart: down-right, else up-left, else none. */
export function samePageDuplicateOffset(
  measurements: readonly Measurement[],
  bounds: LogicalPageBounds | null,
  zoom: number | null,
): number {
  if (!bounds || !zoom || !Number.isFinite(zoom) || zoom <= 0) return 0;
  const offset = MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX / zoom;
  for (const candidate of [offset, -offset]) {
    if (
      measurements.every((measurement) =>
        measurement.points.every((point) =>
          isPointInPage({ x: point.x + candidate, y: point.y + candidate }, bounds),
        ),
      )
    ) {
      return candidate;
    }
  }
  return 0;
}

export function measurementClipboardFitsPage(
  clipboard: MeasurementClipboard,
  pageNumber: number,
  bounds: LogicalPageBounds | null,
): boolean {
  if (clipboard.sourcePageNumber === pageNumber) return true;
  return Boolean(
    bounds &&
      (clipboard.measurements ?? [clipboard.measurement]).every((measurement) =>
        measurement.points.every((point) => isPointInPage(point, bounds)),
      ),
  );
}

export function canDuplicateMeasurement(
  page: Pick<PageState, "calibrations">,
  measurement: Measurement,
): boolean {
  return (
    (!measurementTypeRequiresScale(measurement.type) ||
      getMeasurementCalibration(page, measurement) !== null) &&
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

interface PasteMeasurementsClipboardOptions {
  clipboard: MeasurementClipboard;
  pageNumber: number;
  destinationBounds?: LogicalPageBounds | null;
  destinationZoom?: number | null;
  pasteMeasurements: (commands: readonly PasteMeasurementCommand[]) => boolean;
  selectMeasurements: (ids: string[]) => void;
  createId?: () => string;
}

/** Keep the entire copied arrangement together, including at page boundaries. */
export function pasteMeasurementsClipboard({
  clipboard,
  pageNumber,
  destinationBounds = null,
  destinationZoom = null,
  pasteMeasurements,
  selectMeasurements,
  createId = () => crypto.randomUUID(),
}: PasteMeasurementsClipboardOptions): string[] | null {
  const sources = clipboard.measurements ?? [clipboard.measurement];
  if (sources.length === 0) return null;
  const delta =
    clipboard.sourcePageNumber === pageNumber
      ? samePageDuplicateOffset(sources, destinationBounds, destinationZoom)
      : 0;
  const commands = sources.map((measurement) => ({
    pageNumber,
    sourcePageNumber: clipboard.sourcePageNumber,
    id: createId(),
    measurement: delta === 0
      ? measurement
      : {
          ...measurement,
          points: measurement.points.map((point) => ({ x: point.x + delta, y: point.y + delta })),
        },
  }));
  if (!pasteMeasurements(commands)) return null;
  const ids = commands.map((command) => command.id);
  selectMeasurements(ids);
  return ids;
}
