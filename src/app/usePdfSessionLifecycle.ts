import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueAutosave, isAutosaveReady, isSessionPersistable } from "./autosave";
import {
  canActivatePdf,
  PdfLoadLifecycle,
  shouldConfirmPdfReplacement,
} from "./pdfLoadLifecycle";
import { createEmptySession } from "./sessionState";
import type {
  OverlayConfirmation,
  OverlayDialog,
  ReplacePdfPayload,
} from "./overlayState";
import type { CurrentSession } from "../types/domain";
import {
  discardSavedSession,
  loadSavedSession,
  PersistenceLoadError,
  replaceSavedSession,
  saveSessionMetadata,
  type SavedSession,
} from "../services/persistence";
import type { LoadedPdf } from "../services/pdf";
import { PdfUserError, validatePdfFile } from "../services/pdfValidation";

async function loadPdfRuntime(blob: Blob): Promise<LoadedPdf> {
  const { loadPdf } = await import("../services/pdf");
  return loadPdf(blob);
}

interface PendingPdf {
  pdfId: string;
  file: File;
  loaded: LoadedPdf;
  session: CurrentSession;
  loadGeneration: number;
}

interface PdfSessionLifecycleOptions {
  session: CurrentSession | null;

  loadSession: (session: CurrentSession) => void;
  clearSession: () => void;

  resetWorkspace: () => void;
  cancelWorkspaceCalibration: () => void;
  cancelReferenceEdit: () => void;

  requestReplacePdf: (payload: ReplacePdfPayload) => void;
  closeDialog: (dialog?: OverlayDialog) => void;
  closeConfirmation: (confirmation?: OverlayConfirmation) => void;
  closeAllOverlays: () => void;

  setError: (message: string | null) => void;
}

type AutosaveStatus = "inactive" | "available" | "repair-required" | "unavailable";

const HISTORICAL_REPAIR_WARNING =
  "Autosave is paused because one or more measurements from an older version need repair. Edit each invalid measurement to resume autosave automatically.";

export function usePdfSessionLifecycle({
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
}: PdfSessionLifecycleOptions) {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceGenerationRef = useRef(0);
  const persistenceRevisionRef = useRef<string | null | undefined>(undefined);
  const pdfLoadLifecycleRef = useRef(new PdfLoadLifecycle());
  const activePdfRef = useRef<LoadedPdf | null>(null);
  const pendingPdfRef = useRef<PendingPdf | null>(null);
  const activatingPdfRef = useRef<LoadedPdf | null>(null);
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
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("inactive");
  const [autosaveWarning, setAutosaveWarning] = useState<string | null>(null);

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
        persistenceRevisionRef.current = saved?.revision ?? null;
        setRecovery(saved);
        setRecoveryProtected(Boolean(saved));
        setRecoveryChecked(true);
      })
      .catch((error: unknown) => {
        console.error("IndexedDB recovery failed.", error);
        if (cancelled) return;
        if (error instanceof PersistenceLoadError) {
          persistenceRevisionRef.current = error.revision;
        }
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
    const repairedHistoricalSession =
      autosaveStatus === "repair-required" &&
      session !== null &&
      isSessionPersistable(session);
    const autosaveInputs = {
      snapshot: session,
      pdfRuntimeReady: activePdf !== null,
      pdfBlob,
      enabled: autosaveStatus === "available" || repairedHistoricalSession,
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
        async (currentSnapshot) => {
          const expectedRevision = persistenceRevisionRef.current;
          if (expectedRevision === null || expectedRevision === undefined) {
            throw new Error("Cannot autosave without a persisted session revision.");
          }
          persistenceRevisionRef.current = await saveSessionMetadata(
            currentSnapshot,
            expectedRevision,
          );
        },
      )
        .then(() => {
          if (generation === persistenceGenerationRef.current) {
            if (repairedHistoricalSession) setAutosaveStatus("available");
            setAutosaveWarning(null);
          }
        })
        .catch((error: unknown) => {
          if (generation !== persistenceGenerationRef.current) return;
          persistenceGenerationRef.current += 1;
          console.error("IndexedDB autosave failed.", error);
          setAutosaveWarning(
            "Autosave is unavailable. Keep this tab open or export your measurements before leaving.",
          );
          setAutosaveStatus("unavailable");
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activePdf, autosaveStatus, pdfBlob, session]);

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
    setAutosaveStatus("inactive");
    try {
      await saveQueueRef.current.catch(() => undefined);
      if (disposedRef.current) return;

      let saved = false;
      try {
        const expectedRevision = persistenceRevisionRef.current;
        if (expectedRevision === undefined) {
          throw new Error("Cannot replace a saved session whose revision is unknown.");
        }
        persistenceRevisionRef.current = await replaceSavedSession(
          candidate.session,
          candidate.file,
          expectedRevision,
        );
        saved = true;
      } catch (error) {
        console.error("Could not save the new PDF session.", error);
        setAutosaveStatus("unavailable");
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
        setAutosaveStatus("available");
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
      if (recovery.compatibility === "historical-repair-required") {
        setAutosaveStatus("repair-required");
        setAutosaveWarning(HISTORICAL_REPAIR_WARNING);
      } else {
        setAutosaveStatus("available");
        setAutosaveWarning(null);
      }
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
    setAutosaveStatus("inactive");
    cancelWorkspaceCalibration();
    closeConfirmation();
    cancelReferenceEdit();
    try {
      await saveQueueRef.current.catch(() => undefined);
      const expectedRevision = persistenceRevisionRef.current;
      if (expectedRevision === null || expectedRevision === undefined) {
        throw new Error("Cannot discard a saved session whose revision is unknown.");
      }
      await discardSavedSession(expectedRevision);
      persistenceRevisionRef.current = null;
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

  function continueWithoutRecovery() {
    setRecoveryIssue(null);
    setAutosaveStatus("inactive");
    setAutosaveWarning(
      "The previous saved session is protected. Opening another PDF will require confirmation.",
    );
  }

  function showDiscardRecoveryConfirmation() {
    setConfirmDiscardRecovery(true);
  }

  function hideDiscardRecoveryConfirmation() {
    setConfirmDiscardRecovery(false);
  }

  function dismissAutosaveWarning() {
    if (autosaveStatus === "unavailable" || autosaveStatus === "repair-required") return;
    setAutosaveWarning(null);
  }

  function confirmPdfReplacement(dialog: OverlayDialog) {
    if (dialog.type !== "replacePdf") return;
    const candidate = pendingPdfRef.current;
    if (!candidate || candidate.pdfId !== dialog.payload.pdfId) return;
    void activatePdf(candidate, true);
  }

  function cancelPdfReplacement(dialog: OverlayDialog) {
    if (dialog.type !== "replacePdf") return;
    const candidate = pendingPdfRef.current;
    if (!candidate || candidate.pdfId !== dialog.payload.pdfId) return;
    clearPendingPdf(candidate);
  }

  return {
    activePdf,
    recovery,
    recoveryChecked,
    recoveryIssue,
    confirmDiscardRecovery,
    loading,
    autosaveWarning,
    autosaveUnavailable: autosaveStatus === "unavailable" || autosaveStatus === "repair-required",
    chooseFile,
    continueRecovery,
    discardRecovery,
    continueWithoutRecovery,
    showDiscardRecoveryConfirmation,
    hideDiscardRecoveryConfirmation,
    dismissAutosaveWarning,
    confirmPdfReplacement,
    cancelPdfReplacement,
  };
}
