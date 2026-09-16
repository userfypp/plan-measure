import type { InputHTMLAttributes } from "react";
import styles from "./Switch.module.css";

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "role" | "checked" | "onChange"
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ checked, onChange, className, ...inputProps }: SwitchProps) {
  return (
    <input
      {...inputProps}
      type="checkbox"
      role="switch"
      checked={checked}
      className={[styles.switch, className].filter(Boolean).join(" ")}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
