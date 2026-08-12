export type LinearUnit = "mm" | "cm" | "m";

export interface Point {
  x: number;
  y: number;
}

export interface Calibration {
  start: Point;
  end: Point;
  referenceDistanceMm: number;
}

interface MeasurementBase {
  id: string;
  name: string;
}

export interface LineMeasurement extends MeasurementBase {
  type: "line";
  points: [Point, Point];
}

export interface PolygonMeasurement extends MeasurementBase {
  type: "polygon";
  points: Point[];
}

export type Measurement = LineMeasurement | PolygonMeasurement;

export interface PageState {
  pageNumber: number;
  calibration: Calibration | null;
  measurements: Measurement[];
  nextLineNumber: number;
  nextPolygonNumber: number;
}

export interface PdfMetadata {
  name: string;
  size: number;
  lastModified: number;
}

export interface SessionSettings {
  displayUnit: LinearUnit;
  showLabels: boolean;
  showMeasurements: boolean;
  showCalibration: boolean;
}

export interface SessionV1 {
  schemaVersion: 1;
  pdf: PdfMetadata;
  pageCount: number;
  currentPage: number;
  pages: Record<number, PageState>;
  settings: SessionSettings;
}

export type Tool = "select" | "hand" | "calibrate" | "line" | "polygon";

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface LogicalPageBounds {
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

export type DrawingDraft =
  | { type: "calibrate"; points: Point[]; pointer: Point | null }
  | { type: "line"; points: Point[]; pointer: Point | null }
  | { type: "polygon"; points: Point[]; pointer: Point | null };
