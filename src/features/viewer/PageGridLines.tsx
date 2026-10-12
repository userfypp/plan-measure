import { useMemo } from "react";
import { Shape } from "react-konva";
import type { PageGrid } from "../../utils/appPreferences";
import { pageGridLines } from "./pageGrid";

interface PageGridLinesProps {
  grid: Exclude<PageGrid, "off">;
  zoom: number;
  width: number;
  height: number;
}

/** Faint non-interactive grid over the page: one Shape, one path, only mounted while active. */
export function PageGridLines({ grid, zoom, width, height }: PageGridLinesProps) {
  const segments = useMemo(() => {
    const { vertical, horizontal } = pageGridLines(grid, zoom, width, height);
    return [...vertical, ...horizontal];
  }, [grid, zoom, width, height]);
  if (segments.length === 0) return null;
  return (
    <Shape
      name="page-grid"
      listening={false}
      stroke="#6b7280"
      strokeWidth={1 / zoom}
      opacity={0.35}
      sceneFunc={(context, shape) => {
        context.beginPath();
        for (let index = 0; index < segments.length; index += 4) {
          context.moveTo(segments[index]!, segments[index + 1]!);
          context.lineTo(segments[index + 2]!, segments[index + 3]!);
        }
        context.strokeShape(shape);
      }}
    />
  );
}
