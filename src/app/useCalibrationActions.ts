import type { MutableRefObject } from "react";
import type { MeasurementDeleteRequest } from "../features/measurements/MeasurementPanel";
import type { createScaleCheckStore } from "../features/calibration/scaleCheckState";
import type { AuthoringCapability } from "../features/viewer/AuthoringCapability";
import {
  createStandardScalePreset,
  type StandardScalePresetRatio,
} from "../features/calibration/standardScalePresets";
import {
  fitCalibrationReferencesToPage,
  type RatioCalibrationInput,
} from "../features/calibration/ratioCalibration";
import type {
  CalibrationReferenceKey,
  LogicalPageBounds,
  PageCalibration,
  PageState,
  Tool,
} from "../types/domain";
import {
  defaultCalibrationName,
  findPageCalibration,
  getActiveCalibration,
  isValidCalibrationReferenceEdit,
} from "../utils/calibration";
import { isMeasurementType, measurementTypeRequiresScale } from "../utils/geometry";
import { calibrationMeasurementCount, calibrationReferenceEditPreview } from "./appDerivations";
import { beginCalibrationFlow } from "./calibrationFlow";
import {
  beginCalibrationReferenceEdit as createCalibrationReferenceEdit,
  type CalibrationReferenceEdit,
} from "./calibrationReferenceEdit";
import type { OverlayConfirmation, useOverlayState } from "./overlayState";
import type { useSessionState } from "./sessionState";
import type { useWorkspaceState } from "./workspaceState";

type SessionState = ReturnType<typeof useSessionState>;
type WorkspaceState = ReturnType<typeof useWorkspaceState>;
type OverlayState = ReturnType<typeof useOverlayState>;

interface CalibrationActionsContext {
  scaleCheckStore: ReturnType<typeof createScaleCheckStore>;
  calibrationReferenceEdit: WorkspaceState["calibrationReferenceEdit"];
  calibrationFlow: WorkspaceState["calibrationFlow"];
  session: SessionState["session"];
  setError: (message: string | null) => void;
  precisionAuthoringBlocked: boolean;
  clearDraft: WorkspaceState["clearDraft"];
  selectedMeasurementId: WorkspaceState["selectedMeasurementId"];
  chooseWorkspaceTool: WorkspaceState["chooseTool"];
  clearError: () => void;
  cancelWorkspaceCalibration: WorkspaceState["cancelCalibration"];
  focusViewer: () => void;
  authoringCapabilityRef: MutableRefObject<AuthoringCapability | null>;
  startCalibration: WorkspaceState["startCalibration"];
  currentPage: PageState | undefined;
  viewerPageBounds: { pageNumber: number; bounds: LogicalPageBounds } | null;
  addCalibration: SessionState["addCalibration"];
  openSetScaleRatioConfirmation: OverlayState["requestSetScaleRatio"];
  recalibrateCalibration: SessionState["recalibrateCalibration"];
  openRecalibrationConfirmation: OverlayState["requestRecalibration"];
  removeClassificationValue: SessionState["removeClassificationValue"];
  assignClassificationValue: SessionState["assignClassificationValue"];
  startReferenceEdit: WorkspaceState["startReferenceEdit"];
  closeConfirmation: OverlayState["closeConfirmation"];
  clearSelection: WorkspaceState["clearSelection"];
  updateReferenceEdit: WorkspaceState["updateReferenceEdit"];
  cancelReferenceEdit: WorkspaceState["cancelReferenceEdit"];
  updateCalibration: SessionState["updateCalibration"];
  confirmReferenceEdit: WorkspaceState["confirmReferenceEdit"];
  openCalibrationReferenceEditConfirmation: OverlayState["requestSaveCalibrationReferenceEdit"];
  setConfirmDimensionDeletion: (enabled: boolean) => void;
  deleteClassificationDimension: SessionState["deleteClassificationDimension"];
  setConfirmValueDeletion: (enabled: boolean) => void;
  deleteClassificationValue: SessionState["deleteClassificationValue"];
  setConfirmMeasurementDeletion: (enabled: boolean) => void;
  editMeasurements: SessionState["editMeasurements"];
  performMeasurementDelete: (request: MeasurementDeleteRequest) => void;
  confirmScaleDeletion: boolean;
  setConfirmScaleDeletion: (enabled: boolean) => void;
  openDeleteScaleConfirmation: OverlayState["requestDeleteScale"];
  deleteCalibration: SessionState["deleteCalibration"];
}

