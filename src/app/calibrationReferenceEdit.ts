import type { CalibrationReferenceKey, PageCalibration, Point } from "../types/domain";
import { getCalibrationReference } from "../utils/calibration";

export interface CalibrationReferenceEdit {
  pageNumber: number;
  calibrationId: string;
  reference: CalibrationReferenceKey;
  originalPoints: [Point, Point];
  points: [Point, Point];
}

function copyPoints(points: readonly [Point, Point]): [Point, Point] {
  return [{ ...points[0] }, { ...points[1] }];
}

export function beginCalibrationReferenceEdit(
  pageNumber: number,
  calibration: PageCalibration,
  reference: CalibrationReferenceKey,
): CalibrationReferenceEdit | null {
  const sourceReference = getCalibrationReference(calibration, reference);
  if (!sourceReference) return null;
  const points = copyPoints([sourceReference.start, sourceReference.end]);
  return {
    pageNumber,
    calibrationId: calibration.id,
    reference,
    originalPoints: copyPoints(points),
    points,
  };
}

export function updateCalibrationReferenceEdit(
  edit: CalibrationReferenceEdit,
  points: readonly [Point, Point],
): CalibrationReferenceEdit {
  return { ...edit, points: copyPoints(points) };
}

export function cancelCalibrationReferenceEdit(): null {
  return null;
}
