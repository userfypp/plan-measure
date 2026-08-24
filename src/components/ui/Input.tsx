import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./Input.module.css";

type InputElementProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "aria-label" | "aria-labelledby"
>;

type AccessibleLabel = Exclude<ReactNode, null | undefined | boolean>;

function hasContent(value: ReactNode): boolean {
  if (value == null || typeof value === "boolean") {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(hasContent);
  }

  return true;
}

type AccessibleNameProps =
  | {
      label: AccessibleLabel;
      "aria-label"?: never;
      "aria-labelledby"?: never;
    }
  | {
      label?: never;
      "aria-label": string;
      "aria-labelledby"?: never;
    }
  | {
      label?: never;
      "aria-label"?: never;
      "aria-labelledby": string;
    };

export type InputProps = InputElementProps &
  AccessibleNameProps & {
    error?: ReactNode;
    description?: ReactNode;
  };

export function Input({
  id,
  label,
  error,
  description,
  disabled = false,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...inputProps
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const hasDescription = hasContent(description);
  const hasError = hasContent(error);
  const describedBy = [
    ariaDescribedBy,
    hasDescription ? descriptionId : "",
    hasError ? errorId : "",
  ]
    .filter(Boolean)
    .join(" ");
  const hasAccessibleName =
    (typeof ariaLabel === "string" && ariaLabel.trim().length > 0) ||
    (typeof ariaLabelledBy === "string" && ariaLabelledBy.trim().length > 0) ||
    (typeof label === "string" ? label.trim().length > 0 : label != null);

  if (!hasAccessibleName) {
    throw new Error("Input requires a label, aria-label, or aria-labelledby.");
  }

  return (
    <div className={styles.field}>
      {label != null && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        {...inputProps}
        id={inputId}
        className={[styles.control, className].filter(Boolean).join(" ")}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy || undefined}
      />
      {hasDescription && (
        <p className={styles.description} id={descriptionId}>
          {description}
        </p>
      )}
      {hasError && (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
