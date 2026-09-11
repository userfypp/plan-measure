import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSecondary";
export type ButtonSize = "compact" | "regular";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabledReason?: string;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "primary",
  size = "regular",
  disabled = false,
  disabledReason,
  loading = false,
  type = "button",
  className,
  children,
  onClick,
  "aria-describedby": ariaDescribedBy,
  ...buttonProps
}: ButtonProps, ref) {
  const classNames = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
  const isDisabled = disabled || loading;
  const contextualDisabled = disabled && !loading && Boolean(disabledReason);
  const reasonId = useId();
  const describedBy = [ariaDescribedBy, contextualDisabled ? reasonId : ""].filter(Boolean).join(" ") || undefined;

  const button = (
    <button
      ref={ref}
      {...buttonProps}
      type={type}
      className={classNames}
      disabled={isDisabled && !contextualDisabled}
      aria-disabled={contextualDisabled || undefined}
      aria-describedby={describedBy}
      data-disabled={contextualDisabled || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (contextualDisabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.content}>{children}</span>
    </button>
  );

  return contextualDisabled ? (
    <span className={styles.disabledReasonOwner}>
      <Tooltip content={disabledReason!} delay={0} describeTrigger={false}>{button}</Tooltip>
      <span id={reasonId} className={styles.visuallyHidden}>{disabledReason}</span>
    </span>
  ) : button;
});
