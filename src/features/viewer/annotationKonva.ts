import { Konva } from "konva/lib/Global";
import type { Context as KonvaContext } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import type { Line as KonvaLineNode } from "konva/lib/shapes/Line";

/**
 * Preserve the historical Konva hit geometry while allowing the scene stroke
 * to use the V2 round cap. Konva otherwise applies the scene lineCap to its hit
 * stroke too, which would extend open Line/Polyline hit regions past endpoints.
 */
export function drawMeasurementHit(context: KonvaContext, shape: KonvaShape): void {
  const line = shape as KonvaLineNode;
  const points = line.points();
  if (points.length < 2) return;

  context.beginPath();
  context.moveTo(points[0]!, points[1]!);
  for (let index = 2; index < points.length; index += 2) {
    context.lineTo(points[index]!, points[index + 1]!);
  }

  if (line.closed()) {
    context.closePath();
    context.fillShape(line);
  }

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
