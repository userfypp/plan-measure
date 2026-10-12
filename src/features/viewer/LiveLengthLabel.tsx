import { Label, Tag, Text } from "react-konva";
import type {
  LogicalPageBounds,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
  Point,
} from "../../types/domain";
import { formatMeasurement } from "../../utils/format";
import {
  LABEL_BACKGROUND_OPACITY,
  LABEL_SIZE_SCALE,
  useAppPreferences,
  useNumberFormatKey,
} from "../../utils/appPreferences";
import { createLabelCollisionIndex } from "../../utils/labelLayout";
import {
  LABEL_PADDING_SCREEN_PX,
  MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX,
  averagePoint,
  measureLabelText,
  placeMeasurementLabel,
} from "./annotationLabelLayout";
import { CANVAS_VISUAL_METRICS, labelTextPaint, type CanvasVisualRoles } from "./canvasVisualRoles";

/** Nothing is ever inserted: the live label ignores other labels, like a lone final label. */
const EMPTY_LABEL_INDEX = createLabelCollisionIndex();

interface LiveLengthLabelProps {
  from: Point;
  to: Point;
  bounds: Pick<LogicalPageBounds, "width" | "height"> | null;
  zoom: number;
  roles: CanvasVisualRoles;
  calibration: PageCalibration | null;
  displayUnit: MeasurementDisplayUnit;
  decimalPlaces: MeasurementDecimalPlaces;
}

/** Non-interactive length of the draft segment being drawn, fixed in screen pixels. */
export function LiveLengthLabel({
  from,
  to,
  bounds,
  zoom,
  roles,
  calibration,
  displayUnit,
  decimalPlaces,
}: LiveLengthLabelProps) {
  useNumberFormatKey(); // re-render when separators change
  const { labelSize, labelBackground } = useAppPreferences();
  if (!bounds || !calibration || (from.x === to.x && from.y === to.y)) return null;
  const metrics = CANVAS_VISUAL_METRICS;
  const text = formatMeasurement(
    { type: "line", points: [from, to] },
    calibration,
    displayUnit,
    decimalPlaces,
  );
  const fontSize = MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX * LABEL_SIZE_SCALE[labelSize];
  const backgroundOpacity = LABEL_BACKGROUND_OPACITY[labelBackground];
  const points = [from, to];
  const placement = placeMeasurementLabel(
    "line",
    points,
    averagePoint(points),
    measureLabelText(text, fontSize, zoom),
    bounds,
    zoom,
    EMPTY_LABEL_INDEX,
  );
  return (
    <Label name="live-length-label" x={placement.x} y={placement.y} listening={false}>
      <Tag
        fill={roles.labelBackground}
        opacity={0.88 * backgroundOpacity}
        cornerRadius={metrics.labelCornerRadiusScreenPx / zoom}
      />
      <Text
        text={text}
        {...labelTextPaint(roles, backgroundOpacity, zoom)}
        fontFamily={metrics.fontFamily}
        fontSize={fontSize / zoom}
        padding={LABEL_PADDING_SCREEN_PX / zoom}
      />
    </Label>
  );
}
