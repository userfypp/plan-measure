import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSecondary";
export type ButtonSize = "compact" | "regular";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "primary",
  size = "regular",
  disabled = false,
  loading = false,
  type = "button",
  className,
  children,
  ...buttonProps
}: ButtonProps, ref) {
  const classNames = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      {...buttonProps}
      type={type}
      className={classNames}
      disabled={isDisabled}
      aria-busy={loading || undefined}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.content}>{children}</span>
    </button>
  );
});
