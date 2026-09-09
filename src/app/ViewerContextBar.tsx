import { Button } from "../components/ui";
import styles from "./ViewerContextBar.module.css";

export interface ViewerContextAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ViewerContextData {
  workflow: {
    label: string;
    tone: "neutral" | "active" | "warning";
  };
}

export function ViewerContextBar({
  context,
  actions = [],
}: {
  context: ViewerContextData;
  actions?: readonly ViewerContextAction[];
}) {
  if (context.workflow.tone === "neutral" && actions.length === 0) return null;

  return (
    <div className={styles.contextBar} aria-label="Viewer context">
      {context.workflow.tone !== "neutral" && (
        <div className={styles.contextItem}>
          <span className={`${styles.value} ${styles[context.workflow.tone]}`} role="status">
            {context.workflow.label}
          </span>
        </div>
      )}

      {actions.length > 0 && (
        <div className={styles.contextAction}>
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="secondary"
              size="compact"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
