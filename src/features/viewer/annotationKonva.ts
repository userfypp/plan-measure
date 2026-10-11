import { Konva } from "konva/lib/Global";
import type { Context as KonvaContext } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import type { Line as KonvaLineNode } from "konva/lib/shapes/Line";
import type { MeasurementType, Point } from "../../types/domain";
import { traceMeasurementOutline } from "../../utils/quickShapes";

function readOutlineGeometry(shape: KonvaShape): { type: MeasurementType; points: Point[] } | null {
  const type = shape.getAttr("measurementType") as MeasurementType | undefined;
  if (type !== "ellipse" && type !== "cloud") return null;
  const flat = (shape as KonvaLineNode).points();
  const points: Point[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    points.push({ x: flat[index]!, y: flat[index + 1]! });
  }
  return points.length >= 3 ? { type, points } : null;
}

/** Scene function for ellipse and cloud outlines: traces the true contour instead of the control ring. */
export function drawMeasurementOutlineScene(context: KonvaContext, shape: KonvaShape): void {
  const geometry = readOutlineGeometry(shape);
  if (!geometry) return;
  traceMeasurementOutline(context, geometry.type, geometry.points);
  context.fillStrokeShape(shape);
}

/**
 * Preserve the historical Konva hit geometry while allowing the scene stroke
 * to use the V2 round cap. Konva otherwise applies the scene lineCap to its hit
 * stroke too, which would extend open Line/Polyline hit regions past endpoints.
 */
export function drawMeasurementHit(context: KonvaContext, shape: KonvaShape): void {
  const line = shape as KonvaLineNode;
  const points = line.points();
  if (points.length < 2) return;

  const outline = readOutlineGeometry(shape);
  if (outline) {
    traceMeasurementOutline(context, outline.type, outline.points);
    context.fillShape(line);
    traceHitStroke(context, line);
    return;
  }

  context.beginPath();
  context.moveTo(points[0]!, points[1]!);
  for (let index = 2; index < points.length; index += 2) {
    context.lineTo(points[index]!, points[index + 1]!);
  }

  if (line.closed()) {
    context.closePath();
    context.fillShape(line);
  }

  traceHitStroke(context, line);
}

function traceHitStroke(context: KonvaContext, line: KonvaLineNode): void {
  if (!line.hasHitStroke()) return;
  const hitStrokeWidth = line.hitStrokeWidth();
  const strokeWidth = hitStrokeWidth === "auto" ? line.strokeWidth() : hitStrokeWidth;
  context.save();
  context.setAttr("lineCap", "butt");
  context.setAttr("lineWidth", strokeWidth);
  context.setAttr("strokeStyle", line.colorKey);
  context.stroke();
  context.restore();
}

export function withoutKonvaAutoDraw<T>(action: () => T): T {
  const previousAutoDraw = Konva.autoDrawEnabled;
  Konva.autoDrawEnabled = false;
  try {
    return action();
  } finally {
    Konva.autoDrawEnabled = previousAutoDraw;
  }
}
