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
import { ProjectLibraryDialog } from "./ProjectLibraryDialog";
import { ToolRail } from "./ToolRail";
import { usePdfSessionLifecycle } from "./usePdfSessionLifecycle";
import { Modal } from "../components/Modal";
import { Button, ConfirmationDialog } from "../components/ui";
import { CalibrationDialog } from "../features/calibration/CalibrationDialog";
import { ScalesWorkspace } from "../features/calibration/ScalesWorkspace";
import { ClassificationWorkspace } from "../features/classification/ClassificationWorkspace";
import { ExportDialog } from "../features/export/ExportDialog";
import { downloadAnnotatedPdf } from "../features/export/annotatedPdf";
import {
  MeasurementPanel,
  type MeasurementDeleteRequest,
} from "../features/measurements/MeasurementPanel";
import { MeasurementDetails } from "../features/measurements/MeasurementDetails";
import { TakeoffWorkspace } from "../features/measurements/TakeoffWorkspace";
import { type ToolAvailabilityMap } from "../features/viewer/toolRegistry";
import type { AuthoringCapability } from "../features/viewer/AuthoringCapability";
import {
  beginCalibrationFlow,
  confirmCalibration,
  selectCalibrationReference,
} from "./calibrationFlow";
import {
  createStandardScalePreset,
  type StandardScalePresetRatio,
} from "../features/calibration/standardScalePresets";
import {
  beginCalibrationReferenceEdit as createCalibrationReferenceEdit,
  type CalibrationReferenceEdit,
} from "./calibrationReferenceEdit";
import type {
  CalibrationReferenceKey,
  LogicalPageBounds,
  PageCalibration,
  PageState,
  Point,
  Tool,
} from "../types/domain";
import {
  getHistoryKeyboardAction,
  getMeasurementKeyboardAction,
} from "../utils/keyboard";
import {
  defaultCalibrationName,
  findPageCalibration,
  getActiveCalibration,
  isValidCalibrationReferenceEdit,
  replaceCalibrationReferencePoints,
} from "../utils/calibration";
import {
  fitCalibrationReferencesToPage,
  type RatioCalibrationInput,
} from "../features/calibration/ratioCalibration";
import {
  canDuplicateMeasurement,
  isMeasurementClipboardActionBlocked,
  measurementClipboardFitsPage,
  pasteMeasurementsClipboard,
  registerMeasurementClipboardInvalidation,
} from "./measurementClipboard";
import { isAlignedXyReference, isMeasurementType } from "../utils/geometry";
import {
  readClassificationDeleteConfirmationPreference,
  writeClassificationDeleteConfirmationPreference,
} from "./classificationDeletePreference";
import {
  readMeasurementDeleteConfirmationPreference,
  writeMeasurementDeleteConfirmationPreference,
} from "./measurementDeletePreference";
import {
  readRecoveredPlanStartupWorkspacePreference,
  writeRecoveredPlanStartupWorkspacePreference,
} from "./recoveredPlanStartupPreference";
import styles from "./App.module.css";

const PdfViewer = lazy(() =>
  import("../features/viewer/PdfViewer").then((module) => ({ default: module.PdfViewer })),
);

