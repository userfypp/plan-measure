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

export interface UniformPageCalibration extends Calibration {
  id: string;
  name: string;
  mode: "uniform";
}

export type XyCalibrationReference = Calibration;

export interface XyPageCalibration {
  id: string;
  name: string;
  mode: "xy";
  xReference: XyCalibrationReference;
  yReference: XyCalibrationReference;
}

export type PageCalibration = UniformPageCalibration | XyPageCalibration;

interface MeasurementBase {
  id: string;
  name: string;
  calibrationId: string;
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
  calibrations: PageCalibration[];
  activeCalibrationId: string | null;
  nextCalibrationNumber: number;
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

interface LegacyMeasurementBase {
  id: string;
  name: string;
}

export interface LegacyLineMeasurement extends LegacyMeasurementBase {
  type: "line";
  points: [Point, Point];
}

export interface LegacyPolygonMeasurement extends LegacyMeasurementBase {
  type: "polygon";
  points: Point[];
}

export type LegacyMeasurement = LegacyLineMeasurement | LegacyPolygonMeasurement;

export interface LegacyPageState {
  pageNumber: number;
  calibration: Calibration | null;
  measurements: LegacyMeasurement[];
  nextLineNumber: number;
  nextPolygonNumber: number;
}

export interface SessionV1 {
  schemaVersion: 1;
  pdf: PdfMetadata;
  pageCount: number;
  currentPage: number;
  pages: Record<number, LegacyPageState>;
  settings: SessionSettings;
}

export interface SessionV2 {
  schemaVersion: 2;
  pdf: PdfMetadata;
  pageCount: number;
  currentPage: number;
  pages: Record<number, PageStateV2>;
  settings: SessionSettings;
}

export interface PageCalibrationV2 extends Calibration {
  id: string;
  name: string;
}

export interface PageStateV2 {
  pageNumber: number;
  calibrations: PageCalibrationV2[];
  activeCalibrationId: string | null;
  nextCalibrationNumber: number;
  measurements: Measurement[];
  nextLineNumber: number;
  nextPolygonNumber: number;
}

export interface SessionV3 {
  schemaVersion: 3;
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
