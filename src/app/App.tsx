import { lazy, Suspense, useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { AppProvider, useAppState } from "./state";
import { SessionProvider, useSessionState } from "./sessionState";
import { WorkspaceProvider, useWorkspaceState } from "./workspaceState";
import { OverlayProvider, useOverlayState, type OverlayConfirmation } from "./overlayState";
import { OverlayHost } from "./OverlayHost";
import { AppShell, LoadingOverlay } from "./AppShell";
import { EmptyWorkspaceState, WorkspaceShell } from "./WorkspaceShell";
import { WorkspacePanel } from "./WorkspacePanel";
import { ContextToolbar } from "./ContextToolbar";
import { ToolRail } from "./ToolRail";
import { usePdfSessionLifecycle } from "./usePdfSessionLifecycle";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui";
import { CalibrationDialog } from "../features/calibration/CalibrationDialog";
import { ScalesWorkspace } from "../features/calibration/ScalesWorkspace";
import { ClassificationWorkspace } from "../features/classification/ClassificationWorkspace";
import { CsvExportDialog } from "../features/export/CsvExportDialog";
import {
  MeasurementPanel,
  type MeasurementDeleteRequest,
} from "../features/measurements/MeasurementPanel";
import { MeasurementDetails } from "../features/measurements/MeasurementDetails";
import { type ToolAvailabilityMap } from "../features/viewer/toolRegistry";
import type { AuthoringCapability } from "../features/viewer/AuthoringCapability";
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
    workspaceModule,
    measurementDetailsOpen,
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
    openMeasurementDetails,
    closeMeasurementDetails,
  } = useWorkspaceState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applicationCopyRef = useRef(false);
  const activeMeasurementEditIdRef = useRef<string | null>(null);
  const viewerPageZoomRef = useRef<{ pageNumber: number; zoom: number } | null>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [activeMeasurementEditId, setActiveMeasurementEditId] = useState<string | null>(null);
  const [csvExportDialogOpen, setCsvExportDialogOpen] = useState(false);
  const [authoringCapability, setAuthoringCapability] = useState<AuthoringCapability | null>(null);
  const authoringCapabilityRef = useRef<AuthoringCapability | null>(null);
  const handleAuthoringCapabilityChange = useCallback((capability: AuthoringCapability) => {
    authoringCapabilityRef.current = capability;
    setAuthoringCapability(capability);
  }, []);
  const [viewerPageBounds, setViewerPageBounds] = useState<{
    pageNumber: number;
    bounds: LogicalPageBounds;
  } | null>(null);

  const focusViewer = useCallback(() => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("[data-dialog-focus-fallback]")
        ?.focus({ preventScroll: true });
    });
  }, []);

  const focusMeasurementRow = useCallback((measurementId: string) => {
    window.requestAnimationFrame(() => {
      const row = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-measurement-id][data-measurement-control="selection"]',
        ),
      ).find((candidate) => candidate.dataset.measurementId === measurementId);
      if (row && !row.closest("[hidden]")) {
        row.focus({ preventScroll: true });
        if (document.activeElement === row) return;
      }
      document
        .querySelector<HTMLElement>("[data-dialog-focus-fallback]")
        ?.focus({ preventScroll: true });
    });
  }, []);

  const focusMeasurementDetails = useCallback(() => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("[data-measurement-details-back]")
        ?.focus({ preventScroll: true });
    });
  }, []);

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

  const handleMeasurementEditActiveChange = useCallback((measurementId: string, active: boolean) => {
    if (active) {
      activeMeasurementEditIdRef.current = measurementId;
      setActiveMeasurementEditId(measurementId);
      return;
    }
    if (activeMeasurementEditIdRef.current !== measurementId) return;
    activeMeasurementEditIdRef.current = null;
    setActiveMeasurementEditId(null);
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
          measurementEditActive: activeMeasurementEditIdRef.current !== null,
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
    chooseWorkspaceTool("select");
    clearError();
    focusViewer();
  }

  function beginRecalibration(pageNumber: number, calibrationId: string) {
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
    if (calibrationReferenceEdit) return;
    if (authoringCapabilityRef.current?.available !== true) return;
    if (!currentPage) return;
    startCalibration(beginCalibrationFlow(currentPage.pageNumber, null, mode));
    chooseTool("calibrate");
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
    if (authoringCapabilityRef.current?.available !== true) return;
    const edit = createCalibrationReferenceEdit(currentPage.pageNumber, calibration, reference);
    if (!edit) return;
    startReferenceEdit(edit);
    closeConfirmation();
    clearSelection();
    chooseTool("select");
    focusViewer();
  }

  function updateCalibrationReferenceEdit(points: [Point, Point]) {
    updateReferenceEdit(points);
  }

  function cancelCalibrationReferenceEdit() {
    cancelReferenceEdit();
    closeConfirmation();
    clearError();
    focusViewer();
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
    focusViewer();
  }

  function handleOverlayConfirmationConfirm(confirmation: OverlayConfirmation) {
    if (confirmation.type === "deleteMeasurement") {
      const { pageNumber, measurementId } = confirmation.payload;
      const page = session?.pages[pageNumber];
      const measurement = page?.measurements.find((candidate) => candidate.id === measurementId);
      if (!session || session.currentPage !== pageNumber || !page || !measurement) return;
      deleteMeasurement(pageNumber, measurementId);
      if (selectedMeasurementId === measurementId) clearSelection();
      focusViewer();
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
  useEffect(() => {
    if (!measurementDetailsOpen || selectedMeasurement) return;
    closeMeasurementDetails();
    focusViewer();
  }, [closeMeasurementDetails, focusViewer, measurementDetailsOpen, selectedMeasurement]);
  const measurementEditActive = activeMeasurementEditId !== null;
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
        measurementEditActive: activeMeasurementEditIdRef.current !== null,
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
  const precisionAuthoringBlocked = authoringCapability?.available !== true;
  const precisionAuthoringDisabledReason =
    authoringCapability?.unavailableReason ??
    "Precision drawing and editing need more unobscured viewer space and a fine pointer";
  const primaryToolsLocked = Boolean(calibrationFlow || calibrationReferenceEdit);
  const primaryToolLockReason = calibrationReferenceEdit
    ? "Finish or cancel the scale reference edit first"
    : "Finish or cancel calibration first";
  const canCreateMeasurements =
    Boolean(activeCalibration) && !primaryToolsLocked && !precisionAuthoringBlocked;
  const measurementToolDisabledReason = primaryToolsLocked
    ? primaryToolLockReason
    : precisionAuthoringBlocked
      ? precisionAuthoringDisabledReason
    : "This tool requires an active scale";
  const toolAvailability: ToolAvailabilityMap = {
    select: { enabled: !primaryToolsLocked, disabledReason: primaryToolLockReason },
    hand: { enabled: !primaryToolsLocked, disabledReason: primaryToolLockReason },
    line: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
    polyline: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
    polygon: { enabled: canCreateMeasurements, disabledReason: measurementToolDisabledReason },
  };

  return (
    <AppShell
      documentName={session?.pdf.name ?? null}
      canExport={Boolean(session)}
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
          workspacePanel={
            <WorkspacePanel
              measurements={
                <MeasurementPanel
                  key={workspaceVersion}
                  page={previewPage}
                  onSelectMeasurement={selectMeasurementFromPanel}
                  onSetMeasurementVisibility={setMeasurementVisibility}
                  onSetMeasurementsVisibility={setMeasurementsVisibility}
                />
              }
              classifications={
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
              }
              scales={
                <ScalesWorkspace
                  page={currentPage}
                  actionsDisabled={calibrationActionsDisabled}
                  onAddScale={beginNewCalibration}
                  onRecalibrate={requestRecalibration}
                  onEditReference={beginCalibrationReferenceEdit}
                />
              }
              details={
                selectedMeasurement ? (
                  <MeasurementDetails
                    key={selectedMeasurement.id}
                    page={previewPage}
                    measurement={selectedMeasurement}
                    displayUnit={session.settings.displayUnit}
                    catalog={session.classificationCatalog}
                    returnModule={workspaceModule}
                    assignmentDisabled={Boolean(
                      calibrationFlow || calibrationCandidate || calibrationReferenceEdit,
                    )}
                    onBack={() => {
                      closeMeasurementDetails();
                      focusMeasurementRow(selectedMeasurement.id);
                    }}
                    onRename={(name) =>
                      renameMeasurement(currentPage.pageNumber, selectedMeasurement.id, name)
                    }
                    onAssignClassification={assignClassification}
                    onEditGeometry={() => chooseTool("select")}
                    onDelete={() =>
                      requestMeasurementDelete({
                        pageNumber: currentPage.pageNumber,
                        measurementId: selectedMeasurement.id,
                        measurementName: selectedMeasurement.name,
                      })
                    }
                  />
                ) : null
              }
            />
          }
          authoringIntentScopeKey={`${currentPage.pageNumber}:${workspaceVersion}:${selectedMeasurementId ?? ""}`}
          toolRail={<ToolRail toolAvailability={toolAvailability} onChooseTool={chooseTool} />}
          contextToolbar={
            <ContextToolbar
              selectedMeasurementName={selectedMeasurement?.name ?? null}
              duplicateDisabled={duplicateDisabled}
              referenceEditValid={calibrationReferenceEditIsValid}
              measurementEditActive={measurementEditActive}
              onDuplicateSelectedMeasurement={() => {
                if (selectedMeasurement) duplicateSelectedMeasurement(selectedMeasurement.id);
              }}
              onOpenMeasurementDetails={() => {
                openMeasurementDetails();
                focusMeasurementDetails();
              }}
              onExitDrawingTool={() => {
                chooseTool("select");
                focusViewer();
              }}
              onCancelCalibration={cancelCalibration}
              onCancelReferenceEdit={cancelCalibrationReferenceEdit}
              onSaveReferenceEdit={requestCalibrationReferenceEditSave}
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
                activeMeasurementEditId={activeMeasurementEditId}
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
                measurementEditingBlocked={Boolean(calibrationFlow || calibrationCandidate)}
                onCalibrationReferencePointsChange={updateCalibrationReferenceEdit}
                onCalibrationReferenceEditCancel={cancelCalibrationReferenceEdit}
              />
            </Suspense>
          }
          onAuthoringCapabilityChange={handleAuthoringCapabilityChange}
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
              focusViewer();
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
            focusViewer();
          }}
        />
      )}
    </AppShell>
  );
}
