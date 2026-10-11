import { useCallback } from "react";
import { writeClassificationDeleteConfirmationPreference } from "./classificationDeletePreference";
import { writeMeasurementDeleteConfirmationPreference } from "./measurementDeletePreference";
import { writeRecoveredPlanStartupWorkspacePreference } from "./recoveredPlanStartupPreference";
import { writeKeyboardAuthoringPreference } from "./keyboardAuthoringPreference";

type RecoveredPlanStartupWorkspace = Parameters<
  typeof writeRecoveredPlanStartupWorkspacePreference
>[0];

interface AppPreferenceStateSetters {
  setKeyboardAuthoringEnabledState: (enabled: boolean) => void;
  setConfirmMeasurementDeletionState: (enabled: boolean) => void;
  setConfirmValueDeletionState: (enabled: boolean) => void;
  setConfirmDimensionDeletionState: (enabled: boolean) => void;
  setRecoveredPlanStartupWorkspaceState: (workspace: RecoveredPlanStartupWorkspace) => void;
}

export function useAppPreferenceSetters({
  setKeyboardAuthoringEnabledState,
  setConfirmMeasurementDeletionState,
  setConfirmValueDeletionState,
  setConfirmDimensionDeletionState,
  setRecoveredPlanStartupWorkspaceState,
}: AppPreferenceStateSetters) {
  const setKeyboardAuthoringEnabled = useCallback((enabled: boolean) => {
    setKeyboardAuthoringEnabledState(enabled);
    writeKeyboardAuthoringPreference(enabled);
  }, [setKeyboardAuthoringEnabledState]);

  const setConfirmMeasurementDeletion = useCallback((enabled: boolean) => {
    setConfirmMeasurementDeletionState(enabled);
    writeMeasurementDeleteConfirmationPreference(enabled);
  }, [setConfirmMeasurementDeletionState]);

  const setConfirmValueDeletion = useCallback((enabled: boolean) => {
    setConfirmValueDeletionState(enabled);
    writeClassificationDeleteConfirmationPreference("value", enabled);
  }, [setConfirmValueDeletionState]);

  const setConfirmDimensionDeletion = useCallback((enabled: boolean) => {
    setConfirmDimensionDeletionState(enabled);
    writeClassificationDeleteConfirmationPreference("dimension", enabled);
  }, [setConfirmDimensionDeletionState]);

  const setRecoveredPlanStartupWorkspace = useCallback(
    (workspace: RecoveredPlanStartupWorkspace) => {
      setRecoveredPlanStartupWorkspaceState(workspace);
      writeRecoveredPlanStartupWorkspacePreference(workspace);
    },
    [setRecoveredPlanStartupWorkspaceState],
  );

  return {
    setKeyboardAuthoringEnabled,
    setConfirmMeasurementDeletion,
    setConfirmValueDeletion,
    setConfirmDimensionDeletion,
    setRecoveredPlanStartupWorkspace,
  };
}
