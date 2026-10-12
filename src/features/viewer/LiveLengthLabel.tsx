import { Label, Tag, Text } from "react-konva";
import type {
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
  Point,
} from "../../types/domain";
import { formatMeasurement } from "../../utils/format";
import { useNumberFormatKey } from "../../utils/appPreferences";
import { CANVAS_VISUAL_METRICS, type CanvasVisualRoles } from "./canvasVisualRoles";

interface LiveLengthLabelProps {
  from: Point;
  to: Point;
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
  zoom,
  roles,
  calibration,
  displayUnit,
  decimalPlaces,
}: LiveLengthLabelProps) {
  useNumberFormatKey(); // re-render when separators change
  if (!calibration || (from.x === to.x && from.y === to.y)) return null;
  const metrics = CANVAS_VISUAL_METRICS;
  const text = formatMeasurement(
    { type: "line", points: [from, to] },
    calibration,
    displayUnit,
    decimalPlaces,
  );
  const offset = metrics.boxGuideDimensionOffsetScreenPx / zoom;
  return (
    <Label
      name="live-length-label"
      x={(from.x + to.x) / 2 + offset}
      y={(from.y + to.y) / 2 + offset}
      listening={false}
    >
      <Tag
        fill={roles.labelBackground}
        opacity={0.82}
        cornerRadius={metrics.labelCornerRadiusScreenPx / zoom}
      />
      <Text
        text={text}
        fill={roles.labelText}
        fontFamily={metrics.fontFamily}
        fontSize={metrics.boxGuideDimensionFontSizeScreenPx / zoom}
        padding={metrics.labelPaddingScreenPx / zoom}
      />
    </Label>
  );
}
