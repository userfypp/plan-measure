import type { AuthoringCapability } from "../features/viewer/AuthoringCapability";
import type { ToolAvailabilityMap } from "../features/viewer/toolRegistry";
import type { CurrentSession, Measurement, PageCalibration, PageState } from "../types/domain";
import { findPageCalibration, replaceCalibrationReferencePoints } from "../utils/calibration";
import type { CalibrationReferenceEdit } from "./calibrationReferenceEdit";

export function calibrationMeasurementCount(page: PageState, calibrationId: string): number {
  return page.measurements.filter((measurement) => measurement.calibrationId === calibrationId)
    .length;
}

export function calibrationReferenceEditPreview(
  session: CurrentSession | null,
  edit: CalibrationReferenceEdit,
): PageCalibration | null {
  const page = session?.pages[edit.pageNumber];
  const calibration = page && findPageCalibration(page, edit.calibrationId);
  return calibration
    ? replaceCalibrationReferencePoints(calibration, edit.reference, edit.points)
    : null;
}

export function getPreviewPage(
  currentPage: PageState | undefined,
  calibrationReferenceEdit: CalibrationReferenceEdit | null,
  calibrationReferencePreview: PageCalibration | null,
  calibrationReferenceEditIsValid: boolean,
): PageState | undefined {
  return currentPage &&
    calibrationReferenceEdit &&
    calibrationReferenceEdit.pageNumber === currentPage.pageNumber &&
    calibrationReferencePreview &&
    calibrationReferenceEditIsValid
    ? {
        ...currentPage,
        calibrations: currentPage.calibrations.map((calibration) =>
          calibration.id === calibrationReferenceEdit.calibrationId
            ? calibrationReferencePreview
            : calibration,
        ),
      }
    : currentPage;
}

export function getPreviewPages(
  session: CurrentSession | null,
  currentPage: PageState | undefined,
  previewPage: PageState | undefined,
): CurrentSession["pages"] | undefined {
  return session && currentPage && previewPage && previewPage !== currentPage
    ? { ...session.pages, [currentPage.pageNumber]: previewPage }
    : session?.pages;
}

export function getSelectedMeasurements(
  session: CurrentSession | null,
  selectedMeasurementIds: readonly string[],
): Measurement[] {
  return Object.values(session?.pages ?? {}).flatMap((page) =>
    page.measurements.filter((measurement) => selectedMeasurementIds.includes(measurement.id)),
  );
}

export function getSelectedMeasurement(
  currentPage: PageState | undefined,
  selectedMeasurementId: string | null,
): Measurement | null {
  return (
    currentPage?.measurements.find((measurement) => measurement.id === selectedMeasurementId) ??
    null
  );
}

export function getToolAvailability(
  primaryToolsLocked: boolean,
  primaryToolLockReason: string,
  canCreateMeasurements: boolean,
  measurementToolDisabledReason: string,
  precisionAuthoringBlocked: boolean,
  precisionAuthoringDisabledReason: string,
): ToolAvailabilityMap {
  return {
    select: { enabled: !primaryToolsLocked, disabledReason: primaryToolLockReason },
    hand: { enabled: !primaryToolsLocked, disabledReason: primaryToolLockReason },
    line: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
    polyline: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
    polygon: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
    count: {
      enabled: !primaryToolsLocked && !precisionAuthoringBlocked,
      disabledReason: primaryToolsLocked ? primaryToolLockReason : precisionAuthoringDisabledReason,
    },
  };
}

export function getPrecisionAuthoringDisabledReason(
  authoringCapability: AuthoringCapability | null,
): string {
  return (
    authoringCapability?.unavailableReason ??
    "Precision drawing and editing need more unobscured viewer space and a fine pointer"
  );
}

export function getMeasurementToolDisabledReason(
  primaryToolsLocked: boolean,
  primaryToolLockReason: string,
  precisionAuthoringBlocked: boolean,
  precisionAuthoringDisabledReason: string,
): string {
  return primaryToolsLocked
    ? primaryToolLockReason
    : precisionAuthoringBlocked
      ? precisionAuthoringDisabledReason
      : "This tool requires an active scale";
}

export function getAddCountItemsDisabledReason(
  selectedMeasurement: Measurement | null,
  primaryToolsLocked: boolean,
  primaryToolLockReason: string,
  precisionAuthoringBlocked: boolean,
  precisionAuthoringDisabledReason: string,
  measurementEditActive: boolean,
): string | undefined {
  return !selectedMeasurement?.visible
    ? "Show this count before adding items"
    : primaryToolsLocked
      ? primaryToolLockReason
      : precisionAuthoringBlocked
        ? precisionAuthoringDisabledReason
        : measurementEditActive
          ? "Finish or cancel the current edit first"
          : undefined;
}
