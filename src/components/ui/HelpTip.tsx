import { Tooltip } from "./Tooltip";
import styles from "./HelpTip.module.css";

export interface HelpTipProps {
  /** Name of the thing explained; the button reads "About {label}". */
  label: string;
  /** The explanation: shown in the tooltip and kept in the DOM for assistive technology. */
  help: string;
  /** Id of the hidden copy of `help`, which the control it belongs to can reference. */
  helpId: string;
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.9 8c0-1.2.9-2 2.1-2s2.1.8 2.1 1.9c0 1.5-2.1 1.7-2.1 3.2M10 14.1v.1" />
    </svg>
  );
}

/**
 * A keyboard-reachable "?" that explains a setting without adding a line of text. The explanation is
 * also rendered visually hidden under `helpId`, so the control it belongs to can name it.
 */
export function HelpTip({ label, help, helpId }: HelpTipProps) {
  return (
    <>
      <Tooltip content={help} position="top" describeTrigger={false}>
        <button
          type="button"
          className={styles.helpButton}
          aria-label={`About ${label}`}
          aria-describedby={helpId}
        >
          <HelpIcon />
        </button>
      </Tooltip>
      <span id={helpId} className={styles.visuallyHidden}>
        {help}
      </span>
    </>
  );
}
