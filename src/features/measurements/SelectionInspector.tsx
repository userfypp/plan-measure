import type { MeasurementViewModel } from "./measurementViewModels";
import { Badge } from "../../components/ui";
import styles from "./SelectionInspector.module.css";

export interface SelectionInspectorProps {
  measurement: MeasurementViewModel | null;
  classificationSummary?: string;
}

export function SelectionInspector({
  measurement,
  classificationSummary = "None assigned",
}: SelectionInspectorProps) {
  if (!measurement) {
    return (
      <section className={styles.inspector} aria-label="Selection inspector">
        <div className={styles.empty}>
          <h3 className={styles.title}>Inspector</h3>
          <p>Select a measurement to inspect its details.</p>
        </div>
      </section>
    );
  }

  const titleId = `measurement-inspector-title-${measurement.id}`;

  return (
    <section className={styles.inspector} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <h3 className={styles.title} id={titleId}>
          {measurement.name}
        </h3>
      </div>
      <dl className={styles.details}>
        <div>
          <dt>Type</dt>
          <dd>{measurement.typeLabel}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd className={styles.measurementValue} title={measurement.valueLabel}>
            {measurement.valueLabel.split(" · ").map((valuePart) => (
              <span key={valuePart}>{valuePart}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Scale / calibration</dt>
          <dd className={!measurement.hasCalibration ? styles.unavailable : ""}>
            {measurement.calibrationSummary}
          </dd>
        </div>
        <div>
          <dt>Classification</dt>
          <dd className={styles.classificationValue} title={classificationSummary}>
            <Badge
              className={styles.classificationBadge}
              variant={classificationSummary === "None assigned" ? "neutral" : "info"}
            >
              {classificationSummary}
            </Badge>
          </dd>
        </div>
      </dl>
    </section>
  );
}
