import type { SettingsSectionId } from "./SettingsDialog";

type SettingsDialogRequestListener = (section: SettingsSectionId | undefined) => void;

const listeners = new Set<SettingsDialogRequestListener>();

/** Asks the single Settings button to open its dialog, on `section` when given. */
export function requestSettingsDialog(section?: SettingsSectionId): void {
  listeners.forEach((listener) => listener(section));
}

export function subscribeSettingsDialogRequests(listener: SettingsDialogRequestListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
