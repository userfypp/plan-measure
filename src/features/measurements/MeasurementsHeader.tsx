import styles from "./MeasurementsHeader.module.css";

export interface MeasurementsHeaderProps {
  dimensions: readonly { id: string; name: string; archived: boolean }[];
  groupByDimensionId: string | null;
  onGroupByDimensionChange: (dimensionId: string | null) => void;
}

export function MeasurementsHeader({
  dimensions,
  groupByDimensionId,
  onGroupByDimensionChange,
}: MeasurementsHeaderProps) {
  if (dimensions.length === 0) return null;

  return (
    <header className={styles.header}>
      <label className={styles.groupBy}>
        <span>Group by</span>
        <select
          value={groupByDimensionId ?? ""}
          data-viewer-shortcuts="enabled"
          onChange={(event) => onGroupByDimensionChange(event.target.value || null)}
        >
          <option value="">None</option>
          {dimensions.map((dimension) => (
            <option key={dimension.id} value={dimension.id}>
              {dimension.name}
              {dimension.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
