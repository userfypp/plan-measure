import { useMemo } from "react";
import { Shape } from "react-konva";
import type { PageGrid } from "../../utils/appPreferences";
import { useCanvasVisualRoles } from "./canvasVisualRoles";
import { pageGridLines, type PageGridRange } from "./pageGrid";

interface PageGridLinesProps {
  grid: Exclude<PageGrid, "off">;
  zoom: number;
  width: number;
  height: number;
  /** Page area to cover, in page units; defaults to the whole page. */
  range?: PageGridRange;
}

/** Faint non-interactive grid over the page: one Shape, one path, only mounted while active. */
export function PageGridLines({ grid, zoom, width, height, range }: PageGridLinesProps) {
  const roles = useCanvasVisualRoles();
  const segments = useMemo(() => {
    const { vertical, horizontal } = pageGridLines(grid, zoom, width, height, range);
    return [...vertical, ...horizontal];
  }, [grid, zoom, width, height, range]);
  if (segments.length === 0) return null;
  return (
    <Shape
      name="page-grid"
      listening={false}
      stroke={roles.pageGrid}
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
