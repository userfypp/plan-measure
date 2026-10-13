import { Suspense, useState, type ReactNode } from "react";
import { IconButton } from "../components/ui";
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
      <IconButton
        className={triggerClassName}
        icon={trigger}
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        tooltip="Settings"
        tooltipPosition="bottom"
        onPointerEnter={() => void loadSettingsDialog().catch(() => undefined)}
        onFocus={() => void loadSettingsDialog().catch(() => undefined)}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Suspense fallback={null}>
          <LazySettingsDialog {...dialogProps} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
