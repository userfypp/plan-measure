import { lazy, Suspense, useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { AppProvider, useAppState } from "./state";
import { createEmptySession, SessionProvider, useSessionState } from "./sessionState";
import { WorkspaceProvider, useWorkspaceState } from "./workspaceState";
import {
  OverlayProvider,
  useOverlayState,
  type OverlayConfirmation,
  type OverlayDialog,
} from "./overlayState";
import { OverlayHost } from "./OverlayHost";
import { enqueueAutosave, isAutosaveReady } from "./autosave";
import { AppShell, LoadingOverlay } from "./AppShell";
import { EmptyWorkspaceState, WorkspaceShell } from "./WorkspaceShell";
import { ViewerContextBar, type ViewerContextData } from "./ViewerContextBar";
import { ToolRail } from "./ToolRail";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui";
import { CalibrationDialog } from "../features/calibration/CalibrationDialog";
import { ClassificationWorkspace } from "../features/classification/ClassificationWorkspace";
import { MeasurementClassificationDock } from "../features/classification/MeasurementClassificationDock";
import {
  MeasurementPanel,
  type MeasurementDeleteRequest,
} from "../features/measurements/MeasurementPanel";
import { SelectionInspectorPanel } from "../features/measurements/SelectionInspectorPanel";
import { type ToolAvailabilityMap } from "../features/viewer/toolRegistry";
import { canActivatePdf, PdfLoadLifecycle, shouldConfirmPdfReplacement } from "./pdfLoadLifecycle";
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
  PageCalibration,
  Point,
  SessionV6,
  Tool,
} from "../types/domain";
import { downloadCsv } from "../services/csv";
import {
  discardSavedSession,
  loadSavedSession,
  replaceSavedSession,
  saveSessionMetadata,
  type SavedSession,
} from "../services/persistence";
import type { LoadedPdf } from "../services/pdf";
import { PdfUserError, validatePdfFile } from "../services/pdfValidation";
import { shouldIgnoreKeyboardShortcut } from "../utils/keyboard";
import {
  findPageCalibration,
  getActiveCalibration,
  replaceCalibrationReferencePoints,
} from "../utils/calibration";
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

async function loadPdfRuntime(blob: Blob): Promise<LoadedPdf> {
  const { loadPdf } = await import("../services/pdf");
  return loadPdf(blob);
}

