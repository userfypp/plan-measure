import { Button } from "../../components/ui";
import styles from "./MeasurementsHeader.module.css";

export interface MeasurementsHeaderProps {
  dimensions: readonly { id: string; name: string; archived: boolean }[];
  groupByDimensionIds: readonly string[];
  onGroupByDimensionsChange: (dimensionIds: string[]) => void;
}

export function MeasurementsHeader({
  dimensions,
  groupByDimensionIds,
  onGroupByDimensionsChange,
}: MeasurementsHeaderProps) {
  if (dimensions.length === 0) return null;

  function changeDimension(index: number, dimensionId: string) {
    if (!dimensionId) {
      onGroupByDimensionsChange(groupByDimensionIds.filter((_, position) => position !== index));
      return;
    }
    const next = [...groupByDimensionIds];
    const previousIndex = next.indexOf(dimensionId);
    if (previousIndex >= 0) {
      if (index === next.length) return;
      next[previousIndex] = next[index]!;
    }
    next[index] = dimensionId;
    onGroupByDimensionsChange(next);
  }

  return (
    <header className={styles.header}>
      {Array.from({ length: Math.min(groupByDimensionIds.length + 1, dimensions.length) }, (_, index) => (
        <div className={styles.row} key={index}>
          <label className={styles.groupBy}>
            <span>{index === 0 ? "Group by" : "Then by"}</span>
            <select
              value={groupByDimensionIds[index] ?? ""}
              data-viewer-shortcuts="enabled"
              onChange={(event) => changeDimension(index, event.target.value)}
            >
              <option value="">None</option>
              {dimensions
                .filter(
                  (dimension) =>
                    index < groupByDimensionIds.length || !groupByDimensionIds.includes(dimension.id),
                )
                .map((dimension) => (
                  <option key={dimension.id} value={dimension.id}>
                    {dimension.name}
                    {dimension.archived ? " (archived)" : ""}
                  </option>
                ))}
            </select>
          </label>
          {index === 0 && groupByDimensionIds.length > 0 && (
            <Button
              variant="ghost"
              size="compact"
              aria-label="Clear all grouping"
              onClick={() => onGroupByDimensionsChange([])}
            >
              Clear all
            </Button>
          )}
        </div>
      ))}
    </header>
  );
}
