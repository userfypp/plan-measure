import { Label, Line, Rect, Tag, Text } from "react-konva";
import type {
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
  Point,
} from "../../types/domain";
import { CANVAS_VISUAL_METRICS, type CanvasVisualRoles } from "./canvasVisualRoles";
import { boxGuideBounds, boxGuideDimensionTexts } from "./boxGuides";

interface BoxDraftGuidesProps {
  /** Corner ring of the box being drawn. */
  ring: readonly Point[];
  type: "rectangle" | "ellipse";
  zoom: number;
  roles: CanvasVisualRoles;
  calibration: PageCalibration | null;
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
}

/**
 * Non-interactive construction guides of a box shape while its second corner is
 * dragged: square handles, live dimensions and, for ellipses, the bounding box,
 * center cross and faint central axes. All sizes are screen pixels divided by zoom.
 */
export function BoxDraftGuides({
  ring,
  type,
  zoom,
  roles,
  calibration,
  displayUnit,
  decimalPlaces,
}: BoxDraftGuidesProps) {
  const bounds = boxGuideBounds(ring);
  if (!bounds) return null;
  const metrics = CANVAS_VISUAL_METRICS;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const centerX = bounds.minX + width / 2;
  const centerY = bounds.minY + height / 2;
  const hairline = metrics.boxGuideStrokeScreenPx / zoom;
  const handleSize = metrics.boxGuideHandleSizeScreenPx / zoom;
  const crossHalf = metrics.boxGuideCenterCrossHalfScreenPx / zoom;
  const minScreenSide = Math.min(width, height) * zoom;
  const showMidHandles = minScreenSide >= metrics.boxGuideHandleSizeScreenPx * 3;
  const showSeparateDimensions = minScreenSide >= metrics.boxGuideDimensionMinSideScreenPx;

  const handles: Point[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
    ...(showMidHandles
      ? [
          { x: centerX, y: bounds.minY },
          { x: bounds.maxX, y: centerY },
          { x: centerX, y: bounds.maxY },
          { x: bounds.minX, y: centerY },
        ]
      : []),
  ];

  const texts = boxGuideDimensionTexts(width, height, calibration, displayUnit, decimalPlaces);
  const offset = metrics.boxGuideDimensionOffsetScreenPx / zoom;
  const labelFontScreenPx = metrics.boxGuideDimensionFontSizeScreenPx;

  function dimensionLabel(key: string, text: string, anchor: "below" | "right", x: number, y: number) {
    // Estimated size (no Konva node is created per pointer move): digits and most units
    // are close to 0.56 em wide in the label font, which is accurate enough to center.
    const paddingScreenPx = metrics.labelPaddingScreenPx;
    const estimatedWidth = (text.length * labelFontScreenPx * 0.56 + paddingScreenPx * 2) / zoom;
    const estimatedHeight = (labelFontScreenPx * 1.2 + paddingScreenPx * 2) / zoom;
    const labelX = anchor === "below" ? x - estimatedWidth / 2 : x;
    const labelY = anchor === "below" ? y : y - estimatedHeight / 2;
    return (
      <Label key={key} name={`box-guide-dimension-${key}`} x={labelX} y={labelY} listening={false}>
        <Tag
          fill={roles.labelBackground}
          opacity={0.82}
          cornerRadius={metrics.labelCornerRadiusScreenPx / zoom}
        />
        <Text
          text={text}
          fill={roles.labelText}
          fontFamily={metrics.fontFamily}
          fontSize={labelFontScreenPx / zoom}
          padding={metrics.labelPaddingScreenPx / zoom}
        />
      </Label>
    );
  }

  return (
    <>
      {type === "ellipse" && (
        <>
          <Line
            name="box-guide-bounds"
            points={[
              bounds.minX, bounds.minY, bounds.maxX, bounds.minY,
              bounds.maxX, bounds.maxY, bounds.minX, bounds.maxY,
            ]}
            closed
            stroke={roles.drawingDraftStroke}
            strokeWidth={hairline}
            opacity={metrics.boxGuideOpacity}
            listening={false}
          />
          <Line
            name="box-guide-axis-horizontal"
            points={[bounds.minX, centerY, bounds.maxX, centerY]}
            stroke={roles.drawingDraftStroke}
            strokeWidth={hairline}
            opacity={metrics.boxGuideAxisOpacity}
            listening={false}
          />
          <Line
            name="box-guide-axis-vertical"
            points={[centerX, bounds.minY, centerX, bounds.maxY]}
            stroke={roles.drawingDraftStroke}
            strokeWidth={hairline}
            opacity={metrics.boxGuideAxisOpacity}
            listening={false}
          />
          <Line
            name="box-guide-center-cross"
            points={[
              centerX - crossHalf, centerY, centerX + crossHalf, centerY,
            ]}
            stroke={roles.drawingDraftStroke}
            strokeWidth={hairline}
            opacity={metrics.boxGuideOpacity}
            listening={false}
          />
          <Line
            name="box-guide-center-cross"
            points={[centerX, centerY - crossHalf, centerX, centerY + crossHalf]}
            stroke={roles.drawingDraftStroke}
            strokeWidth={hairline}
            opacity={metrics.boxGuideOpacity}
            listening={false}
          />
        </>
      )}
      {handles.map((handle, index) => (
        <Rect
          key={index}
          name="box-guide-handle"
          x={handle.x - handleSize / 2}
          y={handle.y - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill={roles.handleFill}
          stroke={roles.drawingDraftStroke}
          strokeWidth={metrics.boxGuideHandleStrokeScreenPx / zoom}
          listening={false}
        />
      ))}
      {showSeparateDimensions ? (
        <>
          {dimensionLabel("width", texts.width, "below", centerX, bounds.maxY + offset)}
          {dimensionLabel("height", texts.height, "right", bounds.maxX + offset, centerY)}
        </>
      ) : (
        dimensionLabel(
          "size",
          `${texts.width} × ${texts.height}`,
          "below",
          centerX,
          bounds.maxY + offset,
        )
      )}
    </>
  );
}
