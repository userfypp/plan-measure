import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeVariant = "neutral" | "info" | "warning" | "success" | "danger";

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = "neutral", className, children, ...badgeProps }: BadgeProps) {
  return (
    <span
      {...badgeProps}
      className={[styles.badge, styles[variant], className].filter(Boolean).join(" ")}
    >
      {children}
    </span>
  );
}
