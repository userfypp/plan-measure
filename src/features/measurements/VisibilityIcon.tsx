import styles from "./VisibilityIcon.module.css";

export type VisibilityState = "visible" | "hidden" | "mixed";

/** The eye used by rows and group headers; `mixed` shows a dash instead of the pupil. */
export function VisibilityIcon({ state }: { state: VisibilityState }) {
  return (
    <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M2.08 10s2.71 -4.38 7.92 -4.38S17.92 10 17.92 10 15.21 14.38 10 14.38 2.08 10 2.08 10Z" />
      {state === "mixed" ? <path d="M7.92 10h4.17" /> : <circle cx="10" cy="10" r="2.08" />}
      {state === "hidden" && <path d="m3.33 3.33 13.33 13.33" />}
    </svg>
  );
}
