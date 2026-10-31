import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, type TooltipPosition } from "./Tooltip";
import styles from "./IconButton.module.css";

/** `title` is excluded: hints go through `tooltip` so every bubble shares one style. */
export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children" | "title"
> {
  icon: ReactNode;
  "aria-label": string;
  tooltip?: ReactNode;
  tooltipPosition?: TooltipPosition;
  pressed?: boolean;
  /** Borderless at rest, for buttons grouped in a bar; hover, press and selection draw the border. */
  quiet?: boolean;
  tone?: "neutral" | "primary" | "danger";
  disabledReason?: string;
}

export function IconButton({
  icon,
  tooltip,
  tooltipPosition,
  pressed,
  quiet = false,
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
  const describedBy =
    [buttonProps["aria-describedby"], contextualDisabled ? reasonId : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const button = (
    <button
      {...buttonProps}
      type={type}
      className={[
        styles.button,
        styles[tone],
        pressed ? styles.pressed : "",
        quiet ? styles.quiet : "",
        className,
      ]
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
        <Tooltip
          content={tooltipContent!}
          position={tooltipPosition}
          delay={0}
          describeTrigger={false}
        >
          {button}
        </Tooltip>
        <span id={reasonId} hidden>
          {disabledReason}
        </span>
      </span>
    );
  }
  return tooltipContent ? (
    <Tooltip content={tooltipContent} position={tooltipPosition}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
