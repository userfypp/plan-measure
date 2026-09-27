import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PDFFont, PDFPage } from "pdf-lib";
import type {
  CurrentSession,
  LogicalPageBounds,
  Measurement,
  PageState,
  Point,
  SessionSettings,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { normalizeRotation } from "../../utils/coordinates";
import { formatMeasurement } from "../../utils/format";
import { measurementPathSpecs } from "../../utils/geometry";
import {
  createLabelCollisionIndex,
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelAvoidingOverlaps,
  placeLabelInsideMeasurementGeometry,
  type LabelDimensions,
  type LabelPlacement,
} from "../../utils/labelLayout";
import { shouldRenderMeasurement } from "../measurements/measurementViewModels";
import { CANVAS_VISUAL_METRICS, resolveCanvasVisualRoles } from "../viewer/canvasVisualRoles";

const LABEL_PADDING_PDF_PT = CANVAS_VISUAL_METRICS.labelPaddingScreenPx;
const LABEL_FONT_SIZE_PDF_PT = CANVAS_VISUAL_METRICS.measurementLabelFontSizeScreenPx;
const MEASUREMENT_STROKE_PDF_PT = CANVAS_VISUAL_METRICS.measurementStrokeScreenPx;
const LABEL_BACKGROUND_OPACITY = 0.88;
const DOWNLOAD_URL_LIFETIME_MS = 60_000;
const exportVisualRoles = resolveCanvasVisualRoles("light");

interface PdfViewportLike {
  width: number;
  height: number;
  rotation: number;
  convertToPdfPoint(x: number, y: number): unknown[];
}

interface ParsedColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface AnnotatedPdfLabelPlan {
  text: string;
  placement: LabelPlacement;
  dimensions: LabelDimensions;
}

export interface AnnotatedPdfMeasurementPlan {
  measurement: Measurement;
  label: AnnotatedPdfLabelPlan | null;
}

function averagePoint(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function parseHexColor(value: string): ParsedColor {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!match) throw new Error(`Unsupported annotation color: ${value}`);
  const rgbHex = match[1]!;
  return {
    red: Number.parseInt(rgbHex.slice(0, 2), 16) / 255,
    green: Number.parseInt(rgbHex.slice(2, 4), 16) / 255,
    blue: Number.parseInt(rgbHex.slice(4, 6), 16) / 255,
    alpha: match[2] ? Number.parseInt(match[2], 16) / 255 : 1,
  };
}

function pageBounds(viewport: PdfViewportLike): LogicalPageBounds {
  return {
    width: viewport.width,
    height: viewport.height,
    rotation: normalizeRotation(viewport.rotation),
  };
}

function pdfPoint(viewport: PdfViewportLike, point: Point): Point {
  const converted = viewport.convertToPdfPoint(point.x, point.y);
  const x = Number(converted[0]);
  const y = Number(converted[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("A measurement contains coordinates that cannot be exported.");
  }
  return { x, y };
}

function logicalXAxisVector(viewport: PdfViewportLike): Point {
  const origin = pdfPoint(viewport, { x: 0, y: 0 });
  const xAxis = pdfPoint(viewport, { x: 1, y: 0 });
  return { x: xAxis.x - origin.x, y: xAxis.y - origin.y };
}

function logicalXAxisAngleDegrees(viewport: PdfViewportLike): number {
  const axis = logicalXAxisVector(viewport);
  return (Math.atan2(axis.y, axis.x) * 180) / Math.PI;
}

function logicalUnitScale(viewport: PdfViewportLike): number {
  const axis = logicalXAxisVector(viewport);
  const scale = Math.hypot(axis.x, axis.y);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("The PDF page coordinate system cannot be exported.");
  }
  return scale;
}

function svgPdfPoint(viewport: PdfViewportLike, point: Point): string {
  const converted = pdfPoint(viewport, point);
  return `${converted.x} ${-converted.y}`;
}

function roundedLabelBackgroundPath(
  viewport: PdfViewportLike,
  placement: LabelPlacement,
  dimensions: LabelDimensions,
): string {
  const { x, y } = placement;
  const { width, height } = dimensions;
  const radius = Math.min(CANVAS_VISUAL_METRICS.labelCornerRadiusScreenPx, width / 2, height / 2);
  const kappa = 0.5522847498307936;
  const control = radius * kappa;
  const right = x + width;
  const bottom = y + height;

  return [
    `M ${svgPdfPoint(viewport, { x: x + radius, y })}`,
    `L ${svgPdfPoint(viewport, { x: right - radius, y })}`,
    `C ${svgPdfPoint(viewport, { x: right - radius + control, y })} ${svgPdfPoint(viewport, {
      x: right,
      y: y + radius - control,
    })} ${svgPdfPoint(viewport, { x: right, y: y + radius })}`,
    `L ${svgPdfPoint(viewport, { x: right, y: bottom - radius })}`,
    `C ${svgPdfPoint(viewport, { x: right, y: bottom - radius + control })} ${svgPdfPoint(
      viewport,
      { x: right - radius + control, y: bottom },
    )} ${svgPdfPoint(viewport, { x: right - radius, y: bottom })}`,
    `L ${svgPdfPoint(viewport, { x: x + radius, y: bottom })}`,
    `C ${svgPdfPoint(viewport, { x: x + radius - control, y: bottom })} ${svgPdfPoint(viewport, {
      x,
      y: bottom - radius + control,
    })} ${svgPdfPoint(viewport, { x, y: bottom - radius })}`,
    `L ${svgPdfPoint(viewport, { x, y: y + radius })}`,
    `C ${svgPdfPoint(viewport, { x, y: y + radius - control })} ${svgPdfPoint(viewport, {
      x: x + radius - control,
      y,
    })} ${svgPdfPoint(viewport, { x: x + radius, y })} Z`,
  ].join(" ");
}

export function annotatedPdfFileName(pdfName: string): string {
  const baseName = pdfName.replace(/\.pdf$/i, "").replace(/[\\/]/g, "_");
  return `${baseName || "plan"}-annotated.pdf`;
}

export function planAnnotatedPdfMeasurements(
  page: PageState,
  bounds: LogicalPageBounds,
  settings: Pick<
    SessionSettings,
    "showMeasurements" | "showLabels" | "displayUnit" | "measurementDecimalPlaces" | "areaDisplay"
  >,
  measureLabel: (text: string) => LabelDimensions,
): AnnotatedPdfMeasurementPlan[] {
  if (!settings.showMeasurements) return [];

  const occupied = createLabelCollisionIndex();
  const planned: AnnotatedPdfMeasurementPlan[] = [];

  for (const measurement of page.measurements) {
    if (!shouldRenderMeasurement(measurement, settings.showMeasurements)) continue;

    let label: AnnotatedPdfLabelPlan | null = null;
    if (settings.showLabels) {
      const calibration = getMeasurementCalibration(page, measurement);
      if (calibration) {
        const text = formatMeasurement(
          measurement,
          calibration,
          settings.displayUnit,
          settings.measurementDecimalPlaces,
          settings.areaDisplay,
        );
        const dimensions = measureLabel(text);
        const placement =
          placeLabelInsideMeasurementGeometry(
            measurement.type,
            measurement.points,
            dimensions,
            bounds,
            1,
            occupied,
            LABEL_EDGE_MARGIN_SCREEN_PX,
          ) ??
          placeLabelAvoidingOverlaps(
            averagePoint(measurement.points),
            dimensions,
            bounds,
            1,
            occupied,
            LABEL_EDGE_MARGIN_SCREEN_PX,
          );
        occupied.insert({ ...placement, ...dimensions });
        label = { text, placement, dimensions };
      }
    }

    planned.push({ measurement, label });
  }

  return planned;
}

function drawMeasurementGeometry(
  page: PDFPage,
  viewport: PdfViewportLike,
  measurement: Measurement,
  pdfLib: typeof import("pdf-lib"),
) {
  const points = measurement.points.map((point) => pdfPoint(viewport, point));
  if (points.length < 2) return;

  const strokeColor = parseHexColor(exportVisualRoles.measurementDefaultStroke);
  const fillColor = parseHexColor(exportVisualRoles.measurementDefaultFill);
  const stroke = pdfLib.rgb(strokeColor.red, strokeColor.green, strokeColor.blue);

  if (measurementPathSpecs[measurement.type].closed && points.length >= 3) {
    const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${-point.y}`)
      .join(" ");
    page.drawSvgPath(`${path} Z`, {
      x: 0,
      y: 0,
      color: pdfLib.rgb(fillColor.red, fillColor.green, fillColor.blue),
      opacity: fillColor.alpha,
    });
  }

  const segmentCount = measurementPathSpecs[measurement.type].closed
    ? points.length
    : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    page.drawLine({
      start: points[index]!,
      end: points[(index + 1) % points.length]!,
      thickness: MEASUREMENT_STROKE_PDF_PT * logicalUnitScale(viewport),
      color: stroke,
      opacity: strokeColor.alpha,
      lineCap: pdfLib.LineCapStyle.Round,
    });
  }
}

function drawMeasurementLabel(
  page: PDFPage,
  viewport: PdfViewportLike,
  font: PDFFont,
  label: AnnotatedPdfLabelPlan,
  pdfLib: typeof import("pdf-lib"),
) {
  const backgroundColor = parseHexColor(exportVisualRoles.labelBackground);
  const textColor = parseHexColor(exportVisualRoles.labelText);
  const { x, y } = label.placement;
  const rotation = pdfLib.degrees(logicalXAxisAngleDegrees(viewport));
  const unitScale = logicalUnitScale(viewport);

  page.drawSvgPath(roundedLabelBackgroundPath(viewport, label.placement, label.dimensions), {
    x: 0,
    y: 0,
    color: pdfLib.rgb(backgroundColor.red, backgroundColor.green, backgroundColor.blue),
    opacity: LABEL_BACKGROUND_OPACITY * backgroundColor.alpha,
  });

  const textHeight = font.heightAtSize(LABEL_FONT_SIZE_PDF_PT);
  const baseline = pdfPoint(viewport, {
    x: x + LABEL_PADDING_PDF_PT,
    y: y + LABEL_PADDING_PDF_PT + textHeight,
  });
  page.drawText(label.text, {
    x: baseline.x,
    y: baseline.y,
    size: LABEL_FONT_SIZE_PDF_PT * unitScale,
    font,
    rotate: rotation,
    color: pdfLib.rgb(textColor.red, textColor.green, textColor.blue),
    opacity: textColor.alpha,
  });
}

export async function createAnnotatedPdf(
  session: CurrentSession,
  sourceDocument: PDFDocumentProxy,
): Promise<Uint8Array> {
  if (sourceDocument.numPages !== session.pageCount) {
    throw new Error("The source PDF does not match this project's saved page count.");
  }

  const [sourceBytes, pdfLib] = await Promise.all([sourceDocument.getData(), import("pdf-lib")]);
  const output = await pdfLib.PDFDocument.load(sourceBytes);
  const pages = output.getPages();
  if (pages.length !== session.pageCount) {
    throw new Error("The source PDF does not match this project's saved page count.");
  }

  const font = await output.embedFont(pdfLib.StandardFonts.Helvetica);

  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const pageState = session.pages[pageNumber];
    if (!pageState || !session.settings.showMeasurements) continue;

    const sourcePage = await sourceDocument.getPage(pageNumber);
    const rotation = normalizeRotation(sourcePage.rotate);
    const viewport = sourcePage.getViewport({ scale: 1, rotation }) as PdfViewportLike;
    const bounds = pageBounds(viewport);
    const plans = planAnnotatedPdfMeasurements(pageState, bounds, session.settings, (text) => ({
      width: font.widthOfTextAtSize(text, LABEL_FONT_SIZE_PDF_PT) + LABEL_PADDING_PDF_PT * 2,
      height: font.heightAtSize(LABEL_FONT_SIZE_PDF_PT) + LABEL_PADDING_PDF_PT * 2,
    }));
    const outputPage = pages[pageNumber - 1]!;

    for (const plan of plans) {
      drawMeasurementGeometry(outputPage, viewport, plan.measurement, pdfLib);
    }
    for (const plan of plans) {
      if (plan.label) drawMeasurementLabel(outputPage, viewport, font, plan.label, pdfLib);
    }
  }

  return output.save();
}

export async function downloadAnnotatedPdf(
  session: CurrentSession,
  sourceDocument: PDFDocumentProxy,
): Promise<void> {
  const bytes = await createAnnotatedPdf(session, sourceDocument);
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = annotatedPdfFileName(session.pdf.name);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}
