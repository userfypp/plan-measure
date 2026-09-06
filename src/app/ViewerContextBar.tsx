import { Button } from "../components/ui";
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
}

export function ViewerContextBar({
  context,
  action = null,
  onScaleChange,
}: {
  context: ViewerContextData;
  action?: ViewerContextAction | null;
  onScaleChange: (scaleId: string) => void;
}) {
  return (
    <div className={styles.contextBar} aria-label="Viewer context">
      <div className={styles.contextItem}>
        {context.scale ? (
          <div className={styles.scaleValue}>
            <span className={styles.selectWrapper}>
              <select
                aria-label="Active scale"
                value={context.scale.id}
                disabled={context.scale.disabled}
                onChange={(event) => onScaleChange(event.target.value)}
              >
                {context.scale.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </span>
            <small>{context.scale.modeLabel}</small>
          </div>
        ) : (
          <span className={`${styles.value} ${styles.warning}`} role="status">
            No active scale
          </span>
        )}
      </div>

      {context.workflow.tone !== "neutral" && (
        <div className={styles.contextItem}>
          <span className={`${styles.value} ${styles[context.workflow.tone]}`} role="status">
            {context.workflow.label}
          </span>
        </div>
      )}

      {action && (
        <div className={styles.contextAction}>
          <Button
            variant="secondary"
            size="compact"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