interface PendingPdf {
  pdfId: string;
  file: File;
  loaded: LoadedPdf;
  session: SessionV6;
  loadGeneration: number;
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
    renameMeasurement,
    setMeasurementVisibility,
    deleteMeasurement,
    addClassificationDimension,
    renameClassificationDimension,
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
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceGenerationRef = useRef(0);
  const pdfLoadLifecycleRef = useRef(new PdfLoadLifecycle());
  const activePdfRef = useRef<LoadedPdf | null>(null);
  const pendingPdfRef = useRef<PendingPdf | null>(null);
  const activatingPdfRef = useRef<LoadedPdf | null>(null);
  const dragDepthRef = useRef(0);
  const disposedRef = useRef(false);
  const latestPdfLoadRef = useRef<number | null>(null);
  const activationCountRef = useRef(0);
  const [activePdf, setActivePdf] = useState<LoadedPdf | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [recovery, setRecovery] = useState<SavedSession | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryIssue, setRecoveryIssue] = useState<string | null>(null);
  const [recoveryProtected, setRecoveryProtected] = useState(false);
  const [confirmDiscardRecovery, setConfirmDiscardRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const [autosaveWarning, setAutosaveWarning] = useState<string | null>(null);

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

  const destroyPdf = useCallback(
    (loaded: LoadedPdf | null | undefined) => pdfLoadLifecycleRef.current.destroy(loaded),
    [],
  );

  const updateLoadingState = useCallback(() => {
    if (disposedRef.current) return;
    setLoading(latestPdfLoadRef.current !== null || activationCountRef.current > 0);
  }, []);

  function beginPdfLoad(generation: number) {
    latestPdfLoadRef.current = generation;
    updateLoadingState();
  }

  function finishPdfLoad(generation: number) {
    if (latestPdfLoadRef.current !== generation) return;
    latestPdfLoadRef.current = null;
    updateLoadingState();
  }

  function beginPdfActivation(loadGeneration: number) {
    activationCountRef.current += 1;
    finishPdfLoad(loadGeneration);
    updateLoadingState();
  }

  function finishPdfActivation() {
    activationCountRef.current = Math.max(0, activationCountRef.current - 1);
    updateLoadingState();
  }

  function publishPendingPdf(candidate: PendingPdf) {
    const previous = pendingPdfRef.current;
    pendingPdfRef.current = candidate;
    requestReplacePdf({ pdfId: candidate.pdfId, fileName: candidate.file.name });
    if (previous && previous !== candidate) void destroyPdf(previous.loaded);
  }

  function clearPendingPdf(candidate?: PendingPdf) {
    const pending = pendingPdfRef.current;
    if (!pending || (candidate && pending !== candidate)) return;
    pendingPdfRef.current = null;
    closeDialog();
    void destroyPdf(pending.loaded);
  }

  const installActivePdf = useCallback(
    async (loaded: LoadedPdf): Promise<boolean> => {
      const previous = activePdfRef.current;
      activePdfRef.current = loaded;
      await destroyPdf(previous);
      if (disposedRef.current || activePdfRef.current !== loaded) {
        if (activePdfRef.current === loaded) activePdfRef.current = null;
        await destroyPdf(loaded);
        return false;
      }
      setActivePdf(loaded);
      return true;
    },
    [destroyPdf],
  );

  useEffect(() => {
    disposedRef.current = false;
    const lifecycle = pdfLoadLifecycleRef.current;
    return () => {
      disposedRef.current = true;
      lifecycle.begin();
      latestPdfLoadRef.current = null;
      const active = activePdfRef.current;
      const pending = pendingPdfRef.current;
      const activating = activatingPdfRef.current;
      activePdfRef.current = null;
      pendingPdfRef.current = null;
      activatingPdfRef.current = null;
      void Promise.all([destroyPdf(active), destroyPdf(pending?.loaded), destroyPdf(activating)]);
    };
  }, [destroyPdf]);

  useEffect(() => {
    let cancelled = false;
    void loadSavedSession()
      .then((saved) => {
        if (cancelled) return;
        setRecovery(saved);
        setRecoveryProtected(Boolean(saved));
        setRecoveryChecked(true);
      })
      .catch((error: unknown) => {
        console.error("IndexedDB recovery failed.", error);
        if (cancelled) return;
        setRecoveryProtected(true);
        setRecoveryIssue(
          "The previous session could not be read. You can try to discard it or continue without browser recovery.",
        );
        setRecoveryChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const autosaveInputs = {
      snapshot: session,
      pdfRuntimeReady: activePdf !== null,
      pdfBlob,
      enabled: autosaveEnabled,
    };
    if (!isAutosaveReady(autosaveInputs)) return;
    const snapshot = autosaveInputs.snapshot;
    const generation = persistenceGenerationRef.current;
    const timer = window.setTimeout(() => {
      saveQueueRef.current = enqueueAutosave(
        saveQueueRef.current,
        snapshot,
        generation,
        (candidateGeneration) => candidateGeneration === persistenceGenerationRef.current,
        saveSessionMetadata,
      )
        .then(() => {
          if (generation === persistenceGenerationRef.current) setAutosaveWarning(null);
        })
        .catch((error: unknown) => {
          if (generation !== persistenceGenerationRef.current) return;
          console.error("IndexedDB autosave failed.", error);
          setAutosaveWarning(
            "Autosave is unavailable. Keep this tab open or export your measurements before leaving.",
          );
          setAutosaveEnabled(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activePdf, autosaveEnabled, pdfBlob, session]);

  useEffect(() => {
    function handleDelete(event: KeyboardEvent) {
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        shouldIgnoreKeyboardShortcut(event) ||
        !selectedMeasurementId ||
        !session
      ) {
        return;
      }
      const page = session.pages[session.currentPage];
      const measurement = page?.measurements.find(
        (candidate) => candidate.id === selectedMeasurementId,
      );
      if (!page || !measurement) return;
      event.preventDefault();
      requestMeasurementDelete({
        pageNumber: page.pageNumber,
        measurementId: measurement.id,
        measurementName: measurement.name,
      });
    }
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [requestMeasurementDelete, selectedMeasurementId, session]);

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

  async function activatePdf(candidate: PendingPdf, requiresPendingConfirmation = false) {
    if (
      disposedRef.current ||
      !canActivatePdf(
        pdfLoadLifecycleRef.current,
        candidate.loadGeneration,
        candidate,
        pendingPdfRef.current,
        requiresPendingConfirmation,
      )
    ) {
      await destroyPdf(candidate.loaded);
      return;
    }
    if (pendingPdfRef.current === candidate) {
      pendingPdfRef.current = null;
      closeDialog();
    }
    cancelWorkspaceCalibration();
    closeConfirmation();
    cancelReferenceEdit();
    activatingPdfRef.current = candidate.loaded;
    beginPdfActivation(candidate.loadGeneration);
    persistenceGenerationRef.current += 1;
    setAutosaveEnabled(false);
    try {
      await saveQueueRef.current.catch(() => undefined);
      if (disposedRef.current) return;

      let saved = false;
      try {
        await replaceSavedSession(candidate.session, candidate.file);
        saved = true;
      } catch (error) {
        console.error("Could not save the new PDF session.", error);
        setAutosaveEnabled(false);
        setAutosaveWarning(
          "The PDF is open, but autosave is unavailable. Your work may not survive a reload.",
        );
      }
      if (disposedRef.current) return;

      const installed = await installActivePdf(candidate.loaded);
      if (!installed) return;
      setPdfBlob(candidate.file);
      loadSession(candidate.session);
      resetWorkspace();
      closeAllOverlays();
      if (saved) {
        setAutosaveEnabled(true);
        setAutosaveWarning(null);
      } else {
        setError("Autosave could not be started.");
      }
    } finally {
      if (activatingPdfRef.current === candidate.loaded) activatingPdfRef.current = null;
      finishPdfActivation();
    }
  }

  async function chooseFile(file: File) {
    const loadGeneration = pdfLoadLifecycleRef.current.begin();
    clearPendingPdf();
    beginPdfLoad(loadGeneration);
    let loaded: LoadedPdf | null = null;
    let handedOff = false;
    try {
      validatePdfFile(file);
      loaded = await loadPdfRuntime(file);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
        await destroyPdf(loaded);
        return;
      }
      const newSession = createEmptySession(
        { name: file.name, size: file.size, lastModified: file.lastModified },
        loaded.document.numPages,
      );
      const candidate = {
        pdfId: crypto.randomUUID(),
        file,
        loaded,
        session: newSession,
        loadGeneration,
      };
      if (
        shouldConfirmPdfReplacement({
          sessionLoaded: Boolean(session),
          pdfRuntimeLoaded: Boolean(activePdfRef.current),
          pdfActivating: Boolean(activatingPdfRef.current),
          recoveryProtected,
        })
      ) {
        handedOff = true;
        publishPendingPdf(candidate);
        finishPdfLoad(loadGeneration);
      } else {
        handedOff = true;
        await activatePdf(candidate);
      }
    } catch (error) {
      if (loaded && !handedOff) await destroyPdf(loaded);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
      const message =
        error instanceof PdfUserError
          ? error.message
          : "The PDF could not be opened. Try another file.";
      setError(message);
      finishPdfLoad(loadGeneration);
    }
  }

  async function continueRecovery() {
    if (!recovery) return;
    const loadGeneration = pdfLoadLifecycleRef.current.begin();
    beginPdfLoad(loadGeneration);
    let loaded: LoadedPdf | null = null;
    try {
      loaded = await loadPdfRuntime(recovery.pdfBlob);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
        await destroyPdf(loaded);
        return;
      }
      if (loaded.document.numPages !== recovery.session.pageCount) {
        await destroyPdf(loaded);
        loaded = null;
        throw new Error("The saved PDF does not match its session metadata.");
      }
      // Recovery order: install the validated runtime before publishing the
      // persistent snapshot, then reset interaction/UI state and enable saves.
      const installed = await installActivePdf(loaded);
      if (!installed) return;
      loaded = null;
      setPdfBlob(recovery.pdfBlob);
      loadSession(recovery.session);
      resetWorkspace();
      closeAllOverlays();
      setAutosaveEnabled(true);
      setRecovery(null);
      setRecoveryProtected(false);
    } catch (error) {
      if (loaded) await destroyPdf(loaded);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
      console.error("Saved PDF recovery failed.", error);
      setError("The previous session could not be restored. You can discard it and open a PDF.");
    } finally {
      finishPdfLoad(loadGeneration);
    }
  }

  async function discardRecovery() {
    pdfLoadLifecycleRef.current.begin();
    latestPdfLoadRef.current = null;
    updateLoadingState();
    persistenceGenerationRef.current += 1;
    setAutosaveEnabled(false);
    cancelWorkspaceCalibration();
    closeConfirmation();
    cancelReferenceEdit();
    try {
      await saveQueueRef.current.catch(() => undefined);
      await discardSavedSession();
      if (disposedRef.current) return;
      setRecovery(null);
      setRecoveryIssue(null);
      setRecoveryProtected(false);
      setConfirmDiscardRecovery(false);
      clearSession();
      resetWorkspace();
      closeAllOverlays();
    } catch (error) {
      console.error("Could not discard the saved session.", error);
      setError("The saved session could not be discarded.");
    }
  }

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

  function handleOverlayDialogConfirm(dialog: OverlayDialog) {
    if (dialog.type !== "replacePdf") return;
    const candidate = pendingPdfRef.current;
    if (!candidate || candidate.pdfId !== dialog.payload.pdfId) return;
    void activatePdf(candidate, true);
  }

  function handleOverlayDialogCancel(dialog: OverlayDialog) {
    if (dialog.type !== "replacePdf") return;
    const candidate = pendingPdfRef.current;
    if (!candidate || candidate.pdfId !== dialog.payload.pdfId) return;
    clearPendingPdf(candidate);
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

  function exportMeasurements() {
    if (!session) return;
    try {
      downloadCsv(session, activePdf?.pageLabels ?? null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The CSV could not be exported.");
    }
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
      onExport={exportMeasurements}
      statusMessage={autosaveWarning ?? appState.error}
      statusTone={autosaveWarning ? "warning" : "error"}
      onDismissStatus={() => {
        if (autosaveWarning) setAutosaveWarning(null);
        else {
          clearError();
        }
      }}
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
                <div className={styles.scaleControlsActions}>
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
                  page={previewPage}
                  onSelectMeasurement={selectMeasurementFromPanel}
                  onRenameMeasurement={renameMeasurement}
                  onSetMeasurementVisibility={setMeasurementVisibility}
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
                <Button variant="secondary" onClick={() => setConfirmDiscardRecovery(false)}>
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
                <Button variant="dangerSecondary" onClick={() => setConfirmDiscardRecovery(true)}>
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
                <Button variant="secondary" onClick={() => setConfirmDiscardRecovery(false)}>
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
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRecoveryIssue(null);
                    setAutosaveEnabled(false);
                    setAutosaveWarning(
                      "The previous saved session is protected. Opening another PDF will require confirmation.",
                    );
                  }}
                >
                  Continue without recovery
                </Button>
                <Button variant="dangerSecondary" onClick={() => setConfirmDiscardRecovery(true)}>
                  Discard saved session
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}

      <OverlayHost
        onDialogConfirm={handleOverlayDialogConfirm}
        onDialogCancel={handleOverlayDialogCancel}
        onConfirmationConfirm={handleOverlayConfirmationConfirm}
      />

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
