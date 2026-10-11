import { memo } from "react";
import { Circle } from "react-konva";
import type { Point } from "../../types/domain";
import { CANVAS_VISUAL_METRICS } from "./canvasVisualRoles";

export const DraftPointMarkers = memo(function DraftPointMarkers({
  points,
  zoom,
  fill,
  stroke,
}: {
  points: Point[];
  zoom: number;
  fill: string;
  stroke: string;
}) {
  return (
    <>
      {points.slice(1).map((point, index) => (
        <Circle
          key={`draft-point-${index + 1}`}
          x={point.x}
          y={point.y}
          radius={CANVAS_VISUAL_METRICS.handleRadiusScreenPx / zoom}
          fill={fill}
          stroke={stroke}
          strokeWidth={CANVAS_VISUAL_METRICS.handleStrokeScreenPx / zoom}
          listening={false}
        />
      ))}
    </>
  );
});
