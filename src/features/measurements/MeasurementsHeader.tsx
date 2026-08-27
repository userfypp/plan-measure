import styles from "./MeasurementsHeader.module.css";

export interface MeasurementsHeaderProps {
  count: number;
  dimensions: readonly { id: string; name: string; archived: boolean }[];
  groupByDimensionId: string | null;
  onGroupByDimensionChange: (dimensionId: string | null) => void;
}

export function MeasurementsHeader({
  count,
  dimensions,
  groupByDimensionId,
  onGroupByDimensionChange,
}: MeasurementsHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.summary}>
        <h2 className={styles.title}>Measurements</h2>
        <span className={styles.count} aria-label={`${count} measurements`}>
          {count}
        </span>
      </div>
      {dimensions.length > 0 && (
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
      )}
    </header>
  );
}
