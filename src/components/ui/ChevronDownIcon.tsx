import styles from "./ChevronDownIcon.module.css";

/** The one dropdown arrow: every select, menu and popover trigger uses it. */
export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(" ")}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}
