import type { KeyboardEvent } from "react";
import { CLOUD_COLOR_PALETTE, resolveCloudColor } from "../../utils/cloudColors";
import styles from "./CloudColorPicker.module.css";

export interface CloudColorPickerProps {
  /** Current cloud color; an absent or unknown value shows the default red. */
  color: string | undefined;
  disabled?: boolean;
  onChange: (color: string) => void;
}

/** Accessible swatch radio group with roving focus (arrow keys move and select). */
export function CloudColorPicker({ color, disabled = false, onChange }: CloudColorPickerProps) {
  const current = resolveCloudColor(color);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step || disabled) return;
    event.preventDefault();
    const index = CLOUD_COLOR_PALETTE.findIndex((entry) => entry.value === current);
    const next =
      CLOUD_COLOR_PALETTE[
        (index + step + CLOUD_COLOR_PALETTE.length) % CLOUD_COLOR_PALETTE.length
      ]!;
    onChange(next.value);
    const swatches = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']");
    swatches[CLOUD_COLOR_PALETTE.indexOf(next)]?.focus();
  }

  return (
    <div
      className={styles.picker}
      role="radiogroup"
      aria-label="Cloud color"
      onKeyDown={handleKeyDown}
    >
      {CLOUD_COLOR_PALETTE.map((entry) => {
        const checked = entry.value === current;
        return (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={entry.label}
            title={entry.label}
            disabled={disabled}
            tabIndex={checked ? 0 : -1}
            className={styles.swatch}
            style={{ backgroundColor: entry.value }}
            onClick={() => onChange(entry.value)}
          />
        );
      })}
    </div>
  );
}
