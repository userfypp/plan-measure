import { EyeIcon, type EyeState } from "../../components/ui";
import styles from "./VisibilityIcon.module.css";

export type VisibilityState = EyeState;

/** The eye used by rows and group headers. */
export function VisibilityIcon({ state }: { state: VisibilityState }) {
  return <EyeIcon className={styles.icon} state={state} />;
}
