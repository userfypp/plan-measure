import { Suspense, useState, type ReactNode } from "react";
import { recoverableLazy } from "./recoverableLazy";
import { retryableImport } from "./retryableImport";
import type { SettingsDialogProps } from "./SettingsDialog";

const loadSettingsDialog = retryableImport(() =>
  import("./SettingsDialog").then((module) => ({ default: module.SettingsDialog })),
);
const LazySettingsDialog = recoverableLazy(loadSettingsDialog, "Settings");

export interface SettingsButtonProps extends Omit<SettingsDialogProps, "onClose"> {
  trigger: ReactNode;
  triggerClassName?: string;
}

/** Eager trigger; the dialog and its sections load on first use to keep the startup bundle small. */
export function SettingsButton({ trigger, triggerClassName, ...dialogProps }: SettingsButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Settings"
        onPointerEnter={() => void loadSettingsDialog().catch(() => undefined)}
        onFocus={() => void loadSettingsDialog().catch(() => undefined)}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </button>
      {open && (
        <Suspense fallback={null}>
          <LazySettingsDialog {...dialogProps} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
