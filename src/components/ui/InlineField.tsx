import type { FormEventHandler, ReactNode } from "react";
import { Input, type InputProps } from "./Input";
import styles from "./InlineField.module.css";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type InlineFieldProps = DistributiveOmit<InputProps, "onSubmit" | "trailing"> & {
  /** Icon buttons beside the field; the submit one has `type="submit"`. */
  actions: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  formLabel?: string;
  /** `row` is the add-row that closes a list: padded to the list rows, with a top divider. */
  variant?: "inline" | "row";
};

/** One field plus its icon actions on a single line: create, rename and add-value forms. */
export function InlineField({
  actions,
  onSubmit,
  formLabel,
  variant = "inline",
  ...inputProps
}: InlineFieldProps) {
  return (
    <form
      className={[styles.form, variant === "row" ? styles.row : ""].filter(Boolean).join(" ")}
      aria-label={formLabel}
      onSubmit={onSubmit}
    >
      <Input {...(inputProps as InputProps)} trailing={actions} />
    </form>
  );
}
