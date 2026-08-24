import { MeasurementRow } from "./MeasurementRow";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementCollection.module.css";

export interface MeasurementCollectionProps {
  measurements: readonly (MeasurementViewModel & { selected: boolean })[];
  emptyMessage: string;
  onSelectMeasurement: (measurementId: string) => void;
  onRenameMeasurement: (measurementId: string, name: string) => void;
  onDeleteMeasurement: (measurementId: string) => void;
}

export function MeasurementCollection({
  measurements,
  emptyMessage,
  onSelectMeasurement,
  onRenameMeasurement,
  onDeleteMeasurement,
}: MeasurementCollectionProps) {
  if (measurements.length === 0) {
    return (
      <section className={styles.collection} aria-label="Measurement collection">
        <p className={styles.empty}>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className={styles.collection} aria-label="Measurement collection">
      <div className={styles.list} role="list" aria-label="Measurements on current page">
        {measurements.map((measurement) => (
          <MeasurementRow
            key={measurement.id}
            viewModel={measurement}
            onSelectMeasurement={onSelectMeasurement}
            onRenameMeasurement={onRenameMeasurement}
            onDeleteMeasurement={onDeleteMeasurement}
          />
        ))}
      </div>
    </section>
  );
}
