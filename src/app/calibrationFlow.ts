import type {
  Point,
  UniformPageCalibration,
  XyCalibrationReference,
  XyPageCalibration,
} from "../types/domain";

export type CalibrationMode = "uniform" | "xy";
export type CalibrationPhase = "uniform" | "x" | "y";

export interface CalibrationFlow {
  pageNumber: number;
  calibrationId: string | null;
  mode: CalibrationMode;
  phase: CalibrationPhase;
  name?: string;
  xReference?: XyCalibrationReference;
}

export interface CalibrationSelection {
  pageNumber: number;
  points: [Point, Point];
  calibrationId: string | null;
  mode: CalibrationMode;
  phase: CalibrationPhase;
  name?: string;
  xReference?: XyCalibrationReference;
}

export type CalibrationInput =
  Omit<UniformPageCalibration, "id" | "name"> | Omit<XyPageCalibration, "id" | "name">;

export type CalibrationConfirmation =
  { kind: "select-y"; flow: CalibrationFlow } | { kind: "complete"; calibration: CalibrationInput };

export function beginCalibrationFlow(
  pageNumber: number,
  calibrationId: string | null,
  mode: CalibrationMode,
): CalibrationFlow {
  return {
    pageNumber,
    calibrationId,
    mode,
    phase: mode === "uniform" ? "uniform" : "x",
  };
}

export function selectCalibrationReference(
  flow: CalibrationFlow,
  points: [Point, Point],
): CalibrationSelection {
  return {
    pageNumber: flow.pageNumber,
    points,
    calibrationId: flow.calibrationId,
    mode: flow.mode,
    phase: flow.phase,
    name: flow.name,
    xReference: flow.xReference,
  };
}

export function completeXReference(
  flow: CalibrationFlow,
  points: [Point, Point],
  referenceDistanceMm: number,
  name: string,
): CalibrationFlow {
  if (flow.mode !== "xy" || flow.phase !== "x") {
    throw new Error("An X reference can only complete the X phase of an X/Y flow.");
  }
  return {
    ...flow,
    phase: "y",
    name,
    xReference: {
      start: points[0],
      end: points[1],
      referenceDistanceMm,
    },
  };
}

export function completeCalibration(
  flow: CalibrationFlow,
  points: [Point, Point],
  referenceDistanceMm: number,
): CalibrationInput {
  if (flow.mode === "uniform" && flow.phase === "uniform") {
    return {
      mode: "uniform",
      start: points[0],
      end: points[1],
      referenceDistanceMm,
    };
  }
  if (flow.mode === "xy" && flow.phase === "y" && flow.xReference) {
    return {
      mode: "xy",
      xReference: flow.xReference,
      yReference: {
        start: points[0],
        end: points[1],
        referenceDistanceMm,
      },
    };
  }
  throw new Error("Calibration is not ready to be completed.");
}

export function confirmCalibration(
  flow: CalibrationFlow,
  selection: CalibrationSelection,
  referenceDistanceMm: number,
  name: string,
): CalibrationConfirmation {
  if (flow.mode === "xy" && flow.phase === "x") {
    return {
      kind: "select-y",
      flow: completeXReference(flow, selection.points, referenceDistanceMm, name),
    };
  }
  return {
    kind: "complete",
    calibration: completeCalibration(flow, selection.points, referenceDistanceMm),
  };
}
