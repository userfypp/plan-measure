import { useSyncExternalStore } from "react";
import { Line } from "react-konva";
import type { ScaleCheckStore } from "../calibration/scaleCheckState";

export function ScaleCheckLine({
  store,
  pageNumber,
  zoom,
  stroke,
}: {
  store: ScaleCheckStore;
  pageNumber: number;
  zoom: number;
  stroke: string;
}) {
  const check = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (!check?.points || check.pageNumber !== pageNumber) return null;
  return (
    <Line
      points={check.points.flatMap(({ x, y }) => [x, y])}
      stroke={stroke}
      strokeWidth={2 / zoom}
      dash={[6 / zoom, 4 / zoom]}
      listening={false}
    />
  );
}
