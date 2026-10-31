import { Suspense, useEffect, useState, type ReactNode } from "react";
import { IconButton } from "../components/ui";
import { useShortcutAria, useShortcutLabel } from "../utils/shortcuts/store";
import { recoverableLazy } from "./recoverableLazy";
import { retryableImport } from "./retryableImport";
import type { SettingsDialogProps, SettingsSectionId } from "./SettingsDialog";
import { subscribeSettingsDialogRequests } from "./settingsDialogRequest";

const loadSettingsDialog = retryableImport(() =>
  import("./SettingsDialog").then((module) => ({ default: module.SettingsDialog })),
);
const LazySettingsDialog = recoverableLazy(loadSettingsDialog, "Settings");
export const preloadSettingsDialog = () => LazySettingsDialog.preload().catch(() => undefined);

export interface SettingsButtonProps extends Omit<
  SettingsDialogProps,
  "onClose" | "initialSection"
> {
  trigger: ReactNode;
  triggerClassName?: string;
  /** Borderless at rest, for a trigger grouped in a bar. */
  triggerQuiet?: boolean;
}

/** Eager trigger; the dialog and its sections load on first use to keep the startup bundle small. */
export function SettingsButton({
  trigger,
  triggerClassName,
  triggerQuiet,
  ...dialogProps
}: SettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [initialSection, setInitialSection] = useState<SettingsSectionId | undefined>();
  const shortcut = useShortcutLabel("app.settings");
  const keyShortcuts = useShortcutAria("app.settings");
  useEffect(
    () =>
      subscribeSettingsDialogRequests((section) => {
        setInitialSection(section);
        setOpen(true);
      }),
    [],
  );
  return (
    <>
      <IconButton
        quiet={triggerQuiet}
        className={triggerClassName}
        icon={trigger}
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts={keyShortcuts || undefined}
        tooltip={shortcut ? `Settings (${shortcut})` : "Settings"}
        tooltipPosition="bottom"
        onPointerEnter={preloadSettingsDialog}
        onFocus={preloadSettingsDialog}
        onClick={() => {
          setInitialSection(undefined);
          setOpen(true);
        }}
      />
      {open && (
        <Suspense fallback={null}>
          <LazySettingsDialog
            {...dialogProps}
            initialSection={initialSection}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
