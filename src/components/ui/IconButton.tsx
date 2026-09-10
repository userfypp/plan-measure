import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  icon: ReactNode;
  "aria-label": string;
  tooltip?: ReactNode;
  pressed?: boolean;
  tone?: "neutral" | "danger";
  disabledReason?: string;
}

export function IconButton({
  icon,
  tooltip,
  pressed,
  tone = "neutral",
  disabled = false,
  disabledReason,
  type = "button",
  className,
  onClick,
  ...buttonProps
}: IconButtonProps) {
  const contextualDisabled = disabled && Boolean(disabledReason);
  const reasonId = useId();
  const describedBy = [buttonProps["aria-describedby"], contextualDisabled ? reasonId : ""]
    .filter(Boolean)
    .join(" ") || undefined;
  const button = (
    <button
      {...buttonProps}
      type={type}
      className={[styles.button, styles[tone], pressed ? styles.pressed : "", className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled && !contextualDisabled}
      aria-disabled={contextualDisabled || undefined}
      aria-describedby={describedBy}
      data-disabled={contextualDisabled || undefined}
      aria-pressed={pressed}
      onClick={(event) => {
        if (contextualDisabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );

  const tooltipContent = contextualDisabled ? disabledReason : tooltip;
  if (contextualDisabled) {
    return (
      <span className={styles.disabledReasonOwner}>
        <Tooltip content={tooltipContent!} delay={0} describeTrigger={false}>{button}</Tooltip>
        <span id={reasonId} className={styles.visuallyHidden}>{disabledReason}</span>
      </span>
    );
  }
  return tooltipContent ? <Tooltip content={tooltipContent}>{button}</Tooltip> : button;
}
