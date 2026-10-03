import { useState, type ReactNode } from "react";
import { ConfirmationDialog } from "../components/ui";
import {
  getActiveOverlay,
  useOverlayState,
  type OverlayConfirmation,
  type OverlayDialog,
} from "./overlayState";
import styles from "./OverlayHost.module.css";

export interface OverlayConfirmationOptions {
  dontAskAgain?: boolean;
}

export interface OverlayHostProps {
  onDialogConfirm?: (dialog: OverlayDialog) => void;
  onDialogCancel?: (dialog: OverlayDialog) => void;
  onConfirmationConfirm?: (
    confirmation: OverlayConfirmation,
    options?: OverlayConfirmationOptions,
  ) => void;
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
    const recoveryProtected = dialog.payload.recoveryProtected === true;
    return (
      <ConfirmationDialog
        open
        title={recoveryProtected ? "Replace unreadable session?" : "Open as a new project?"}
        description={
          recoveryProtected ? (
            <>
              Loading <strong>{fileName}</strong> will replace the saved session that could not be
              read.
            </>
          ) : (
            <>
              Loading <strong>{fileName}</strong> will save the current project and open a new one.
            </>
          )
        }
        intent={recoveryProtected ? "destructive" : "warning"}
        confirmLabel={recoveryProtected ? "Replace session" : "Open as new project"}
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
    if (confirmation.type === "deleteClassification") {
      const { target, name } = confirmation.payload;
      return (
        <DeleteConfirmation
          key={target}
          title={`Delete ${target} “${name}”?`}
          description={
            target === "dimension"
              ? "This dimension, all its values, and their assignments will be removed from the entire project. Measurements will be kept. You can undo this change."
              : "This value and its assignments will be removed from the entire project. Measurements will be kept. You can undo this change."
          }
          onCancel={() => {
            closeConfirmation(confirmation);
            onConfirmationCancel?.(confirmation);
          }}
          onConfirm={(dontAskAgain) => {
            closeConfirmation(confirmation);
            onConfirmationConfirm?.(confirmation, { dontAskAgain });
          }}
        />
      );
    }
    if (confirmation.type === "deleteMeasurement") {
      return (
        <DeleteConfirmation
          key="measurement"
          title={confirmation.payload.measurementIds ? `Delete ${confirmation.payload.measurementIds.length} ${confirmation.payload.measurementIds.length === 1 ? "measurement" : "measurements"}?` : `Delete “${confirmation.payload.measurementName}”?`}
          description={confirmation.payload.measurementIds ? "The selected measurements will be removed. You can undo this change." : "This measurement will be removed from the current page. Its geometry and scale data will not be changed."}
          onCancel={() => {
            closeConfirmation(confirmation);
            onConfirmationCancel?.(confirmation);
          }}
          onConfirm={(dontAskAgain) => {
            closeConfirmation(confirmation);
            onConfirmationConfirm?.(confirmation, { dontAskAgain });
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

    if (confirmation.type === "setScaleRatio") {
      const { calibrationName, measurementCount } = confirmation.payload;
      return (
        <ConfirmationDialog
          open
          title={`Set ratio for “${calibrationName}”?`}
          description={
            <>
              {measurementCount} {"measurement"}
              {measurementCount === 1 ? " uses" : "s use"} this scale. Their values will be
              recalculated using the new ratio. Geometry will stay in place.
            </>
          }
          confirmLabel="Set ratio"
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

function DeleteConfirmation({
  title,
  description,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  description: ReactNode;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  return (
    <ConfirmationDialog
      open
      title={title}
      description={description}
      intent="destructive"
      confirmLabel="Delete"
      onCancel={onCancel}
      onConfirm={() => onConfirm(dontAskAgain)}
    >
      <label className={styles.deletePreference}>
        <input
          type="checkbox"
          checked={dontAskAgain}
          onChange={(event) => setDontAskAgain(event.target.checked)}
        />
        <span>Don’t ask again</span>
      </label>
    </ConfirmationDialog>
  );
}
