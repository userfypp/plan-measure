import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from "react";
import styles from "./Textarea.module.css";

type TextareaElementProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
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

export type TextareaProps = TextareaElementProps &
  AccessibleNameProps & {
    error?: ReactNode;
    description?: ReactNode;
  };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    id,
    label,
    error,
    description,
    disabled = false,
    className,
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...textareaProps
  },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const descriptionId = `${textareaId}-description`;
  const errorId = `${textareaId}-error`;
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
    throw new Error("Textarea requires a label, aria-label, or aria-labelledby.");
  }

  return (
    <div className={styles.field}>
      {label != null && (
        <label className={styles.label} htmlFor={textareaId}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        {...textareaProps}
        id={textareaId}
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
});
