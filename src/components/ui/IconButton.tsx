import type { ButtonHTMLAttributes, ReactNode } from "react";
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
}

export function IconButton({
  icon,
  tooltip,
  pressed,
  tone = "neutral",
  disabled = false,
  type = "button",
  className,
  ...buttonProps
}: IconButtonProps) {
  const button = (
    <button
      {...buttonProps}
      type={type}
      className={[styles.button, styles[tone], pressed ? styles.pressed : "", className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      aria-pressed={pressed}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );

  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
}
