import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./ChevronDownIcon";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  title: string;
  subtitle?: ReactNode;
  /** A figure kept at the end of the closed row; the opened body repeats it, so it leaves. */
  summary?: ReactNode;
  /** Icon buttons kept on the closed row, after the title. */
  actions?: ReactNode;
  /** Marks the item as the current choice with the selection surface. */
  selected?: boolean;
  defaultOpen?: boolean;
  /** Controls the open state from outside; leave it out and the item keeps its own. */
  open?: boolean;
  /** The body runs edge to edge: its content brings its own padding. */
  flush?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/**
 * A list item that opens in place. The header and the opened body are one surface: hovering the
 * header lights the whole item. Actions sit beside the toggle, never inside it.
 */
export function Disclosure({
  title,
  subtitle,
  summary,
  actions,
  selected = false,
  defaultOpen = false,
  open: controlledOpen,
  flush = false,
  onOpenChange,
  children,
}: DisclosureProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = controlledOpen ?? ownOpen;
  const bodyId = useId();
  function toggle() {
    if (controlledOpen === undefined) setOwnOpen(!open);
    onOpenChange?.(!open);
  }
  return (
    <div className={styles.root} data-selected={selected || undefined}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={toggle}
        >
          <ChevronDownIcon className={styles.chevron} />
          <span className={styles.titles}>
            <span className={styles.title} title={title}>
              {title}
            </span>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          </span>
          {!open && summary && <span className={styles.summary}>{summary}</span>}
        </button>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {open && (
        <div id={bodyId} className={styles.body} data-flush={flush || undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
