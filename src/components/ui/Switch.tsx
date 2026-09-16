import type { InputHTMLAttributes } from "react";
import styles from "./Switch.module.css";

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "role" | "checked" | "onChange"
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ checked, onChange, className, disabled, ...inputProps }: SwitchProps) {
  return (
    <label className={styles.target} data-disabled={disabled || undefined} data-switch-target>
      <input
        {...inputProps}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        className={[styles.input, className].filter(Boolean).join(" ")}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.track} data-switch-track aria-hidden="true" />
    </label>
  );
}
