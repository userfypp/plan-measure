import { ConfirmationDialog } from "../components/ui";
import {
  getActiveOverlay,
  useOverlayState,
  type OverlayConfirmation,
  type OverlayDialog,
} from "./overlayState";

export interface OverlayHostProps {
  onDialogConfirm?: (dialog: OverlayDialog) => void;
  onDialogCancel?: (dialog: OverlayDialog) => void;
  onConfirmationConfirm?: (confirmation: OverlayConfirmation) => void;
  onConfirmationCancel?: (confirmation: OverlayConfirmation) => void;
}

/**
 * Renders the highest-priority overlay descriptor and routes user decisions
 * back to the app coordinator as intents. It owns no PDF, session, or domain
 * resources and keeps the existing accessible dialog primitives in use.
 */
export function OverlayHost({
  onDialogConfirm,
  onDialogCancel,
  onConfirmationConfirm,
  onConfirmationCancel,
}: OverlayHostProps) {
  const { state, closeDialog, closeConfirmation } = useOverlayState();
  const activeOverlay = getActiveOverlay(state);

  if (activeOverlay?.kind === "dialog" && activeOverlay.descriptor.type === "replacePdf") {
    const dialog = activeOverlay.descriptor;
    const fileName = dialog.payload.fileName ?? "the selected PDF";
    return (
      <ConfirmationDialog
        open
        title="Replace current PDF?"
        description={
          <>
            Loading <strong>{fileName}</strong> will replace the currently saved local session and
            all its measurements.
          </>
        }
        intent="destructive"
        confirmLabel="Replace PDF"
        onCancel={() => {
          closeDialog(dialog);
          onDialogCancel?.(dialog);
        }}
        onConfirm={() => {
          closeDialog(dialog);
          onDialogConfirm?.(dialog);
        }}
      />
    );
  }

  if (activeOverlay?.kind === "confirmation") {
    const confirmation = activeOverlay.descriptor;
    if (confirmation.type === "deleteMeasurement") {
      const { measurementName } = confirmation.payload;
      return (
        <ConfirmationDialog
          open
          title={`Delete “${measurementName}”?`}
          description="This measurement will be removed from the current page. Its geometry and scale data will not be changed."
          intent="destructive"
          confirmLabel="Delete measurement"
          onCancel={() => {
            closeConfirmation(confirmation);
            onConfirmationCancel?.(confirmation);
          }}
          onConfirm={() => {
            closeConfirmation(confirmation);
            onConfirmationConfirm?.(confirmation);
          }}
        />
      );
    }

    if (confirmation.type === "recalibrateScale") {
      const { calibrationName, measurementCount } = confirmation.payload;
      return (
        <ConfirmationDialog
          open
          title={`Recalibrate “${calibrationName}”?`}
          description={
            <>
              {measurementCount} {"measurement"}
              {measurementCount === 1 ? " uses" : "s use"} this scale. Their values will be
              recalculated using the new calibration. Geometry will stay in place.
            </>
          }
          confirmLabel="Recalibrate"
          onCancel={() => {
            closeConfirmation(confirmation);
            onConfirmationCancel?.(confirmation);
          }}
          onConfirm={() => {
            closeConfirmation(confirmation);
            onConfirmationConfirm?.(confirmation);
          }}
        />
      );
    }

    const { calibrationName, measurementCount } = confirmation.payload;
    return (
      <ConfirmationDialog
        open
        title={`Save reference-point changes for “${calibrationName}”?`}
        description={
          <>
            {measurementCount} {"measurement"}
            {measurementCount === 1 ? " uses" : "s use"} this scale. Their values will be
            recalculated. Geometry will stay in place.
          </>
        }
        confirmLabel="Save reference points"
        onCancel={() => {
          closeConfirmation(confirmation);
          onConfirmationCancel?.(confirmation);
        }}
        onConfirm={() => {
          closeConfirmation(confirmation);
          onConfirmationConfirm?.(confirmation);
        }}
      />
    );
  }

  return null;
}
