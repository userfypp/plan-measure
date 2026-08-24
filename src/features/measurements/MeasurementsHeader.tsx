import styles from "./MeasurementsHeader.module.css";

export interface MeasurementsHeaderProps {
  count: number;
}

export function MeasurementsHeader({ count }: MeasurementsHeaderProps) {
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>Measurements</h2>
      <span className={styles.count} aria-label={`${count} measurements`}>
        {count}
      </span>
    </header>
  );
}
