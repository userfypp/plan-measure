import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { retryableImport } from "./retryableImport";
import { recoverableLazy } from "./recoverableLazy";
import { AppProvider, useAppState } from "./state";
import { SessionProvider, useSessionState } from "./sessionState";
import { WorkspaceProvider, useWorkspaceState } from "./workspaceState";
import { OverlayProvider, useOverlayState } from "./overlayState";
import { OverlayHost } from "./OverlayHost";
import { AppShell, LoadingOverlay } from "./AppShell";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { EmptyWorkspaceState, WorkspaceShell } from "./WorkspaceShell";
import { WorkspacePanel } from "./WorkspacePanel";
import { ContextToolbar } from "./ContextToolbar";
import { ToolRail } from "./ToolRail";
import { usePdfSessionLifecycle } from "./usePdfSessionLifecycle";
import { usePdfPageLabels } from "./usePdfPageLabels";
import { useFileDropZone } from "./useFileDropZone";
import { useAppPreferenceSetters } from "./useAppPreferenceSetters";
import { useMeasurementShortcuts } from "./useMeasurementShortcuts";
import { useCalibrationActions } from "./useCalibrationActions";
import { Modal } from "../components/Modal";
import { Button, ConfirmationDialog } from "../components/ui";
import { ScalesWorkspace } from "../features/calibration/ScalesWorkspace";
import {
  MeasurementPanel,
  type MeasurementDeleteRequest,
} from "../features/measurements/MeasurementPanel";
import { MeasurementDetails } from "../features/measurements/MeasurementDetails";
import type { AuthoringCapability } from "../features/viewer/AuthoringCapability";
import { confirmCalibration, selectCalibrationReference } from "./calibrationFlow";
import type { LogicalPageBounds } from "../types/domain";
import { getHistoryKeyboardAction } from "../utils/keyboard";
import {
  defaultCalibrationName,
  findPageCalibration,
  getActiveCalibration,
  isValidCalibrationReferenceEdit,
} from "../utils/calibration";
import {
  canDuplicateMeasurement,
  isMeasurementClipboardActionBlocked,
  pasteMeasurementsClipboard,
  registerMeasurementClipboardInvalidation,
} from "./measurementClipboard";
import { isAlignedXyReference } from "../utils/geometry";
import { readClassificationDeleteConfirmationPreference } from "./classificationDeletePreference";
import { readMeasurementDeleteConfirmationPreference } from "./measurementDeletePreference";
import { readRecoveredPlanStartupWorkspacePreference } from "./recoveredPlanStartupPreference";
import { readKeyboardAuthoringPreference } from "./keyboardAuthoringPreference";
import { createScaleCheckStore } from "../features/calibration/scaleCheckState";
import {
  calibrationReferenceEditPreview,
  getAddCountItemsDisabledReason,
  getMeasurementToolDisabledReason,
  getPrecisionAuthoringDisabledReason,
  getPreviewPage,
  getPreviewPages,
  getSelectedMeasurement,
  getSelectedMeasurements,
  getToolAvailability,
} from "./appDerivations";
import styles from "./App.module.css";

const loadViewer = retryableImport(() => import("../features/viewer/PdfViewer"));
const PdfViewer = recoverableLazy(() =>
  loadViewer().then((module) => ({ default: module.PdfViewer })),
  "viewer",
);

const loadScaleCheck = retryableImport(() => import("../features/calibration/ScaleCheckPanel"));
const ScaleCheckPanel = recoverableLazy(() =>
  loadScaleCheck().then((module) => ({ default: module.ScaleCheckPanel })),
  "scale check",
);

const loadClassifications = retryableImport(() => import("../features/classification/ClassificationWorkspace"));
const ClassificationWorkspace = recoverableLazy(() =>
  loadClassifications().then((module) => ({ default: module.ClassificationWorkspace })),
  "classifications",
);

const loadTakeoff = retryableImport(() => import("../features/measurements/TakeoffWorkspace"));
const TakeoffWorkspace = recoverableLazy(() =>
  loadTakeoff().then((module) => ({ default: module.TakeoffWorkspace })),
  "takeoff",
);

const loadProjectLibrary = retryableImport(() => import("./ProjectLibraryDialog"));
const ProjectLibraryDialog = recoverableLazy(() =>
  loadProjectLibrary().then((module) => ({ default: module.ProjectLibraryDialog })),
  "project library",
);

const loadCalibrationDialog = retryableImport(() => import("../features/calibration/CalibrationDialog"));
const CalibrationDialog = recoverableLazy(() =>
  loadCalibrationDialog().then((module) => ({ default: module.CalibrationDialog })),
  "scale dialog",
);

