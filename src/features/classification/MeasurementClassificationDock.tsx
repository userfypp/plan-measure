import type { ClassificationCatalog, Measurement } from "../../types/domain";
import { ClassificationAssignment } from "./ClassificationAssignment";
import styles from "./MeasurementClassificationDock.module.css";

export interface MeasurementClassificationDockProps {
  measurement: Measurement | null;
  catalog: ClassificationCatalog;
  onAssign: (measurementId: string, dimensionId: string, valueId: string | null) => void;
  disabled?: boolean;
}

export function MeasurementClassificationDock({
  measurement,
  catalog,
  onAssign,
  disabled = false,
}: MeasurementClassificationDockProps) {
  return (
    <section className={styles.dock} aria-label="Measurement classification">
      {measurement ? (
        <>
          <h3 className={styles.title}>{measurement.name}</h3>
          <ClassificationAssignment
            measurementId={measurement.id}
            appliedValueIds={measurement.classificationValueIds}
            catalog={catalog}
            onAssign={onAssign}
            disabled={disabled}
            compact
          />
        </>
      ) : (
        <p className={styles.empty}>Select a measurement to assign classifications.</p>
      )}
    </section>
  );
}
