import { lazy, Suspense, useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { AppProvider, useAppState } from "./state";
import { SessionProvider, useSessionState } from "./sessionState";
import { WorkspaceProvider, useWorkspaceState } from "./workspaceState";
import { OverlayProvider, useOverlayState, type OverlayConfirmation } from "./overlayState";
import { OverlayHost } from "./OverlayHost";
import { AppShell, LoadingOverlay } from "./AppShell";
import { EmptyWorkspaceState, WorkspaceShell } from "./WorkspaceShell";
import { ViewerContextBar, type ViewerContextData } from "./ViewerContextBar";
import { ToolRail } from "./ToolRail";
import { usePdfSessionLifecycle } from "./usePdfSessionLifecycle";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui";
import { CalibrationDialog } from "../features/calibration/CalibrationDialog";
import { ClassificationWorkspace } from "../features/classification/ClassificationWorkspace";
import { MeasurementClassificationDock } from "../features/classification/MeasurementClassificationDock";
import { CsvExportDialog } from "../features/export/CsvExportDialog";
import {
  MeasurementPanel,
  type MeasurementDeleteRequest,
} from "../features/measurements/MeasurementPanel";
import { SelectionInspectorPanel } from "../features/measurements/SelectionInspectorPanel";
import { type ToolAvailabilityMap } from "../features/viewer/toolRegistry";
import {
  beginCalibrationFlow,
  confirmCalibration,
  selectCalibrationReference,
} from "./calibrationFlow";
import {
  beginCalibrationReferenceEdit as createCalibrationReferenceEdit,
  type CalibrationReferenceEdit,
} from "./calibrationReferenceEdit";
import type {
  CalibrationReferenceKey,
  LogicalPageBounds,
  PageCalibration,
  Point,
  Tool,
} from "../types/domain";
import { getMeasurementKeyboardAction } from "../utils/keyboard";
import {
  findPageCalibration,
  getActiveCalibration,
  replaceCalibrationReferencePoints,
} from "../utils/calibration";
import {
  canDuplicateMeasurement,
  duplicateMeasurement,
  isMeasurementClipboardActionBlocked,
  measurementClipboardFitsPage,
  pasteMeasurementClipboard,
  registerMeasurementClipboardInvalidation,
} from "./measurementClipboard";
import {
  isPredominantlyHorizontal,
  isPredominantlyVertical,
  isMeasurementType,
  isValidPageCalibration,
} from "../utils/geometry";
import styles from "./App.module.css";

const PdfViewer = lazy(() =>
  import("../features/viewer/PdfViewer").then((module) => ({ default: module.PdfViewer })),
);

export function App() {
  return (
    <AppProvider>
      <SessionProvider>
        <WorkspaceProvider>
          <OverlayProvider>
            <PlanMeasureApp />
          </OverlayProvider>
        </WorkspaceProvider>
      </SessionProvider>
    </AppProvider>
  );
}

function PlanMeasureApp() {
  const { state: appState, setError, clearError } = useAppState();
  const {
    session,
    loadSession,
    clearSession,
    updatePage,
    addCalibration,
    recalibrateCalibration,
    setActiveCalibration,
    updateCalibration,
    pasteMeasurement,
    renameMeasurement,
    setMeasurementVisibility,
    setMeasurementsVisibility,
    deleteMeasurement,
    addClassificationDimension,
    renameClassificationDimension,
    archiveClassificationDimension,
    restoreClassificationDimension,
    addClassificationValue,
    renameClassificationValue,
    archiveClassificationValue,
    restoreClassificationValue,
    assignClassificationValue,
    removeClassificationValue,
  } = useSessionState();
  const {
    requestReplacePdf,
    closeDialog,
    requestRecalibration: openRecalibrationConfirmation,
    requestSaveCalibrationReferenceEdit: openCalibrationReferenceEditConfirmation,
    requestDeleteMeasurement: openDeleteMeasurementConfirmation,
    closeConfirmation,
    closeAllOverlays,
  } = useOverlayState();
  const {
    draft,
    selectedMeasurementId,
    measurementClipboard,
    calibrationFlow,
    calibrationCandidate,
    calibrationReferenceEdit,
    secondaryPanel,
    workspaceVersion,
    resetWorkspace,
    pageChanged,
    chooseTool: chooseWorkspaceTool,
    selectMeasurement: selectWorkspaceMeasurement,
    clearSelection,
    copyMeasurement,
    clearMeasurementClipboard,
    clearDraft,
    startCalibration,
    updateCalibrationCandidate,
    advanceCalibrationStep,
    cancelCalibration: cancelWorkspaceCalibration,
    completeCalibration,
    startReferenceEdit,
    updateReferenceEdit,
    cancelReferenceEdit,
    confirmReferenceEdit,
    setSecondaryPanel,
  } = useWorkspaceState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applicationCopyRef = useRef(false);
  const measurementEditActiveRef = useRef(false);
  const viewerPageZoomRef = useRef<{ pageNumber: number; zoom: number } | null>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [measurementEditActive, setMeasurementEditActive] = useState(false);
  const [csvExportDialogOpen, setCsvExportDialogOpen] = useState(false);
  const [viewerPageBounds, setViewerPageBounds] = useState<{
    pageNumber: number;
    bounds: LogicalPageBounds;
  } | null>(null);

  const {
    activePdf,
    recovery,
    recoveryChecked,
    recoveryIssue,
    confirmDiscardRecovery,
    loading,
    autosaveWarning,
    autosaveUnavailable,
    chooseFile,
    continueRecovery,
    discardRecovery,
    continueWithoutRecovery,
    showDiscardRecoveryConfirmation,
    hideDiscardRecoveryConfirmation,
    dismissAutosaveWarning,
    confirmPdfReplacement,
    cancelPdfReplacement,
  } = usePdfSessionLifecycle({
    session,
    loadSession,
    clearSession,
    resetWorkspace,
    cancelWorkspaceCalibration,
    cancelReferenceEdit,
    requestReplacePdf,
    closeDialog,
    closeConfirmation,
    closeAllOverlays,
    setError,
  });

  const clearDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setDragActive(false);
    measurementEditActiveRef.current = false;
    setMeasurementEditActive(false);
  }, []);

  const requestMeasurementDelete = useCallback(
    (request: MeasurementDeleteRequest) => {
      const page = session?.pages[request.pageNumber];
      const measurement = page?.measurements.find(
        (candidate) => candidate.id === request.measurementId,
      );
      if (!page || !measurement) return;
      openDeleteMeasurementConfirmation({
        pageNumber: page.pageNumber,
        measurementId: measurement.id,
        measurementName: measurement.name,
      });
    },
    [openDeleteMeasurementConfirmation, session],
  );

  const selectMeasurementFromPanel = useCallback(
    (measurementId: string) => {
      selectWorkspaceMeasurement(measurementId);
      clearError();
    },
    [clearError, selectWorkspaceMeasurement],
  );

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      pageChanged();
      closeConfirmation();
      clearError();
      updatePage(pageNumber);
    },
    [clearError, closeConfirmation, pageChanged, updatePage],
  );

  const handleViewerPageBoundsChange = useCallback(
    (pageNumber: number, bounds: LogicalPageBounds | null) => {
      setViewerPageBounds((current) =>
        bounds ? { pageNumber, bounds } : current?.pageNumber === pageNumber ? null : current,
      );
    },
    [],
  );

  const handleMeasurementEditActiveChange = useCallback((active: boolean) => {
    measurementEditActiveRef.current = active;
    setMeasurementEditActive(active);
  }, []);

  const handleViewerViewZoomChange = useCallback((pageNumber: number, zoom: number | null) => {
    if (zoom !== null) {
      viewerPageZoomRef.current = { pageNumber, zoom };
      return;
    }
    if (viewerPageZoomRef.current?.pageNumber === pageNumber) {
      viewerPageZoomRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleMeasurementShortcut(event: KeyboardEvent) {
      const action = getMeasurementKeyboardAction(event);
      if (!action || !session) return;
      const page = session.pages[session.currentPage];
      if (!page) return;
      if (
        action !== "delete-measurement" &&
        isMeasurementClipboardActionBlocked(action, {
          measurementEditActive: measurementEditActiveRef.current,
          draftActive: Boolean(draft),
          calibrationFlowActive: Boolean(calibrationFlow),
          calibrationCandidateActive: Boolean(calibrationCandidate),
          calibrationReferenceEditActive: Boolean(calibrationReferenceEdit),
        })
      ) {
        return;
      }

      if (action === "paste-measurement") {
        if (!measurementClipboard) return;
        event.preventDefault();
        const destinationBounds =
          viewerPageBounds?.pageNumber === page.pageNumber ? viewerPageBounds.bounds : null;
        const destinationZoom =
          viewerPageZoomRef.current?.pageNumber === page.pageNumber
            ? viewerPageZoomRef.current.zoom
            : null;
        if (
          !measurementClipboardFitsPage(measurementClipboard, page.pageNumber, destinationBounds)
        ) {
          setError(
            destinationBounds
              ? "The copied measurement does not fit within this page without changing its geometry."
              : "Wait for this page to finish loading before pasting a measurement from another page.",
          );
          return;
        }
        pasteMeasurementClipboard({
          clipboard: measurementClipboard,
          pageNumber: page.pageNumber,
          destinationBounds,
          destinationZoom,
          pasteMeasurement,
          selectMeasurement: selectWorkspaceMeasurement,
        });
        return;
      }

      if (!selectedMeasurementId) return;
      const measurement = page?.measurements.find(
        (candidate) => candidate.id === selectedMeasurementId,
      );
      if (!measurement) return;
      if (action === "copy-measurement") {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        applicationCopyRef.current = true;
        event.preventDefault();
        copyMeasurement(page.pageNumber, measurement);
        queueMicrotask(() => {
          applicationCopyRef.current = false;
        });
        return;
      }
      event.preventDefault();
      requestMeasurementDelete({
        pageNumber: page.pageNumber,
        measurementId: measurement.id,
        measurementName: measurement.name,
      });
    }
    window.addEventListener("keydown", handleMeasurementShortcut);
    return () => window.removeEventListener("keydown", handleMeasurementShortcut);
  }, [
    copyMeasurement,
    calibrationCandidate,
    calibrationFlow,
    calibrationReferenceEdit,
    draft,
    measurementClipboard,
    pasteMeasurement,
    requestMeasurementDelete,
    selectWorkspaceMeasurement,
    selectedMeasurementId,
    session,
    setError,
    viewerPageBounds,
  ]);

  useEffect(() => {
    return registerMeasurementClipboardInvalidation({
      documentTarget: document,
      windowTarget: window,
      applicationCopyInProgress: () => applicationCopyRef.current,
      clearClipboard: clearMeasurementClipboard,
    });
  }, [clearMeasurementClipboard]);

  useEffect(() => {
    window.addEventListener("blur", clearDragState);
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    document.addEventListener("visibilitychange", clearDragState);
    return () => {
      window.removeEventListener("blur", clearDragState);
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
      document.removeEventListener("visibilitychange", clearDragState);
    };
  }, [clearDragState]);

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) clearDragState();
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    clearDragState();
    const file = event.dataTransfer.files[0];
    if (file) void chooseFile(file);
  }

  function chooseTool(tool: Tool) {
    if (calibrationReferenceEdit && tool !== "select" && tool !== "hand") {
      setError("Finish or cancel the scale reference edit first.");
      return;
    }
    if (calibrationFlow && tool !== "calibrate") cancelWorkspaceCalibration();
    const currentPage = session?.pages[session.currentPage];
    const activePageCalibration = currentPage && getActiveCalibration(currentPage);
    if (isMeasurementType(tool) && (!currentPage || !activePageCalibration)) {
      clearDraft();
      chooseWorkspaceTool("select");
      setError("Select a valid scale before creating measurements.");
      return;
    }
    clearDraft();
    chooseWorkspaceTool(tool);
    clearError();
  }

  function cancelCalibration() {
    cancelWorkspaceCalibration();
    clearDraft();
    chooseTool("select");
  }

  function beginRecalibration(pageNumber: number, calibrationId: string) {
    if (calibrationReferenceEdit) return;
    const calibration =
      session?.pages[pageNumber] && findPageCalibration(session.pages[pageNumber], calibrationId);
    if (!calibration) return;
    startCalibration(beginCalibrationFlow(pageNumber, calibrationId, calibration.mode));
    chooseTool("calibrate");
  }

  function beginNewCalibration(mode: "uniform" | "xy") {
    if (calibrationReferenceEdit) return;
    if (!currentPage) return;
    startCalibration(beginCalibrationFlow(currentPage.pageNumber, null, mode));
    chooseTool("calibrate");
  }

  function requestRecalibration(calibrationId?: string) {
    if (calibrationReferenceEdit) return;
    if (!currentPage) return;
    const calibration = calibrationId
      ? findPageCalibration(currentPage, calibrationId)
      : getActiveCalibration(currentPage);
    if (!calibration) {
      setError("Select a valid scale before recalibrating.");
      return;
    }
    const measurementCount = currentPage.measurements.filter(
      (measurement) => measurement.calibrationId === calibration.id,
    ).length;
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
    const edit = createCalibrationReferenceEdit(currentPage.pageNumber, calibration, reference);
    if (!edit) return;
    startReferenceEdit(edit);
    closeConfirmation();
    clearSelection();
    chooseTool("select");
  }

  function updateCalibrationReferenceEdit(points: [Point, Point]) {
    updateReferenceEdit(points);
  }

  function cancelCalibrationReferenceEdit() {
    cancelReferenceEdit();
    closeConfirmation();
  }

  function calibrationReferenceEditPreview(edit: CalibrationReferenceEdit): PageCalibration | null {
    const page = session?.pages[edit.pageNumber];
    const calibration = page && findPageCalibration(page, edit.calibrationId);
    return calibration
      ? replaceCalibrationReferencePoints(calibration, edit.reference, edit.points)
      : null;
  }

  function requestCalibrationReferenceEditSave() {
    const edit = calibrationReferenceEdit;
    const preview = edit && calibrationReferenceEditPreview(edit);
    const page = edit && session?.pages[edit.pageNumber];
    const calibration = page && edit && findPageCalibration(page, edit.calibrationId);
    if (!edit || !preview || !calibration || !isValidPageCalibration(preview)) {
      setError("Place the reference points in a valid position before saving.");
      return;
    }
    const measurementCount = page.measurements.filter(
      (measurement) => measurement.calibrationId === calibration.id,
    ).length;
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
  }

  function handleOverlayConfirmationConfirm(confirmation: OverlayConfirmation) {
    if (confirmation.type === "deleteMeasurement") {
      const { pageNumber, measurementId } = confirmation.payload;
      const page = session?.pages[pageNumber];
      const measurement = page?.measurements.find((candidate) => candidate.id === measurementId);
      if (!session || session.currentPage !== pageNumber || !page || !measurement) return;
      deleteMeasurement(pageNumber, measurementId);
      if (selectedMeasurementId === measurementId) clearSelection();
      return;
    }

    if (confirmation.type === "recalibrateScale") {
      beginRecalibration(confirmation.payload.pageNumber, confirmation.payload.calibrationId);
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

  const currentPage = session?.pages[session.currentPage];
  const calibrationCandidatePage = calibrationCandidate
    ? (session?.pages[calibrationCandidate.pageNumber] ?? null)
    : null;
  const calibrationCandidateTarget =
    calibrationCandidatePage && calibrationCandidate?.calibrationId
      ? findPageCalibration(calibrationCandidatePage, calibrationCandidate.calibrationId)
      : null;
  const calibrationReferencePreview = calibrationReferenceEdit
    ? calibrationReferenceEditPreview(calibrationReferenceEdit)
    : null;
  const calibrationReferenceEditIsValid = Boolean(
    calibrationReferencePreview && isValidPageCalibration(calibrationReferencePreview),
  );
  const previewPage =
    currentPage &&
    calibrationReferenceEdit &&
    calibrationReferenceEdit.pageNumber === currentPage.pageNumber &&
    calibrationReferencePreview &&
    calibrationReferenceEditIsValid
      ? {
          ...currentPage,
          calibrations: currentPage.calibrations.map((calibration) =>
            calibration.id === calibrationReferenceEdit.calibrationId
              ? calibrationReferencePreview
              : calibration,
          ),
        }
      : currentPage;
  const activePageCalibration = currentPage ? getActiveCalibration(currentPage) : null;
  const activeCalibration = activePageCalibration;
  const selectedMeasurement =
    currentPage?.measurements.find((measurement) => measurement.id === selectedMeasurementId) ??
    null;
  const duplicateDisabled = currentPage && selectedMeasurement
    ? !canDuplicateMeasurement(currentPage, selectedMeasurement) ||
      isMeasurementClipboardActionBlocked("paste-measurement", {
        measurementEditActive,
        draftActive: Boolean(draft),
        calibrationFlowActive: Boolean(calibrationFlow),
        calibrationCandidateActive: Boolean(calibrationCandidate),
        calibrationReferenceEditActive: Boolean(calibrationReferenceEdit),
      })
    : true;

  function duplicateSelectedMeasurement(measurementId: string) {
    if (!currentPage || selectedMeasurementId !== measurementId) return;
    const measurement = currentPage.measurements.find(
      (candidate) => candidate.id === measurementId,
    );
    if (!measurement) return;
    if (!canDuplicateMeasurement(currentPage, measurement)) return;
    if (
      isMeasurementClipboardActionBlocked("paste-measurement", {
        measurementEditActive: measurementEditActiveRef.current,
        draftActive: Boolean(draft),
        calibrationFlowActive: Boolean(calibrationFlow),
        calibrationCandidateActive: Boolean(calibrationCandidate),
        calibrationReferenceEditActive: Boolean(calibrationReferenceEdit),
      })
    ) {
      return;
    }

    const destinationBounds =
      viewerPageBounds?.pageNumber === currentPage.pageNumber ? viewerPageBounds.bounds : null;
    const destinationZoom =
      viewerPageZoomRef.current?.pageNumber === currentPage.pageNumber
        ? viewerPageZoomRef.current.zoom
        : null;
    duplicateMeasurement({
      measurement,
      pageNumber: currentPage.pageNumber,
      destinationBounds,
      destinationZoom,
      pasteMeasurement,
      selectMeasurement: selectWorkspaceMeasurement,
    });
  }
  const calibrationActionsDisabled = Boolean(calibrationFlow || calibrationReferenceEdit);
  const activeCalibrationActions = activeCalibration
    ? [
        {
          label: "Recalibrate",
          disabled: calibrationActionsDisabled,
          onClick: () => requestRecalibration(activeCalibration.id),
        },
        {
          label: activeCalibration.mode === "uniform" ? "Edit points" : "Edit X",
          disabled: calibrationActionsDisabled,
          onClick: () =>
            beginCalibrationReferenceEdit(
              activeCalibration,
              activeCalibration.mode === "uniform" ? "uniform" : "x",
            ),
        },
        ...(activeCalibration.mode === "xy"
          ? [
              {
                label: "Edit Y",
                disabled: calibrationActionsDisabled,
                onClick: () => beginCalibrationReferenceEdit(activeCalibration, "y"),
              },
            ]
          : []),
      ]
    : [];
  const workflowContext: ViewerContextData["workflow"] = calibrationReferenceEdit
    ? {
        label:
          calibrationReferenceEdit.reference === "uniform"
            ? "Editing scale reference"
            : `Editing ${calibrationReferenceEdit.reference.toUpperCase()} reference`,
        tone: "active",
      }
    : calibrationFlow
      ? {
          label:
            calibrationFlow.mode === "xy"
              ? `Calibrating ${calibrationFlow.phase.toUpperCase()} reference`
              : "Calibrating scale",
          tone: "active",
        }
      : draft?.type === "path"
        ? {
            label: `Drawing ${draft.measurementType}`,
            tone: "active",
          }
        : { label: "Ready", tone: "neutral" };
  const viewerContext: ViewerContextData = {
    scale: activeCalibration
      ? {
          id: activeCalibration.id,
          name: activeCalibration.name,
          modeLabel: activeCalibration.mode === "uniform" ? "Uniform" : "X/Y correction",
          options:
            currentPage?.calibrations.map((calibration) => ({
              id: calibration.id,
              name: calibration.name,
            })) ?? [],
          disabled: calibrationActionsDisabled,
        }
      : null,
    workflow: workflowContext,
  };
  const canCreateMeasurements = Boolean(activeCalibration) && !calibrationReferenceEdit;
  const measurementToolDisabledReason = calibrationReferenceEdit
    ? "Finish or cancel the scale reference edit first"
    : "This tool requires an active scale";
  const toolAvailability: ToolAvailabilityMap = {
    line: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
    polyline: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
    polygon: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
  };

  return (
    <AppShell
      onOpenPdf={() => fileInputRef.current?.click()}
      onExport={() => setCsvExportDialogOpen(true)}
      statusMessage={appState.error ?? autosaveWarning}
      statusTone={appState.error ? "error" : "warning"}
      onDismissStatus={
        appState.error
          ? clearError
          : autosaveWarning && !autosaveUnavailable
            ? dismissAutosaveWarning
            : undefined
      }
    >
      <input
        ref={fileInputRef}
        className={styles.hiddenInput}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void chooseFile(file);
          event.target.value = "";
        }}
      />
      {session && activePdf && currentPage && previewPage ? (
        <WorkspaceShell
          dragActive={dragActive}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          toolRail={<ToolRail toolAvailability={toolAvailability} onChooseTool={chooseTool} />}
          leftPanel={<SelectionInspectorPanel page={previewPage} />}
          viewerContext={
            <ViewerContextBar
              context={viewerContext}
              action={
                selectedMeasurement
                  ? {
                      label: "Duplicate",
                      disabled: duplicateDisabled,
                      onClick: () => duplicateSelectedMeasurement(selectedMeasurement.id),
                    }
                  : null
              }
              onScaleChange={(calibrationId) => {
                if (currentPage) setActiveCalibration(currentPage.pageNumber, calibrationId);
              }}
            />
          }
          viewer={
            <Suspense
              fallback={
                <div className={styles.viewerLoading} role="status">
                  Loading viewer…
                </div>
              }
            >
              <PdfViewer
                document={activePdf.document}
                page={previewPage}
                onPageChange={handlePageChange}
                onPageBoundsChange={handleViewerPageBoundsChange}
                onViewZoomChange={handleViewerViewZoomChange}
                onMeasurementEditActiveChange={handleMeasurementEditActiveChange}
                onChooseTool={chooseTool}
                onCalibrationCandidate={(points) => {
                  const flow = calibrationFlow;
                  if (!flow) return;
                  const phase = flow.phase;
                  if (phase === "x" && !isPredominantlyHorizontal(points[0], points[1])) {
                    chooseTool("calibrate");
                    setError("X reference must be primarily horizontal (|dx| > |dy|).");
                    return;
                  }
                  if (phase === "y" && !isPredominantlyVertical(points[0], points[1])) {
                    chooseTool("calibrate");
                    setError("Y reference must be primarily vertical (|dy| > |dx|).");
                    return;
                  }
                  updateCalibrationCandidate(selectCalibrationReference(flow, points));
                }}
                calibrationReferenceLabel={
                  calibrationFlow?.mode === "xy"
                    ? calibrationFlow.phase === "y"
                      ? "Y"
                      : "X"
                    : undefined
                }
                onCalibrationCancel={cancelCalibration}
                calibrationReferenceEdit={
                  calibrationReferenceEdit?.pageNumber === currentPage.pageNumber
                    ? {
                        calibrationId: calibrationReferenceEdit.calibrationId,
                        reference: calibrationReferenceEdit.reference,
                        points: calibrationReferenceEdit.points,
                        valid: calibrationReferenceEditIsValid,
                      }
                    : null
                }
                onCalibrationReferencePointsChange={updateCalibrationReferenceEdit}
                onCalibrationReferenceEditCancel={cancelCalibrationReferenceEdit}
                onCalibrationReferenceEditSave={requestCalibrationReferenceEditSave}
              />
            </Suspense>
          }
          secondaryPanel={
            <div className={styles.secondaryPanelStack}>
              <section className={styles.scaleControls} aria-label="Scales on current page">
                <div className={styles.scaleControlsHeader}>
                  <div>
                    <strong>Scale tools</strong>
                  </div>
                  <span>
                    {currentPage.calibrations.length}{" "}
                    {currentPage.calibrations.length === 1 ? "scale" : "scales"}
                  </span>
                </div>
                <div
                  className={`${styles.scaleControlsActions} ${
                    activeCalibration?.mode === "xy" ? styles.scaleControlsActionsXy : ""
                  }`}
                >
                  <Button
                    variant="secondary"
                    size="compact"
                    disabled={calibrationActionsDisabled}
                    onClick={() => beginNewCalibration("uniform")}
                  >
                    Add uniform
                  </Button>
                  <Button
                    variant="secondary"
                    size="compact"
                    disabled={calibrationActionsDisabled}
                    onClick={() => beginNewCalibration("xy")}
                  >
                    Add X/Y
                  </Button>
                  {activeCalibrationActions.map((action) => (
                    <Button
                      key={action.label}
                      variant="secondary"
                      size="compact"
                      disabled={action.disabled}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </section>
              <div className={styles.panelTabs} role="tablist" aria-label="Workspace data">
                <button
                  type="button"
                  role="tab"
                  aria-selected={secondaryPanel === "measurements"}
                  onClick={() => setSecondaryPanel("measurements")}
                >
                  Measurements <span>{currentPage.measurements.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={secondaryPanel === "classifications"}
                  onClick={() => setSecondaryPanel("classifications")}
                >
                  Classifications <span>{session.classificationCatalog.dimensions.length}</span>
                </button>
              </div>
              <div className={styles.panelContent} hidden={secondaryPanel !== "measurements"}>
                <MeasurementPanel
                  key={workspaceVersion}
                  page={previewPage}
                  onSelectMeasurement={selectMeasurementFromPanel}
                  onRenameMeasurement={renameMeasurement}
                  onSetMeasurementVisibility={setMeasurementVisibility}
                  onSetMeasurementsVisibility={setMeasurementsVisibility}
                  onRequestDelete={requestMeasurementDelete}
                  classificationDock={
                    <MeasurementClassificationDock
                      measurement={selectedMeasurement}
                      catalog={session.classificationCatalog}
                      onAssign={assignClassification}
                      disabled={Boolean(
                        calibrationFlow || calibrationCandidate || calibrationReferenceEdit,
                      )}
                    />
                  }
                />
              </div>
              <div className={styles.panelContent} hidden={secondaryPanel !== "classifications"}>
                <ClassificationWorkspace
                  key={workspaceVersion}
                  catalog={session.classificationCatalog}
                  disabled={Boolean(
                    calibrationFlow || calibrationCandidate || calibrationReferenceEdit,
                  )}
                  onCreateDimension={(name) =>
                    addClassificationDimension(crypto.randomUUID(), name)
                  }
                  onRenameDimension={renameClassificationDimension}
                  onArchiveDimension={archiveClassificationDimension}
                  onRestoreDimension={restoreClassificationDimension}
                  onCreateValue={(dimensionId, name) =>
                    addClassificationValue(dimensionId, crypto.randomUUID(), name)
                  }
                  onRenameValue={renameClassificationValue}
                  onArchiveValue={archiveClassificationValue}
                  onRestoreValue={restoreClassificationValue}
                />
              </div>
            </div>
          }
        />
      ) : (
        <WorkspaceShell
          isEmpty
          dragActive={dragActive}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          emptyState={<EmptyWorkspaceState onOpenPdf={() => fileInputRef.current?.click()} />}
        />
      )}

      {!recoveryChecked && <LoadingOverlay>Checking for a saved session…</LoadingOverlay>}
      {loading && <LoadingOverlay>Loading PDF…</LoadingOverlay>}

      {recovery && !session && !loading && (
        <Modal title="Previous session found">
          {confirmDiscardRecovery ? (
            <>
              <p>
                The saved session for <strong>{recovery.session.pdf.name}</strong> and its local PDF
                will be permanently removed.
              </p>
              <div className={styles.modalActions}>
                <Button variant="secondary" onClick={hideDiscardRecoveryConfirmation}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => void discardRecovery()}>
                  Discard saved session
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                Continue working on <strong>{recovery.session.pdf.name}</strong>, or discard the
                saved browser-local session.
              </p>
              <div className={styles.modalActions}>
                <Button variant="dangerSecondary" onClick={showDiscardRecoveryConfirmation}>
                  Discard
                </Button>
                <Button onClick={() => void continueRecovery()}>Continue</Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {recoveryIssue && !session && (
        <Modal title="Saved session unavailable">
          {confirmDiscardRecovery ? (
            <>
              <p>The unreadable saved session and its local PDF will be permanently removed.</p>
              <div className={styles.modalActions}>
                <Button variant="secondary" onClick={hideDiscardRecoveryConfirmation}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => void discardRecovery()}>
                  Discard saved session
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>{recoveryIssue}</p>
              <div className={styles.modalActions}>
                <Button variant="secondary" onClick={continueWithoutRecovery}>
                  Continue without recovery
                </Button>
                <Button variant="dangerSecondary" onClick={showDiscardRecoveryConfirmation}>
                  Discard saved session
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}

      <OverlayHost
        onDialogConfirm={confirmPdfReplacement}
        onDialogCancel={cancelPdfReplacement}
        onConfirmationConfirm={handleOverlayConfirmationConfirm}
      />

      {csvExportDialogOpen && session && (
        <CsvExportDialog
          session={session}
          pageLabels={activePdf?.pageLabels ?? null}
          onClose={() => setCsvExportDialogOpen(false)}
        />
      )}

      {calibrationCandidate && session && calibrationCandidatePage && (
        <CalibrationDialog
          points={calibrationCandidate.points}
          initialName={
            calibrationCandidate.name ??
            calibrationCandidateTarget?.name ??
            `Scale ${calibrationCandidatePage.nextCalibrationNumber}`
          }
          title={calibrationCandidateTarget ? "Recalibrate scale" : "Add scale"}
          referenceLabel={
            calibrationCandidate.phase === "x"
              ? "horizontal X"
              : calibrationCandidate.phase === "y"
                ? "vertical Y"
                : undefined
          }
          includeName={calibrationCandidate.phase !== "y"}
          onCancel={() => {
            cancelCalibration();
          }}
          onConfirm={({ name, referenceDistanceMm }) => {
            if (session.currentPage !== calibrationCandidate.pageNumber) {
              cancelCalibration();
              return;
            }
            if (!calibrationFlow) {
              cancelCalibration();
              return;
            }
            const confirmation = confirmCalibration(
              calibrationFlow,
              calibrationCandidate,
              referenceDistanceMm,
              name,
            );
            if (confirmation.kind === "select-y") {
              advanceCalibrationStep(confirmation.flow);
              chooseTool("calibrate");
              return;
            }
            const calibration = confirmation.calibration;
            if (calibrationCandidate.calibrationId) {
              if (!calibrationCandidateTarget) {
                setError("The scale to recalibrate is no longer available.");
              } else {
                recalibrateCalibration({
                  pageNumber: calibrationCandidate.pageNumber,
                  calibrationId: calibrationCandidateTarget.id,
                  name,
                  calibration,
                });
              }
            } else {
              addCalibration({
                pageNumber: calibrationCandidate.pageNumber,
                id: crypto.randomUUID(),
                name,
                calibration,
              });
            }
            completeCalibration();
            clearDraft();
            chooseWorkspaceTool("select");
          }}
        />
      )}
    </AppShell>
  );
}