const loadExportDialog = retryableImport(() => import("../features/export/ExportDialog"));

type ExportDialogComponent = typeof import("../features/export/ExportDialog").ExportDialog;

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
    updateMeasurements,
    moveCountItem,
    renameMeasurement,
    setMeasurementNote,
    setMeasurementColor,
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
    activeTool,
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
  const [scaleCheckStore] = useState(createScaleCheckStore);
  const [scaleCheckLoaded, setScaleCheckLoaded] = useState(false);
  useLayoutEffect(() => {
    const check = scaleCheckStore.getSnapshot();
    if (!check) return;
    const page = session?.pages[session.currentPage];
    const valid =
      page &&
      check.pageNumber === page.pageNumber &&
      check.activeCalibrationId === page.activeCalibrationId &&
      check.workspaceVersion === workspaceVersion &&
      page.calibrations.includes(check.calibration);
    if (!valid || (!check.points && activeTool !== "calibrate")) {
      scaleCheckStore.clear();
      if (activeTool === "calibrate" && !calibrationFlow && !calibrationReferenceEdit) {
        clearDraft();
        chooseWorkspaceTool("select");
      }
    }
  }, [
    session,
    workspaceVersion,
    activeTool,
    calibrationFlow,
    calibrationReferenceEdit,
    clearDraft,
    chooseWorkspaceTool,
    scaleCheckStore,
  ]);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !scaleCheckStore.getSnapshot()) return;
      scaleCheckStore.clear();
      clearDraft();
      chooseWorkspaceTool("select");
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [scaleCheckStore, clearDraft, chooseWorkspaceTool]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const applicationCopyRef = useRef(false);
  const activeMeasurementEditIdRef = useRef<string | null>(null);
  const viewerPageZoomRef = useRef<{ pageNumber: number; zoom: number } | null>(null);
  const [activeMeasurementEditId, setActiveMeasurementEditId] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [ExportDialog, setExportDialog] = useState<ExportDialogComponent | null>(null);
  const openExportDialog = useCallback(() => {
    if (ExportDialog) {
      setExportDialogOpen(true);
      return;
    }
    // Load on demand before mounting: a new Suspense fallback would delay its
    // first successful commit even when this small chunk is already downloaded.
    void loadExportDialog().then(
      ({ ExportDialog: component }) => {
        setExportDialog(() => component);
        setExportDialogOpen(true);
      },
      () => {
        setError("Could not load export. Check your connection and click Export to try again.");
      },
    );
  }, [ExportDialog, setError]);
  const [projectLibraryOpen, setProjectLibraryOpen] = useState(false);
  const [pendingDiscardProjectId, setPendingDiscardProjectId] = useState<string | null>(null);
  const [dismissInitialProjectLibrary, setDismissInitialProjectLibrary] = useState(false);
  const [keyboardAuthoringEnabled, setKeyboardAuthoringEnabledState] = useState(
    readKeyboardAuthoringPreference,
  );
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
      ).find((candidate) => candidate.dataset.measurementId === measurementId && !candidate.closest("[hidden]"));
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
    saveStatusStore,
    autosaveWarning,
    autosaveUnavailable,
    autosaveFailed,
    canRetryAutosave,
    retryAutosave,
    chooseFile,
    importProject,
    openSampleProject,
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

  const sourcePageLabels = usePdfPageLabels(activePdf);

  const {
    setKeyboardAuthoringEnabled,
    setConfirmMeasurementDeletion,
    setConfirmValueDeletion,
    setConfirmDimensionDeletion,
    setRecoveredPlanStartupWorkspace,
  } = useAppPreferenceSetters({
    setKeyboardAuthoringEnabledState,
    setConfirmMeasurementDeletionState,
    setConfirmValueDeletionState,
    setConfirmDimensionDeletionState,
    setRecoveredPlanStartupWorkspaceState,
  });

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

  const sampleLinkHandledRef = useRef(false);
  useEffect(() => {
    if (sampleLinkHandledRef.current || !recoveryChecked || loading || projectOperationPending) return;
    sampleLinkHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("sample") !== "1") return;
    params.delete("sample");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    if (!session && !recoveryIssue) void openSampleProject();
  }, [recoveryChecked, loading, projectOperationPending, session, recoveryIssue, openSampleProject]);

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
        scaleCheckStore.clear();
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
      scaleCheckStore,
      setError,
      updatePage,
    ],
  );

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      scaleCheckStore.clear();
      pageChanged();
      closeConfirmation();
      clearError();
      updatePage(pageNumber);
    },
    [clearError, closeConfirmation, pageChanged, updatePage, scaleCheckStore],
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

  useMeasurementShortcuts({
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
    activeMeasurementEditIdRef,
    viewerPageZoomRef,
    applicationCopyRef,
  });

  useEffect(() => {
    return registerMeasurementClipboardInvalidation({
      documentTarget: document,
      windowTarget: window,
      applicationCopyInProgress: () => applicationCopyRef.current,
      clearClipboard: clearMeasurementClipboard,
    });
  }, [clearMeasurementClipboard]);

  const { dragActive, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useFileDropZone(chooseFile);

  const currentPage = session?.pages[session.currentPage];
  const calibrationCandidatePage = calibrationCandidate
    ? (session?.pages[calibrationCandidate.pageNumber] ?? null)
    : null;
  const calibrationCandidateTarget =
    calibrationCandidatePage && calibrationCandidate?.calibrationId
      ? findPageCalibration(calibrationCandidatePage, calibrationCandidate.calibrationId)
      : null;
  const calibrationReferencePreview = calibrationReferenceEdit
    ? calibrationReferenceEditPreview(session, calibrationReferenceEdit)
    : null;
  const calibrationReferenceEditIsValid = Boolean(
    calibrationReferencePreview &&
      calibrationReferenceEdit &&
      isValidCalibrationReferenceEdit(
        calibrationReferencePreview,
        calibrationReferenceEdit.reference,
      ),
  );
  const previewPage = getPreviewPage(
    currentPage,
    calibrationReferenceEdit,
    calibrationReferencePreview,
    calibrationReferenceEditIsValid,
  );
  const previewPages = getPreviewPages(session, currentPage, previewPage);
  const activePageCalibration = currentPage ? getActiveCalibration(currentPage) : null;
  const activeCalibration = activePageCalibration;
  const selectedMeasurements = getSelectedMeasurements(session, selectedMeasurementIds);
  const selectedMeasurement = getSelectedMeasurement(currentPage, selectedMeasurementId);
  useEffect(() => {
    if (!measurementDetailsOpen || selectedMeasurement) return;
    closeMeasurementDetails();
    focusViewer();
  }, [closeMeasurementDetails, focusViewer, measurementDetailsOpen, selectedMeasurement]);
  const measurementEditActive = activeMeasurementEditId !== null;
  const summaryExportBlocked = Boolean(
    draft || measurementEditActive || calibrationFlow || calibrationCandidate || calibrationReferenceEdit,
  );
  const openTakeoffMeasurement = useCallback((pageNumber: number, measurementId: string) => {
    if (summaryExportBlocked || !session?.pages[pageNumber]?.measurements.some((measurement) => measurement.id === measurementId)) return;
    chooseWorkspaceTool("select");
    selectMeasurementFromPanel(pageNumber, measurementId);
    openMeasurementDetails();
    focusMeasurementDetails();
  }, [summaryExportBlocked, session, chooseWorkspaceTool, selectMeasurementFromPanel, openMeasurementDetails, focusMeasurementDetails]);
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
  const {
    chooseTool,
    cancelCalibration,
    beginNewCalibration,
    addStandardScalePreset,
    addCustomRatioScale,
    setScaleRatio,
    requestRecalibration,
    assignClassification,
    beginCalibrationReferenceEdit,
    updateCalibrationReferenceEdit,
    cancelCalibrationReferenceEdit,
    requestCalibrationReferenceEditSave,
    handleOverlayConfirmationConfirm,
  } = useCalibrationActions({
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
  });
  const precisionAuthoringDisabledReason = getPrecisionAuthoringDisabledReason(authoringCapability);
  const primaryToolsLocked = Boolean(calibrationFlow || calibrationReferenceEdit);
  const primaryToolLockReason = calibrationReferenceEdit
    ? "Finish or cancel the scale reference edit first"
    : "Finish or cancel calibration first";
  const canCreateMeasurements =
    Boolean(activeCalibration) && !primaryToolsLocked && !precisionAuthoringBlocked;
  const measurementToolDisabledReason = getMeasurementToolDisabledReason(
    primaryToolsLocked,
    primaryToolLockReason,
    precisionAuthoringBlocked,
    precisionAuthoringDisabledReason,
  );
  const toolAvailability = getToolAvailability(
    primaryToolsLocked,
    primaryToolLockReason,
    canCreateMeasurements,
    measurementToolDisabledReason,
    precisionAuthoringBlocked,
    precisionAuthoringDisabledReason,
  );
  const addCountItemsDisabledReason = getAddCountItemsDisabledReason(
    selectedMeasurement,
    primaryToolsLocked,
    primaryToolLockReason,
    precisionAuthoringBlocked,
    precisionAuthoringDisabledReason,
    measurementEditActive,
  );
  function beginAddingCountItems() {
    if (selectedMeasurement?.type !== "count" || addCountItemsDisabledReason) return;
    selectWorkspaceMeasurement(selectedMeasurement.id);
    closeMeasurementDetails();
    chooseTool("count");
    focusViewer();
  }
  const calibrationDialog =
    calibrationCandidate && session && calibrationCandidatePage ? (
      <Suspense fallback={null}>
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
      </Suspense>
    ) : null;

  return (
    <>
    <AppShell
      interactionBlocked={loading}
      saveStatus={session && saveStatusStore ? (
        <SaveStatusIndicator
          store={saveStatusStore}
          pending={projectOperationPending}
          canRetry={canRetryAutosave}
          onExport={() => void exportProject()}
          onRetry={() => void retryAutosave()}
          onReload={() => setConfirmAutosaveReload(true)}
        />
      ) : undefined}
      documentName={session?.pdf.name ?? null}
      canExport={Boolean(session)}
      savedProjectCount={savedProjects.length}
      canUndo={canUndo}
      canRedo={canRedo}
      measurementDecimalPlaces={session?.settings.measurementDecimalPlaces ?? null}
      viewSettings={
        session
          ? {
              displayUnit: session.settings.displayUnit,
              areaDisplay: session.settings.areaDisplay,
              showLabels: session.settings.showLabels,
              showMeasurements: session.settings.showMeasurements,
              showCalibration: session.settings.showCalibration,
              labelClassificationDimensionId: session.settings.labelClassificationDimensionId,
            }
          : null
      }
      classificationDimensions={session?.classificationCatalog.dimensions}
      keyboardAuthoringEnabled={keyboardAuthoringEnabled}
      confirmMeasurementDeletion={confirmMeasurementDeletion}
      confirmValueDeletion={confirmValueDeletion}
      confirmDimensionDeletion={confirmDimensionDeletion}
      recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
      onExport={openExportDialog}
      onOpenProjects={() => {
        setProjectLibraryOpen(true);
        void refreshSavedProjects();
      }}
      onUndo={undo}
      onRedo={redo}
      onViewSettingsChange={updateSettings}
      onMeasurementDecimalPlacesChange={(measurementDecimalPlaces) =>
        updateSettings({ measurementDecimalPlaces })
      }
      onKeyboardAuthoringEnabledChange={setKeyboardAuthoringEnabled}
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
          keyboardAuthoringEnabled={keyboardAuthoringEnabled}
          dragActive={dragActive}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          pdfDocument={activePdf.document}
          sourcePageLabels={sourcePageLabels}
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
                  sourcePageLabels={sourcePageLabels}
                  selectedMeasurementId={selectedMeasurementId}
                  selectedMeasurementIds={selectedMeasurementIds}
                  onSelectMeasurement={selectMeasurementFromPanel}
                  onSetMeasurementVisibility={setMeasurementVisibility}
                  onSetMeasurementsVisibility={setMeasurementsVisibility}
                />
              }
              takeoff={
                <Suspense fallback={null}>
                  <TakeoffWorkspace
                    key={workspaceVersion}
                    pages={previewPages ?? session.pages}
                    catalog={session.classificationCatalog}
                    onOpenMeasurement={openTakeoffMeasurement}
                    navigationBlocked={summaryExportBlocked}
                    displayUnit={session.settings.displayUnit}
                    decimalPlaces={session.settings.measurementDecimalPlaces}
                    areaDisplay={session.settings.areaDisplay}
                    pageLabelOverrides={session.pageLabelOverrides}
                    sourcePageLabels={sourcePageLabels}
                  />
                </Suspense>
              }
              classifications={
                <Suspense fallback={null}>
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
                </Suspense>
              }
              scales={
                <ScalesWorkspace
                  page={currentPage}
                  displayUnit={session.settings.displayUnit}
                  actionsDisabled={calibrationActionsDisabled}
                  onCheckScale={(calibration) => {
                    if (calibrationActionsDisabled || measurementEditActive || draft) return;
                    setScaleCheckLoaded(true);
                    scaleCheckStore.begin({
                      pageNumber: currentPage.pageNumber,
                      activeCalibrationId: currentPage.activeCalibrationId,
                      workspaceVersion,
                      calibration,
                    });
                    clearDraft();
                    chooseWorkspaceTool("calibrate");
                    clearError();
                    focusViewer();
                  }}
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
                    onChangeColor={(color) =>
                      setMeasurementColor(currentPage.pageNumber, selectedMeasurement.id, color)
                    }
                    onAssignClassification={assignClassification}
                    onAddCountItems={beginAddingCountItems}
                    addCountItemsDisabledReason={addCountItemsDisabledReason}
                    onMoveCountItem={(itemIndex, targetId) => {
                      if (!moveCountItem({
                        pageNumber: currentPage.pageNumber,
                        sourceId: selectedMeasurement.id,
                        targetId,
                        itemIndex,
                      })) return;
                      if (selectedMeasurement.points.length === 1) {
                        chooseTool("select");
                        selectWorkspaceMeasurement(targetId);
                        focusMeasurementDetails();
                      }
                    }}
                    onRemoveCountItem={(index) => {
                      updateMeasurements([{
                        pageNumber: currentPage.pageNumber,
                        id: selectedMeasurement.id,
                        points: selectedMeasurement.points.filter((_, pointIndex) => pointIndex !== index),
                      }]);
                    }}
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
              onAddCountItems={beginAddingCountItems}
              addCountItemsDisabledReason={addCountItemsDisabledReason}
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
          viewerTransientOverlay={scaleCheckLoaded ? (
            <Suspense fallback={null}>
              <ScaleCheckPanel store={scaleCheckStore} />
            </Suspense>
          ) : null}
          viewer={
            <Suspense
              fallback={
                <div className={styles.viewerLoading} role="status">
                  Loading viewer…
                </div>
              }
            >
              <PdfViewer
                keyboardAuthoringEnabled={keyboardAuthoringEnabled}
                document={activePdf.document}
                page={previewPage}
                onPageChange={handlePageChange}
                onPageBoundsChange={handleViewerPageBoundsChange}
                onViewZoomChange={handleViewerViewZoomChange}
                activeMeasurementEditId={activeMeasurementEditId}
                onMeasurementEditActiveChange={handleMeasurementEditActiveChange}
                onChooseTool={chooseTool}
                scaleCheckStore={scaleCheckStore}
                onCalibrationCandidate={(points) => {
                  if (scaleCheckStore.getSnapshot()) {
                    scaleCheckStore.select(points);
                    return;
                  }
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
                onCalibrationReferenceEditSave={requestCalibrationReferenceEditSave}
              />
            </Suspense>
          }
          onAuthoringCapabilityChange={handleAuthoringCapabilityChange}
        />
      ) : (
        <WorkspaceShell
          keyboardAuthoringEnabled={keyboardAuthoringEnabled}
          isEmpty
          dragActive={dragActive}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          emptyState={
            <EmptyWorkspaceState
              onOpenPdf={() => fileInputRef.current?.click()}
              onOpenSample={() => void openSampleProject()}
              disabled={!recoveryChecked || loading || projectOperationPending}
            />
          }
        />
      )}

      {!recoveryChecked && <LoadingOverlay>Checking for a saved session…</LoadingOverlay>}

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

      {(projectLibraryOpen || (Boolean(recovery && !session) && !dismissInitialProjectLibrary)) && (
      <Suspense fallback={null}>
      <ProjectLibraryDialog
        open
        projects={savedProjects}
        currentSessionLoaded={Boolean(session && activePdf)}
        activeProjectId={activeProjectId}
        opening={loading || projectOperationPending}
        pendingDiscardProjectId={pendingDiscardProjectId}
        onOpenProject={(projectId) => {
          setPendingDiscardProjectId(null);
          setProjectLibraryOpen(false);
          setDismissInitialProjectLibrary(true);
          if (session && activePdf && activeProjectId === projectId) {
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
      </Suspense>
      )}

      {exportDialogOpen && session && ExportDialog && (
          <ExportDialog
            session={session}
            summaryBlocked={summaryExportBlocked}
            pageLabels={sourcePageLabels}
            onExportAnnotatedPdf={
              activePdf
                ? async () => {
                    const { downloadAnnotatedPdf } = await import("../features/export/annotatedPdf");
                    await downloadAnnotatedPdf(session, activePdf.document);
                  }
                : undefined
            }
            onClose={() => setExportDialogOpen(false)}
          />
      )}

    </AppShell>
    {loading && <LoadingOverlay>Loading PDF…</LoadingOverlay>}
    </>
  );
}