function calibrationMeasurementCount(page: PageState, calibrationId: string): number {
  return page.measurements.filter((measurement) => measurement.calibrationId === calibrationId)
    .length;
}

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
  const { state: appState, setError, clearError, dismissError } = useAppState();
  const {
    session,
    canUndo,
    canRedo,
    undo,
    redo,
    loadSession,
    clearSession,
    updatePage,
    addCalibration,
    recalibrateCalibration,
    renameCalibration,
    updateCalibration,
    pasteMeasurements,
    renameMeasurement,
    setMeasurementNote,
    setMeasurementVisibility,
    setMeasurementsVisibility,
    deleteMeasurement,
    editMeasurements,
    addClassificationDimension,
    applyClassificationTemplate,
    renameClassificationDimension,
    deleteClassificationDimension,
    archiveClassificationDimension,
    restoreClassificationDimension,
    addClassificationValue,
    renameClassificationValue,
    deleteClassificationValue,
    archiveClassificationValue,
    restoreClassificationValue,
    assignClassificationValue,
    removeClassificationValue,
    updateSettings,
  } = useSessionState();
  const {
    requestDeleteClassification,
    requestReplacePdf,
    closeDialog,
    requestRecalibration: openRecalibrationConfirmation,
    requestSetScaleRatio: openSetScaleRatioConfirmation,
    requestSaveCalibrationReferenceEdit: openCalibrationReferenceEditConfirmation,
    requestDeleteMeasurement: openDeleteMeasurementConfirmation,
    closeConfirmation,
    closeAllOverlays,
  } = useOverlayState();
  const {
    draft,
    selectedMeasurementId,
    selectedMeasurementIds,
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
    selectMeasurements: selectWorkspaceMeasurements,
    clearSelection,
    reconcileSelection,
    copyMeasurements,
    copyScale,
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
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const applicationCopyRef = useRef(false);
  const activeMeasurementEditIdRef = useRef<string | null>(null);
  const viewerPageZoomRef = useRef<{ pageNumber: number; zoom: number } | null>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [activeMeasurementEditId, setActiveMeasurementEditId] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [projectLibraryOpen, setProjectLibraryOpen] = useState(false);
  const [pendingDiscardProjectId, setPendingDiscardProjectId] = useState<string | null>(null);
  const [dismissInitialProjectLibrary, setDismissInitialProjectLibrary] = useState(false);
  const [confirmMeasurementDeletion, setConfirmMeasurementDeletionState] = useState(
    readMeasurementDeleteConfirmationPreference,
  );
  const [confirmValueDeletion, setConfirmValueDeletionState] = useState(
    () => readClassificationDeleteConfirmationPreference("value"),
  );
  const [confirmDimensionDeletion, setConfirmDimensionDeletionState] = useState(
    () => readClassificationDeleteConfirmationPreference("dimension"),
  );
  const [recoveredPlanStartupWorkspace, setRecoveredPlanStartupWorkspaceState] = useState(
    readRecoveredPlanStartupWorkspacePreference,
  );
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

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      const action = getHistoryKeyboardAction(event);
      if (!action) return;
      event.preventDefault();
      if (action === "redo") redo();
      else undo();
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [redo, undo]);

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

  const [confirmAutosaveReload, setConfirmAutosaveReload] = useState(false);

  const {
    activePdf,
    recovery,
    savedProjects,
    activeProjectId,
    recoveryChecked,
    recoveryIssue,
    confirmDiscardRecovery,
    loading,
    projectOperationPending,
    autosaveWarning,
    autosaveUnavailable,
    autosaveFailed,
    canRetryAutosave,
    retryAutosave,
    chooseFile,
    importProject,
    exportProject,
    openProject,
    refreshSavedProjects,
    discardRecovery,
    discardProject,
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
    recoveredStartupWorkspace: recoveredPlanStartupWorkspace,
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

  const setConfirmMeasurementDeletion = useCallback((enabled: boolean) => {
    setConfirmMeasurementDeletionState(enabled);
    writeMeasurementDeleteConfirmationPreference(enabled);
  }, []);

  const setConfirmValueDeletion = useCallback((enabled: boolean) => {
    setConfirmValueDeletionState(enabled);
    writeClassificationDeleteConfirmationPreference("value", enabled);
  }, []);

  const setConfirmDimensionDeletion = useCallback((enabled: boolean) => {
    setConfirmDimensionDeletionState(enabled);
    writeClassificationDeleteConfirmationPreference("dimension", enabled);
  }, []);

  const setRecoveredPlanStartupWorkspace = useCallback(
    (workspace: typeof recoveredPlanStartupWorkspace) => {
      setRecoveredPlanStartupWorkspaceState(workspace);
      writeRecoveredPlanStartupWorkspacePreference(workspace);
    },
    [],
  );

  const performMeasurementDelete = useCallback(
    (request: MeasurementDeleteRequest) => {
      const page = session?.pages[request.pageNumber];
      const measurement = page?.measurements.find(
        (candidate) => candidate.id === request.measurementId,
      );
      if (!session || session.currentPage !== request.pageNumber || !page || !measurement) return;
      deleteMeasurement(page.pageNumber, measurement.id);
      if (selectedMeasurementId === measurement.id) clearSelection();
      focusViewer();
    },
    [clearSelection, deleteMeasurement, focusViewer, selectedMeasurementId, session],
  );

  const requestMeasurementDelete = useCallback(
    (request: MeasurementDeleteRequest) => {
      const page = session?.pages[request.pageNumber];
      const measurement = page?.measurements.find(
        (candidate) => candidate.id === request.measurementId,
      );
      if (!page || !measurement) return;
      if (!confirmMeasurementDeletion) {
        performMeasurementDelete({
          pageNumber: page.pageNumber,
          measurementId: measurement.id,
          measurementName: measurement.name,
        });
        return;
      }
      openDeleteMeasurementConfirmation({
        pageNumber: page.pageNumber,
        measurementId: measurement.id,
        measurementName: measurement.name,
      });
    },
    [confirmMeasurementDeletion, openDeleteMeasurementConfirmation, performMeasurementDelete, session],
  );

  useEffect(() => {
    reconcileSelection(
      Object.values(session?.pages ?? {}).flatMap((page) =>
        page.measurements.map((measurement) => measurement.id),
      ),
    );
  }, [session?.pages, reconcileSelection]);

  const requestSelectedMeasurementsDelete = useCallback(() => {
    if (!session || selectedMeasurementIds.length === 0) return;
    const payload = {
      measurementIds: [...selectedMeasurementIds],
    };
    if (confirmMeasurementDeletion) openDeleteMeasurementConfirmation(payload);
    else if (
      editMeasurements({
        measurementIds: payload.measurementIds,
        operation: { type: "delete" },
      })
    )
      clearSelection();
  }, [
    session,
    selectedMeasurementIds,
    confirmMeasurementDeletion,
    openDeleteMeasurementConfirmation,
    editMeasurements,
    clearSelection,
  ]);

  const selectMeasurementFromPanel = useCallback(
    (pageNumber: number, measurementId: string, additive = false) => {
      if (!additive && session?.currentPage !== pageNumber) {
        if (
          draft ||
          calibrationFlow ||
          calibrationCandidate ||
          calibrationReferenceEdit ||
          activeMeasurementEditIdRef.current !== null
        ) {
          setError("Finish or cancel the current measurement or scale workflow before switching pages.");
          return;
        }
        pageChanged();
        updatePage(pageNumber);
      }
      selectWorkspaceMeasurement(measurementId, additive);
      clearError();
    },
    [
      calibrationCandidate,
      calibrationFlow,
      calibrationReferenceEdit,
      clearError,
      draft,
      pageChanged,
      selectWorkspaceMeasurement,
      session?.currentPage,
      setError,
      updatePage,
    ],
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
              ? "The copied measurements do not fit within this page without changing their geometry."
              : "Wait for this page to finish loading before pasting a measurement from another page.",
          );
          return;
        }
        pasteMeasurementsClipboard({
          clipboard: measurementClipboard,
          pageNumber: page.pageNumber,
          destinationBounds,
          destinationZoom,
          pasteMeasurements,
          selectMeasurements: selectWorkspaceMeasurements,
        });
        return;
      }

      if (
        action === "delete-measurement" &&
        (selectedMeasurementIds.length > 1 ||
          (selectedMeasurementIds.length === 1 &&
            !page.measurements.some((measurement) => measurement.id === selectedMeasurementId)))
      ) {
        event.preventDefault();
        requestSelectedMeasurementsDelete();
        return;
      }
      if (action === "copy-measurement") {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        if (selectedMeasurementIds.length === 0) return;
        const measurements = page.measurements.filter((measurement) =>
          selectedMeasurementIds.includes(measurement.id),
        );
        event.preventDefault();
        if (measurements.length !== selectedMeasurementIds.length) {
          setError("Select measurements from a single page to copy them together.");
          return;
        }
        applicationCopyRef.current = true;
        copyMeasurements(page.pageNumber, measurements);
        queueMicrotask(() => {
          applicationCopyRef.current = false;
        });
        return;
      }
      if (!selectedMeasurementId) return;
      const measurement = page.measurements.find((candidate) => candidate.id === selectedMeasurementId);
      if (!measurement) return;
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
    copyMeasurements,
    calibrationCandidate,
    calibrationFlow,
    calibrationReferenceEdit,
    draft,
    measurementClipboard,
    pasteMeasurements,
    requestMeasurementDelete,
    requestSelectedMeasurementsDelete,
    selectWorkspaceMeasurements,
    selectedMeasurementId,
    selectedMeasurementIds,
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
    calibrationReferencePreview &&
      calibrationReferenceEdit &&
      isValidCalibrationReferenceEdit(
        calibrationReferencePreview,
        calibrationReferenceEdit.reference,
      ),
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
  const previewPages =
    session && currentPage && previewPage && previewPage !== currentPage
      ? { ...session.pages, [currentPage.pageNumber]: previewPage }
      : session?.pages;
  const activePageCalibration = currentPage ? getActiveCalibration(currentPage) : null;
  const activeCalibration = activePageCalibration;
  const selectedMeasurements = Object.values(session?.pages ?? {}).flatMap((page) =>
    page.measurements.filter((measurement) => selectedMeasurementIds.includes(measurement.id)),
  );
  const selectedMeasurement =
    currentPage?.measurements.find((measurement) => measurement.id === selectedMeasurementId) ??
    null;
  useEffect(() => {
    if (!measurementDetailsOpen || selectedMeasurement) return;
    closeMeasurementDetails();
    focusViewer();
  }, [closeMeasurementDetails, focusViewer, measurementDetailsOpen, selectedMeasurement]);
  const measurementEditActive = activeMeasurementEditId !== null;
  const currentPageSelectedMeasurements = currentPage?.measurements.filter((measurement) =>
    selectedMeasurementIds.includes(measurement.id),
  ) ?? [];
  const duplicateDisabled = !currentPage || currentPageSelectedMeasurements.length === 0 ||
    currentPageSelectedMeasurements.length !== selectedMeasurementIds.length ||
    currentPageSelectedMeasurements.some((measurement) => !canDuplicateMeasurement(currentPage, measurement)) ||
    isMeasurementClipboardActionBlocked("paste-measurement", {
      measurementEditActive,
      draftActive: Boolean(draft),
      calibrationFlowActive: Boolean(calibrationFlow),
      calibrationCandidateActive: Boolean(calibrationCandidate),
      calibrationReferenceEditActive: Boolean(calibrationReferenceEdit),
    });

  function duplicateSelectedMeasurements() {
    if (!currentPage || duplicateDisabled || activeMeasurementEditIdRef.current !== null) return;
    const destinationBounds =
      viewerPageBounds?.pageNumber === currentPage.pageNumber ? viewerPageBounds.bounds : null;
    const destinationZoom =
      viewerPageZoomRef.current?.pageNumber === currentPage.pageNumber
        ? viewerPageZoomRef.current.zoom
        : null;
    pasteMeasurementsClipboard({
      clipboard: {
        sourcePageNumber: currentPage.pageNumber,
        measurement: currentPageSelectedMeasurements[0]!,
        measurements: currentPageSelectedMeasurements,
      },
      pageNumber: currentPage.pageNumber,
      destinationBounds,
      destinationZoom,
      pasteMeasurements,
      selectMeasurements: selectWorkspaceMeasurements,
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
  const calibrationDialog =
    calibrationCandidate && session && calibrationCandidatePage ? (
      <CalibrationDialog
        initialName={
          calibrationCandidate.name ??
          calibrationCandidateTarget?.name ??
          defaultCalibrationName(calibrationCandidatePage)
        }
        title={calibrationCandidateTarget ? "Recalibrate scale" : "Add scale"}
        referenceLabel={
          calibrationCandidate.phase === "x"
            ? "horizontal X"
            : calibrationCandidate.phase === "y"
              ? "vertical Y"
              : undefined
        }
        includeName={!calibrationCandidate.calibrationId && calibrationCandidate.phase !== "y"}
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
          const calibrationName = calibrationCandidateTarget?.name ?? name;
          const confirmation = confirmCalibration(
            calibrationFlow,
            calibrationCandidate,
            referenceDistanceMm,
            calibrationName,
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
                calibration,
              });
            }
          } else {
            addCalibration({
              pageNumber: calibrationCandidate.pageNumber,
              id: crypto.randomUUID(),
              name: calibrationName,
              calibration,
            });
          }
          completeCalibration();
          clearDraft();
          chooseWorkspaceTool("select");
          focusViewer();
        }}
      />
    ) : null;

  return (
    <AppShell
      documentName={session?.pdf.name ?? null}
      canExport={Boolean(session)}
      savedProjectCount={savedProjects.length}
      canUndo={canUndo}
      canRedo={canRedo}
      measurementDecimalPlaces={session?.settings.measurementDecimalPlaces ?? null}
      confirmMeasurementDeletion={confirmMeasurementDeletion}
      confirmValueDeletion={confirmValueDeletion}
      confirmDimensionDeletion={confirmDimensionDeletion}
      recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
      onExport={() => setExportDialogOpen(true)}
      onOpenProjects={() => {
        setProjectLibraryOpen(true);
        void refreshSavedProjects();
      }}
      onUndo={undo}
      onRedo={redo}
      onMeasurementDecimalPlacesChange={(measurementDecimalPlaces) =>
        updateSettings({ measurementDecimalPlaces })
      }
      onConfirmMeasurementDeletionChange={setConfirmMeasurementDeletion}
      onConfirmValueDeletionChange={setConfirmValueDeletion}
      onConfirmDimensionDeletionChange={setConfirmDimensionDeletion}
      onRecoveredPlanStartupWorkspaceChange={setRecoveredPlanStartupWorkspace}
      errorNotifications={appState.errorNotifications}
      onDismissError={dismissError}
      statusMessage={autosaveWarning}
      statusTone="warning"
      statusActions={autosaveFailed ? (
        <>
          {canRetryAutosave && (
            <button type="button" disabled={projectOperationPending} onClick={() => void retryAutosave()}>
              Retry saving
            </button>
          )}
          <button type="button" disabled={projectOperationPending} onClick={() => void exportProject()}>
            Export project
          </button>
          <button type="button" disabled={projectOperationPending} onClick={() => setConfirmAutosaveReload(true)}>
            Reload saved projects
          </button>
        </>
      ) : undefined}
      onDismissStatus={
        autosaveWarning && !autosaveUnavailable
          ? dismissAutosaveWarning
          : undefined
      }
    >
      {confirmAutosaveReload && (
        <ConfirmationDialog
          open
          title="Reload saved projects?"
          description="Reloading closes this session and discards edits that have not been saved. Export your project first to keep a copy of these edits."
          confirmLabel="Reload saved projects"
          cancelLabel="Keep editing"
          onCancel={() => setConfirmAutosaveReload(false)}
          onConfirm={() => window.location.reload()}
        />
      )}
      <input
        ref={fileInputRef}
        className={styles.hiddenInput}
        type="file"
        tabIndex={-1}
        accept="application/pdf,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void chooseFile(file);
          event.target.value = "";
        }}
      />
      <input
        ref={projectFileInputRef}
        className={styles.hiddenInput}
        type="file"
        tabIndex={-1}
        accept=".planmeasure"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            setProjectLibraryOpen(false);
            setDismissInitialProjectLibrary(true);
            void importProject(file);
          }
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
          sourcePageLabels={activePdf.pageLabels}
          logicalPageBounds={
            viewerPageBounds?.pageNumber === currentPage.pageNumber ? viewerPageBounds.bounds : null
          }
          workspacePanel={
            <WorkspacePanel
              measurements={
                <MeasurementPanel
                  key={workspaceVersion}
                  page={previewPage}
                  pages={previewPages ?? session.pages}
                  pageLabelOverrides={session.pageLabelOverrides}
                  sourcePageLabels={activePdf.pageLabels}
                  selectedMeasurementId={selectedMeasurementId}
                  selectedMeasurementIds={selectedMeasurementIds}
                  onSelectMeasurement={selectMeasurementFromPanel}
                  onSetMeasurementVisibility={setMeasurementVisibility}
                  onSetMeasurementsVisibility={setMeasurementsVisibility}
                />
              }
              takeoff={
                <TakeoffWorkspace
                  key={workspaceVersion}
                  pages={previewPages ?? session.pages}
                  catalog={session.classificationCatalog}
                  displayUnit={session.settings.displayUnit}
                  decimalPlaces={session.settings.measurementDecimalPlaces}
                  areaDisplay={session.settings.areaDisplay}
                  pageLabelOverrides={session.pageLabelOverrides}
                  sourcePageLabels={activePdf.pageLabels}
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
                  onApplyTemplate={applyClassificationTemplate}
                  onRenameDimension={renameClassificationDimension}
                  onDeleteDimension={(dimensionId) => {
                    const dimension = session.classificationCatalog.dimensions.find(
                      (item) => item.id === dimensionId,
                    );
                    if (dimension && !confirmDimensionDeletion) {
                      deleteClassificationDimension(dimensionId);
                    } else if (dimension) {
                      requestDeleteClassification({ target: "dimension", dimensionId, name: dimension.name });
                    }
                  }}
                  onArchiveDimension={archiveClassificationDimension}
                  onRestoreDimension={restoreClassificationDimension}
                  onCreateValue={(dimensionId, name) =>
                    addClassificationValue(dimensionId, crypto.randomUUID(), name)
                  }
                  onRenameValue={renameClassificationValue}
                  onDeleteValue={(dimensionId, valueId) => {
                    const value = session.classificationCatalog.dimensions
                      .find((item) => item.id === dimensionId)
                      ?.values.find((item) => item.id === valueId);
                    if (value && !confirmValueDeletion) {
                      deleteClassificationValue(dimensionId, valueId);
                    } else if (value) {
                      requestDeleteClassification({ target: "value", dimensionId, valueId, name: value.name });
                    }
                  }}
                  onArchiveValue={archiveClassificationValue}
                  onRestoreValue={restoreClassificationValue}
                />
              }
              scales={
                <ScalesWorkspace
                  page={currentPage}
                  displayUnit={session.settings.displayUnit}
                  actionsDisabled={calibrationActionsDisabled}
                  onAddScale={beginNewCalibration}
                  onAddCustomRatioScale={addCustomRatioScale}
                  onAddPresetScale={addStandardScalePreset}
                  onSetRatio={setScaleRatio}
                  onRenameScale={(calibrationId, name) =>
                    renameCalibration({
                      pageNumber: currentPage.pageNumber,
                      calibrationId,
                      name,
                    })
                  }
                  onRecalibrate={requestRecalibration}
                  onEditReference={beginCalibrationReferenceEdit}
                  onCopyScale={(calibration) => copyScale(currentPage.pageNumber, calibration)}
                />
              }
              details={
                selectedMeasurement ? (
                  <MeasurementDetails
                    key={selectedMeasurement.id}
                    page={previewPage}
                    measurement={selectedMeasurement}
                    displayUnit={session.settings.displayUnit}
                    areaDisplay={session.settings.areaDisplay}
                    measurementDecimalPlaces={session.settings.measurementDecimalPlaces}
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
                    onSaveNote={(note) =>
                      setMeasurementNote(currentPage.pageNumber, selectedMeasurement.id, note)
                    }
                    onAssignClassification={assignClassification}
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
              selectedMeasurementId={selectedMeasurement?.id ?? null}
              selectedMeasurementName={selectedMeasurement?.name ?? null}
              selectedMeasurements={selectedMeasurements}
              classificationCatalog={session.classificationCatalog}
              onEditSelectedMeasurements={editMeasurements}
              onClearMeasurementSelection={() => {
                clearSelection();
                focusViewer();
              }}
              duplicateDisabled={duplicateDisabled}
              referenceEditValid={calibrationReferenceEditIsValid}
              measurementEditActive={measurementEditActive}
              calibrationDialogOpen={Boolean(calibrationCandidate)}
              onDeleteSelectedMeasurement={() => {
                if (!selectedMeasurement) {
                  requestSelectedMeasurementsDelete();
                  return;
                }
                requestMeasurementDelete({
                  pageNumber: currentPage.pageNumber,
                  measurementId: selectedMeasurement.id,
                  measurementName: selectedMeasurement.name,
                });
              }}
              onDuplicateSelectedMeasurement={duplicateSelectedMeasurements}
              onRenameSelectedMeasurement={(name) => {
                if (selectedMeasurement) {
                  renameMeasurement(currentPage.pageNumber, selectedMeasurement.id, name);
                }
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
          viewerOverlay={calibrationDialog}
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
                  if (phase === "x" && !isAlignedXyReference(points[0], points[1], "x")) {
                    chooseTool("calibrate");
                    setError(
                      "X reference must be nearly horizontal. Place both points along the horizontal reference.",
                    );
                    return;
                  }
                  if (phase === "y" && !isAlignedXyReference(points[0], points[1], "y")) {
                    chooseTool("calibrate");
                    setError(
                      "Y reference must be nearly vertical. Place both points along the vertical reference.",
                    );
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

      <ProjectLibraryDialog
        open={
          projectLibraryOpen ||
          (Boolean(recovery && !session) && !dismissInitialProjectLibrary)
        }
        projects={savedProjects}
        currentSessionLoaded={Boolean(session)}
        activeProjectId={activeProjectId}
        opening={loading || projectOperationPending}
        pendingDiscardProjectId={pendingDiscardProjectId}
        onOpenProject={(projectId) => {
          setPendingDiscardProjectId(null);
          setProjectLibraryOpen(false);
          setDismissInitialProjectLibrary(true);
          if (session && activeProjectId === projectId) {
            return;
          }
          void openProject(projectId);
        }}
        onOpenPdf={() => {
          setPendingDiscardProjectId(null);
          setProjectLibraryOpen(false);
          setDismissInitialProjectLibrary(true);
          fileInputRef.current?.click();
        }}
        onImportProject={() => projectFileInputRef.current?.click()}
        onExportProject={(projectId) => void exportProject(projectId)}
        onRequestDiscard={setPendingDiscardProjectId}
        onCancelDiscard={() => setPendingDiscardProjectId(null)}
        onConfirmDiscard={(projectId) => {
          setPendingDiscardProjectId(null);
          if (!session) setProjectLibraryOpen(true);
          void discardProject(projectId);
        }}
        onClose={() => {
          setPendingDiscardProjectId(null);
          setProjectLibraryOpen(false);
          if (recovery && !session) setDismissInitialProjectLibrary(true);
        }}
      />

      {exportDialogOpen && session && (
        <ExportDialog
          session={session}
          pageLabels={activePdf?.pageLabels ?? null}
          onExportAnnotatedPdf={
            activePdf
              ? () => downloadAnnotatedPdf(session, activePdf.document)
              : undefined
          }
          onClose={() => setExportDialogOpen(false)}
        />
      )}

    </AppShell>
  );
}
