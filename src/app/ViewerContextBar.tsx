import styles from "./ViewerContextBar.module.css";

export interface ViewerContextAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ViewerContextData {
  scale: {
    id: string;
    name: string;
    modeLabel: string;
    options: Array<{ id: string; name: string }>;
    disabled?: boolean;
  } | null;
  workflow: {
    label: string;
    tone: "neutral" | "active" | "warning";
  };
  selection: {
    name: string;
    typeLabel: string;
  } | null;
}

export function ViewerContextBar({
  context,
  onScaleChange,
}: {
  context: ViewerContextData;
  onScaleChange: (scaleId: string) => void;
}) {
  return (
    <div className={styles.contextBar} aria-label="Viewer context">
      <div className={styles.contextItem}>
        <span className={styles.label}>Scale</span>
        {context.scale ? (
          <div className={styles.scaleValue}>
            <select
              aria-label="Active scale"
              value={context.scale.id}
              disabled={context.scale.disabled}
              onChange={(event) => onScaleChange(event.target.value)}
            >
              {context.scale.options.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
            <small>{context.scale.modeLabel}</small>
          </div>
        ) : (
          <span className={`${styles.value} ${styles.warning}`} role="status">
            No active scale
          </span>
        )}
      </div>

      <div className={styles.contextItem}>
        <span className={styles.label}>Workflow</span>
        <span
          className={`${styles.value} ${styles[context.workflow.tone]}`}
          role="status"
          title={context.workflow.label}
        >
          {context.workflow.label}
        </span>
      </div>

      <div className={`${styles.contextItem} ${styles.selectionItem}`}>
        <span className={styles.label}>Selection</span>
        {context.selection ? (
          <span className={styles.value} title={context.selection.name}>
            <strong>{context.selection.name}</strong>
            <small>{context.selection.typeLabel}</small>
          </span>
        ) : (
          <span className={`${styles.value} ${styles.neutral}`}>None selected</span>
        )}
      </div>
    </div>
  );
}