// These actions are intentionally plain functions recreated on every render.
export function useCalibrationActions({
  scaleCheckStore,
  calibrationReferenceEdit,
  calibrationFlow,
  session,
  setError,
  precisionAuthoringBlocked,
  clearDraft,
  selectedMeasurementId,
  chooseWorkspaceTool,
  clearError,
  cancelWorkspaceCalibration,
  focusViewer,
  authoringCapabilityRef,
  startCalibration,
  currentPage,
  viewerPageBounds,
  addCalibration,
  openSetScaleRatioConfirmation,
  recalibrateCalibration,
  openRecalibrationConfirmation,
  removeClassificationValue,
  assignClassificationValue,
  startReferenceEdit,
  closeConfirmation,
  clearSelection,
  updateReferenceEdit,
  cancelReferenceEdit,
  updateCalibration,
  confirmReferenceEdit,
  openCalibrationReferenceEditConfirmation,
  setConfirmDimensionDeletion,
  deleteClassificationDimension,
  setConfirmValueDeletion,
  deleteClassificationValue,
  setConfirmMeasurementDeletion,
  editMeasurements,
  performMeasurementDelete,
  confirmScaleDeletion,
  setConfirmScaleDeletion,
  openDeleteScaleConfirmation,
  deleteCalibration,
}: CalibrationActionsContext) {
  function chooseTool(tool: Tool) {
    if (tool !== "calibrate") scaleCheckStore.clear();
    if (calibrationReferenceEdit && tool !== "calibrate") {
      setError("Finish or cancel the scale reference edit first.");
      return;
    }
    if (calibrationFlow && tool !== "calibrate") {
      setError("Finish or cancel calibration first.");
      return;
    }
    const currentPage = session?.pages[session.currentPage];
    const activePageCalibration = currentPage && getActiveCalibration(currentPage);
    if (isMeasurementType(tool) && precisionAuthoringBlocked) {
      return;
    }
    if (
      isMeasurementType(tool) &&
      (!currentPage || (measurementTypeRequiresScale(tool) && !activePageCalibration))
    ) {
      clearDraft();
      chooseWorkspaceTool("select");
      setError("Select a valid scale before creating measurements.");
      return;
    }
    clearDraft();
    // Any tool but Select deselects; the Count tool keeps a selected Count so it can resume it.
    const resumesSelectedCount =
      tool === "count" &&
      selectedMeasurementId !== null &&
      currentPage?.measurements.some(
        (measurement) => measurement.id === selectedMeasurementId && measurement.type === "count",
      ) === true;
    chooseWorkspaceTool(tool, resumesSelectedCount ? { keepSelection: true } : undefined);
    clearError();
  }

  function cancelCalibration() {
    scaleCheckStore.clear();
    cancelWorkspaceCalibration();
    clearDraft();
    chooseWorkspaceTool("select");
    clearError();
    focusViewer();
  }

  function beginRecalibration(pageNumber: number, calibrationId: string) {
    scaleCheckStore.clear();
    if (calibrationReferenceEdit) return;
    if (authoringCapabilityRef.current?.available !== true) return;
    const calibration =
      session?.pages[pageNumber] && findPageCalibration(session.pages[pageNumber], calibrationId);
    if (!calibration) return;
    startCalibration(beginCalibrationFlow(pageNumber, calibrationId, calibration.mode));
    chooseTool("calibrate");
    focusViewer();
  }

  function beginNewCalibration(mode: "uniform" | "xy") {
    scaleCheckStore.clear();
    if (calibrationReferenceEdit) return;
    if (authoringCapabilityRef.current?.available !== true) return;
    if (!currentPage) return;
    startCalibration(beginCalibrationFlow(currentPage.pageNumber, null, mode));
    chooseTool("calibrate");
    // Hand focus to the plan so keyboard drawing can place the reference right away.
    focusViewer();
  }

  function addStandardScalePreset(ratio: StandardScalePresetRatio) {
    if (calibrationFlow || calibrationReferenceEdit || !currentPage) return;
    const pageBounds =
      viewerPageBounds?.pageNumber === currentPage.pageNumber ? viewerPageBounds.bounds : null;
    addCalibration({
      pageNumber: currentPage.pageNumber,
      id: crypto.randomUUID(),
      name: defaultCalibrationName(currentPage),
      calibration: fitCalibrationReferencesToPage(createStandardScalePreset(ratio), pageBounds),
    });
  }

  function addCustomRatioScale(name: string, calibration: RatioCalibrationInput) {
    if (calibrationFlow || calibrationReferenceEdit || !currentPage) return;
    const pageBounds =
      viewerPageBounds?.pageNumber === currentPage.pageNumber ? viewerPageBounds.bounds : null;
    addCalibration({
      pageNumber: currentPage.pageNumber,
      id: crypto.randomUUID(),
      name,
      calibration: fitCalibrationReferencesToPage(calibration, pageBounds),
    });
  }

  function setScaleRatio(calibrationId: string, calibration: RatioCalibrationInput) {
    if (calibrationFlow || calibrationReferenceEdit || !currentPage) return;
    const target = findPageCalibration(currentPage, calibrationId);
    if (!target || target.mode !== calibration.mode) {
      setError("The scale to update is no longer available.");
      return;
    }
    const measurementCount = calibrationMeasurementCount(currentPage, calibrationId);
    const pageBounds =
      viewerPageBounds?.pageNumber === currentPage.pageNumber ? viewerPageBounds.bounds : null;
    const fittedCalibration = fitCalibrationReferencesToPage(calibration, pageBounds);
    if (measurementCount > 0) {
      openSetScaleRatioConfirmation({
        pageNumber: currentPage.pageNumber,
        calibrationId,
        calibrationName: target.name,
        measurementCount,
        calibration: fittedCalibration,
      });
      return;
    }
    recalibrateCalibration({
      pageNumber: currentPage.pageNumber,
      calibrationId,
      calibration: fittedCalibration,
    });
  }

  function requestRecalibration(calibrationId?: string) {
    if (calibrationReferenceEdit) return;
    if (authoringCapabilityRef.current?.available !== true) return;
    if (!currentPage) return;
    const calibration = calibrationId
      ? findPageCalibration(currentPage, calibrationId)
      : getActiveCalibration(currentPage);
    if (!calibration) {
      setError("Select a valid scale before recalibrating.");
      return;
    }
    const measurementCount = calibrationMeasurementCount(currentPage, calibration.id);
    if (measurementCount === 0) {
      beginRecalibration(currentPage.pageNumber, calibration.id);
      return;
    }
    openRecalibrationConfirmation({
      pageNumber: currentPage.pageNumber,
      calibrationId: calibration.id,
      calibrationName: calibration.name,
      measurementCount,
    });
  }

  function assignClassification(
    measurementId: string,
    dimensionId: string,
    valueId: string | null,
  ) {
    if (!currentPage || !session) return;
    const measurement = currentPage.measurements.find(
      (candidate) => candidate.id === measurementId,
    );
    const dimension = session.classificationCatalog.dimensions.find(
      (candidate) => candidate.id === dimensionId,
    );
    if (!measurement || !dimension) return;
    const currentValueId = dimension.values.find((value) =>
      measurement.classificationValueIds.includes(value.id),
    )?.id;
    if (!valueId && currentValueId) {
      removeClassificationValue({
        pageNumber: currentPage.pageNumber,
        measurementId,
        dimensionId,
        valueId: currentValueId,
      });
    } else if (valueId) {
      assignClassificationValue({
        pageNumber: currentPage.pageNumber,
        measurementId,
        dimensionId,
        valueId,
      });
    }
  }

  function beginCalibrationReferenceEdit(
    calibration: PageCalibration,
    reference: CalibrationReferenceKey,
  ) {
    if (!currentPage) return;
    if (authoringCapabilityRef.current?.available !== true) return;
    const edit = createCalibrationReferenceEdit(currentPage.pageNumber, calibration, reference);
    if (!edit) return;
    startReferenceEdit(edit);
    closeConfirmation();
    clearSelection();
    chooseTool("select");
    focusViewer();
  }

  // Passed down to every measurement shape's layer, so it keeps the stable dispatcher's identity.
  const updateCalibrationReferenceEdit = updateReferenceEdit;

  function cancelCalibrationReferenceEdit() {
    cancelReferenceEdit();
    closeConfirmation();
    clearError();
    focusViewer();
  }

  function requestCalibrationReferenceEditSave() {
    const edit = calibrationReferenceEdit;
    const preview = edit && calibrationReferenceEditPreview(session, edit);
    const page = edit && session?.pages[edit.pageNumber];
    const calibration = page && edit && findPageCalibration(page, edit.calibrationId);
    if (
      !edit ||
      !preview ||
      !calibration ||
      !isValidCalibrationReferenceEdit(preview, edit.reference)
    ) {
      setError("Place the reference points in a valid position before saving.");
      return;
    }
    const measurementCount = calibrationMeasurementCount(page, calibration.id);
    if (measurementCount === 0) {
      commitCalibrationReferenceEdit(edit);
      return;
    }
    openCalibrationReferenceEditConfirmation({
      pageNumber: edit.pageNumber,
      calibrationId: edit.calibrationId,
      reference: edit.reference,
      calibrationName: calibration.name,
      measurementCount,
    });
  }

  function commitCalibrationReferenceEdit(edit: CalibrationReferenceEdit) {
    updateCalibration({
      pageNumber: edit.pageNumber,
      calibrationId: edit.calibrationId,
      reference: edit.reference,
      points: edit.points,
    });
    confirmReferenceEdit();
    closeConfirmation();
    focusViewer();
  }

  function requestScaleDelete(pageNumber: number, calibration: PageCalibration) {
    if (calibrationFlow || calibrationReferenceEdit) {
      setError("Finish or cancel the current scale workflow first.");
      return;
    }
    const payload = { pageNumber, calibrationId: calibration.id, calibrationName: calibration.name };
    if (confirmScaleDeletion) openDeleteScaleConfirmation(payload);
    else deleteCalibration(payload);
  }

  function handleOverlayConfirmationConfirm(
    confirmation: OverlayConfirmation,
    options?: { dontAskAgain?: boolean },
  ) {
    if (confirmation.type === "deleteClassification") {
      const payload = confirmation.payload;
      if (payload.target === "dimension") {
        if (options?.dontAskAgain) setConfirmDimensionDeletion(false);
        deleteClassificationDimension(payload.dimensionId);
      } else {
        if (options?.dontAskAgain) setConfirmValueDeletion(false);
        deleteClassificationValue(payload.dimensionId, payload.valueId);
      }
      return;
    }
    if (confirmation.type === "deleteMeasurement") {
      if (options?.dontAskAgain) setConfirmMeasurementDeletion(false);
      if (confirmation.payload.measurementIds) {
        if (editMeasurements({ measurementIds: confirmation.payload.measurementIds, operation: { type: "delete" } })) clearSelection();
      } else performMeasurementDelete(confirmation.payload);
      return;
    }
    if (confirmation.type === "deleteScale") {
      if (options?.dontAskAgain) setConfirmScaleDeletion(false);
      deleteCalibration({
        pageNumber: confirmation.payload.pageNumber,
        calibrationId: confirmation.payload.calibrationId,
      });
      return;
    }

    if (confirmation.type === "recalibrateScale") {
      beginRecalibration(confirmation.payload.pageNumber, confirmation.payload.calibrationId);
      return;
    }

    if (confirmation.type === "setScaleRatio") {
      const { pageNumber, calibrationId, calibration } = confirmation.payload;
      const page = session?.pages[pageNumber];
      const target = page && findPageCalibration(page, calibrationId);
      if (!target || target.mode !== calibration.mode) {
        setError("The scale to update is no longer available.");
        return;
      }
      recalibrateCalibration({ pageNumber, calibrationId, calibration });
      return;
    }

    const edit = calibrationReferenceEdit;
    if (
      !edit ||
      edit.pageNumber !== confirmation.payload.pageNumber ||
      edit.calibrationId !== confirmation.payload.calibrationId ||
      edit.reference !== confirmation.payload.reference
    ) {
      setError("The reference edit is no longer available.");
      return;
    }
    commitCalibrationReferenceEdit(edit);
  }

  return {
    chooseTool,
    cancelCalibration,
    beginNewCalibration,
    addStandardScalePreset,
    addCustomRatioScale,
    setScaleRatio,
    requestRecalibration,
    requestScaleDelete,
    assignClassification,
    beginCalibrationReferenceEdit,
    updateCalibrationReferenceEdit,
    cancelCalibrationReferenceEdit,
    requestCalibrationReferenceEditSave,
    handleOverlayConfirmationConfirm,
  };
}
