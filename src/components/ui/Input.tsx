import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { IconButton } from "./IconButton";
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
    /** Icon buttons that act on the field, shown beside the control. */
    trailing?: ReactNode;
    /** A glyph inside the field's start; the text moves past it. */
    leading?: ReactNode;
    /** Shows one clear button inside the field's end while it has text; it replaces the browser's own. */
    onClear?: () => void;
  };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    error,
    description,
    trailing,
    leading,
    onClear,
    disabled = false,
    className,
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...inputProps
  },
  ref,
) {
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

  const control = (
    <input
      ref={ref}
      {...inputProps}
      id={inputId}
      className={[
        styles.control,
        onClear ? styles.clearable : "",
        leading ? styles.hasLeading : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-invalid={hasError || inputProps["aria-invalid"] || undefined}
      aria-describedby={describedBy || undefined}
    />
  );

  const showClear = onClear && !disabled && Boolean(inputProps.value);
  const field =
    onClear || leading ? (
      <div className={styles.clearAnchor}>
        {leading && <span className={styles.leading}>{leading}</span>}
        {control}
        {/* Laid over the field, never `trailing`: mounting it later would remount the input. */}
        {showClear && (
          <span className={styles.clear}>
            <IconButton
              quiet
              icon={<CloseIcon />}
              aria-label="Clear search"
              tooltip="Clear search"
              onClick={onClear}
            />
          </span>
        )}
      </div>
    ) : (
      control
    );

  return (
    <div className={styles.field}>
      {label != null && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      {trailing ? (
        <div className={styles.row}>
          {field}
          <div className={styles.trailing}>{trailing}</div>
        </div>
      ) : (
        field
      )}
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
