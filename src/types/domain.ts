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

/** Identifies one editable two-point reference within a page calibration. */
export type CalibrationReferenceKey = "uniform" | "x" | "y";

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

export type MeasurementV3 = LineMeasurement | PolygonMeasurement;

export interface PageStateV3 {
  pageNumber: number;
  calibrations: PageCalibration[];
  activeCalibrationId: string | null;
  nextCalibrationNumber: number;
  measurements: MeasurementV3[];
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
  measurements: MeasurementV3[];
  nextLineNumber: number;
  nextPolygonNumber: number;
}

export interface SessionV3 {
  schemaVersion: 3;
  pdf: PdfMetadata;
  pageCount: number;
  currentPage: number;
  pages: Record<number, PageStateV3>;
  settings: SessionSettings;
}

export type MeasurementType = "line" | "polyline" | "polygon";

export interface PathMeasurementV4 extends MeasurementBase {
  type: MeasurementType;
  points: Point[];
}

export type MeasurementV4 = PathMeasurementV4;

export type MeasurementCounters = Record<MeasurementType, number>;

export interface PageStateV4 {
  pageNumber: number;
  calibrations: PageCalibration[];
  activeCalibrationId: string | null;
  nextCalibrationNumber: number;
  measurements: MeasurementV4[];
  nextMeasurementNumber: MeasurementCounters;
}

export interface SessionV4 {
  schemaVersion: 4;
  pdf: PdfMetadata;
  pageCount: number;
  currentPage: number;
  pages: Record<number, PageStateV4>;
  settings: SessionSettings;
}

export interface ClassificationValue {
  id: string;
  name: string;
  archived: boolean;
}

export interface ClassificationDimension {
  id: string;
  name: string;
  values: ClassificationValue[];
}

export interface ClassificationCatalog {
  dimensions: ClassificationDimension[];
}

/** Measurement shape persisted by schema V5, before per-measurement visibility. */
export interface PathMeasurementV5 extends MeasurementBase {
  type: MeasurementType;
  points: Point[];
  classificationValueIds: string[];
}

export type MeasurementV5 = PathMeasurementV5;

export interface PageStateV5 {
  pageNumber: number;
  calibrations: PageCalibration[];
  activeCalibrationId: string | null;
  nextCalibrationNumber: number;
  measurements: MeasurementV5[];
  nextMeasurementNumber: MeasurementCounters;
}

export interface SessionV5 {
  schemaVersion: 5;
  pdf: PdfMetadata;
  pageCount: number;
  currentPage: number;
  pages: Record<number, PageStateV5>;
  settings: SessionSettings;
  classificationCatalog: ClassificationCatalog;
}

/** Current measurement shape, persisted by schema V6. */
export interface PathMeasurement extends MeasurementBase {
  type: MeasurementType;
  points: Point[];
  classificationValueIds: string[];
  visible: boolean;
}

export type Measurement = PathMeasurement;

export interface PageState {
  pageNumber: number;
  calibrations: PageCalibration[];
  activeCalibrationId: string | null;
  nextCalibrationNumber: number;
  measurements: Measurement[];
  nextMeasurementNumber: MeasurementCounters;
}

export interface SessionV6 {
  schemaVersion: 6;
  pdf: PdfMetadata;
  pageCount: number;
  currentPage: number;
  pages: Record<number, PageState>;
  settings: SessionSettings;
  classificationCatalog: ClassificationCatalog;
}

export type Tool = "select" | "hand" | "calibrate" | MeasurementType;

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
  | { type: "calibrate"; points: Point[] }
  | {
      type: "path";
      measurementType: MeasurementType;
      points: Point[];
    };
