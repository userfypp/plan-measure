import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { AppProvider, createEmptySession, useAppState } from "./state";
import { TopBar } from "./TopBar";
import { Modal } from "../components/Modal";
import { CalibrationDialog } from "../features/calibration/CalibrationDialog";
import { MeasurementPanel } from "../features/measurements/MeasurementPanel";
import { PdfViewer } from "../features/viewer/PdfViewer";
import { ToolBar } from "../features/viewer/ToolBar";
import { canActivatePdf, PdfLoadLifecycle } from "./pdfLoadLifecycle";
import type { LinearUnit, Point, SessionV1, Tool } from "../types/domain";
import { downloadCsv } from "../services/csv";
import {
  discardSavedSession,
  loadSavedSession,
  replaceSavedSession,
  saveSessionMetadata,
  type SavedSession,
} from "../services/persistence";
import { loadPdf, PdfUserError, validatePdfFile, type LoadedPdf } from "../services/pdf";
import { shouldIgnoreGlobalKeyboardShortcut } from "../utils/keyboard";
import styles from "./App.module.css";

interface PendingPdf {
  file: File;
  loaded: LoadedPdf;
  session: SessionV1;
  loadGeneration: number;
}

interface CalibrationCandidate {
  pageNumber: number;
  points: [Point, Point];
}

export function App() {
  return (
    <AppProvider>
      <PlanMeasureApp />
    </AppProvider>
  );
}

function PlanMeasureApp() {
  const { state, dispatch } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceGenerationRef = useRef(0);
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
  const [pendingPdf, setPendingPdf] = useState<PendingPdf | null>(null);
  const [calibrationCandidate, setCalibrationCandidate] = useState<CalibrationCandidate | null>(
    null,
  );
  const [confirmRecalibrate, setConfirmRecalibrate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [autosaveSuspended, setAutosaveSuspended] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
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
    setPendingPdf(candidate);
    if (previous && previous !== candidate) void destroyPdf(previous.loaded);
  }

  function clearPendingPdf(candidate?: PendingPdf) {
    const pending = pendingPdfRef.current;
    if (!pending || (candidate && pending !== candidate)) return;
    pendingPdfRef.current = null;
    setPendingPdf((current) => (current === pending ? null : current));
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
      void Promise.all([
        destroyPdf(active),
        destroyPdf(pending?.loaded),
        destroyPdf(activating),
      ]);
    };
  }, [destroyPdf]);

  useEffect(() => {
    let cancelled = false;
    void loadSavedSession()
      .then((saved) => {
        if (cancelled) return;
        setRecovery(saved);
        setRecoveryChecked(true);
      })
      .catch((error: unknown) => {
        console.error("IndexedDB recovery failed.", error);
        if (cancelled) return;
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
    if (!state.session || !pdfBlob || !autosaveEnabled || autosaveSuspended) return;
    const session = state.session;
    const generation = persistenceGenerationRef.current;
    const timer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => {
          if (generation !== persistenceGenerationRef.current) return;
          return saveSessionMetadata(session);
        })
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
  }, [autosaveEnabled, autosaveSuspended, pdfBlob, state.session]);

  useEffect(() => {
    function handleDelete(event: KeyboardEvent) {
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        shouldIgnoreGlobalKeyboardShortcut(event.target) ||
        !state.selectedMeasurementId ||
        !state.session
      ) {
        return;
      }
      event.preventDefault();
      dispatch({
        type: "DELETE_MEASUREMENT",
        pageNumber: state.session.currentPage,
        id: state.selectedMeasurementId,
      });
    }
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [dispatch, state.selectedMeasurementId, state.session]);

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
      setPendingPdf((current) => (current === candidate ? null : current));
    }
    setCalibrationCandidate(null);
    setConfirmRecalibrate(false);
    setAutosaveSuspended(false);
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
      dispatch({ type: "LOAD_SESSION", session: candidate.session });
      if (saved) {
        setAutosaveEnabled(true);
        setAutosaveWarning(null);
      } else {
        dispatch({ type: "SET_ERROR", message: "Autosave could not be started." });
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
      loaded = await loadPdf(file);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
        await destroyPdf(loaded);
        return;
      }
      const session = createEmptySession(
        { name: file.name, size: file.size, lastModified: file.lastModified },
        loaded.document.numPages,
      );
      const candidate = { file, loaded, session, loadGeneration };
      if (state.session || activePdfRef.current || activatingPdfRef.current) {
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
      dispatch({ type: "SET_ERROR", message });
      finishPdfLoad(loadGeneration);
    }
  }

  async function continueRecovery() {
    if (!recovery) return;
    const loadGeneration = pdfLoadLifecycleRef.current.begin();
    beginPdfLoad(loadGeneration);
    let loaded: LoadedPdf | null = null;
    try {
      loaded = await loadPdf(recovery.pdfBlob);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
        await destroyPdf(loaded);
        return;
      }
      if (loaded.document.numPages !== recovery.session.pageCount) {
        await destroyPdf(loaded);
        loaded = null;
        throw new Error("The saved PDF does not match its session metadata.");
      }
      const installed = await installActivePdf(loaded);
      if (!installed) return;
      loaded = null;
      setPdfBlob(recovery.pdfBlob);
      dispatch({ type: "LOAD_SESSION", session: recovery.session });
      setAutosaveEnabled(true);
      setRecovery(null);
    } catch (error) {
      if (loaded) await destroyPdf(loaded);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
      console.error("Saved PDF recovery failed.", error);
      dispatch({
        type: "SET_ERROR",
        message: "The previous session could not be restored. You can discard it and open a PDF.",
      });
    } finally {
      finishPdfLoad(loadGeneration);
    }
  }

  async function discardRecovery() {
    pdfLoadLifecycleRef.current.begin();
    latestPdfLoadRef.current = null;
    updateLoadingState();
    try {
      await discardSavedSession();
      if (disposedRef.current) return;
      setRecovery(null);
      setRecoveryIssue(null);
      setAutosaveEnabled(false);
      dispatch({ type: "CLEAR_SESSION" });
    } catch (error) {
      console.error("Could not discard the saved session.", error);
      dispatch({ type: "SET_ERROR", message: "The saved session could not be discarded." });
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void chooseFile(file);
  }

  function chooseTool(tool: Tool) {
    if (tool === "calibrate" && currentPage?.calibration && currentPage.measurements.length > 0) {
      setConfirmRecalibrate(true);
      return;
    }
    dispatch({ type: "SET_TOOL", tool });
  }

  function exportMeasurements() {
    if (!state.session) return;
    try {
      downloadCsv(state.session, activePdf?.pageLabels ?? null);
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        message: error instanceof Error ? error.message : "The CSV could not be exported.",
      });
    }
  }

  const currentPage = state.session?.pages[state.session.currentPage];

  return (
    <div className={styles.app}>
      <TopBar
        session={state.session}
        onOpenPdf={() => fileInputRef.current?.click()}
        onExport={exportMeasurements}
        onSettingChange={(setting, value) => {
          if (setting === "displayUnit") {
            dispatch({ type: "SET_SETTING", setting, value: value as LinearUnit });
          } else {
            dispatch({ type: "SET_SETTING", setting, value: value as boolean });
          }
        }}
      />
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
      {state.error || autosaveWarning ? (
        <div className={autosaveWarning ? styles.warning : styles.errorBanner} role="alert">
          <span>{autosaveWarning ?? state.error}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => {
              if (autosaveWarning) setAutosaveWarning(null);
              else dispatch({ type: "SET_ERROR", message: null });
            }}
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div className={styles.messagePlaceholder} aria-hidden="true" />
      )}
      {state.session && activePdf && currentPage ? (
        <main
          className={`${styles.workspace} ${dragActive ? styles.dragActive : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <MeasurementPanel page={currentPage} />
          <PdfViewer
            document={activePdf.document}
            page={currentPage}
            onPageChange={(pageNumber) => {
              setCalibrationCandidate(null);
              dispatch({ type: "SET_PAGE", pageNumber });
            }}
            onCalibrationCandidate={(points) =>
              setCalibrationCandidate({ pageNumber: currentPage.pageNumber, points })
            }
            onVertexDragStateChange={setAutosaveSuspended}
          />
          <ToolBar page={currentPage} onChooseTool={chooseTool} />
          {dragActive && (
            <div className={styles.dropOverlay}>Drop PDF to replace current session</div>
          )}
        </main>
      ) : (
        <main
          className={`${styles.emptyState} ${dragActive ? styles.dragActive : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <div className={styles.dropCard}>
            <div className={styles.documentMark} aria-hidden="true">
              PDF
            </div>
            <h1>Drop a PDF here</h1>
            <p>or</p>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Open PDF
            </button>
            <small>PDF files up to 100 MB · Your plan stays in this browser</small>
          </div>
        </main>
      )}

      {!recoveryChecked && (
        <div className={styles.loadingOverlay}>Checking for a saved session…</div>
      )}
      {loading && <div className={styles.loadingOverlay}>Loading PDF…</div>}

      {recovery && !state.session && (
        <Modal title="Previous session found" labelledBy="recovery-title">
          <p>
            Continue working on <strong>{recovery.session.pdf.name}</strong>, or discard the saved
            browser-local session.
          </p>
          <div className={styles.modalActions}>
            <button type="button" onClick={() => void discardRecovery()}>
              Discard
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void continueRecovery()}
            >
              Continue
            </button>
          </div>
        </Modal>
      )}

      {recoveryIssue && !state.session && (
        <Modal title="Saved session unavailable" labelledBy="recovery-error-title">
          <p>{recoveryIssue}</p>
          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={() => {
                setRecoveryIssue(null);
                setAutosaveEnabled(false);
                setAutosaveWarning(
                  "Autosave is unavailable. Work in this tab will not survive a reload.",
                );
              }}
            >
              Continue without recovery
            </button>
            <button type="button" className={styles.primary} onClick={() => void discardRecovery()}>
              Discard saved session
            </button>
          </div>
        </Modal>
      )}

      {pendingPdf && (
        <Modal
          title="Replace current PDF?"
          labelledBy="replacement-title"
          onCancel={() => {
            clearPendingPdf(pendingPdf);
          }}
        >
          <p>
            Loading <strong>{pendingPdf.file.name}</strong> will replace the currently saved local
            session and all its measurements.
          </p>
          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={() => {
                clearPendingPdf(pendingPdf);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.danger}
              onClick={() => void activatePdf(pendingPdf, true)}
            >
              Replace PDF
            </button>
          </div>
        </Modal>
      )}

      {confirmRecalibrate && (
        <Modal
          title="Recalibrate this page?"
          labelledBy="recalibration-title"
          onCancel={() => setConfirmRecalibrate(false)}
        >
          <p>
            Existing geometry will stay in place, but every value on this page will be recalculated
            using the new scale.
          </p>
          <div className={styles.modalActions}>
            <button type="button" onClick={() => setConfirmRecalibrate(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                setConfirmRecalibrate(false);
                dispatch({ type: "SET_TOOL", tool: "calibrate" });
              }}
            >
              Recalibrate
            </button>
          </div>
        </Modal>
      )}

      {calibrationCandidate && state.session && (
        <CalibrationDialog
          points={calibrationCandidate.points}
          onCancel={() => {
            setCalibrationCandidate(null);
            dispatch({ type: "SET_TOOL", tool: "select" });
          }}
          onConfirm={(referenceDistanceMm) => {
            if (state.session!.currentPage !== calibrationCandidate.pageNumber) {
              setCalibrationCandidate(null);
              return;
            }
            dispatch({
              type: "SET_CALIBRATION",
              pageNumber: calibrationCandidate.pageNumber,
              calibration: {
                start: calibrationCandidate.points[0],
                end: calibrationCandidate.points[1],
                referenceDistanceMm,
              },
            });
            setCalibrationCandidate(null);
          }}
        />
      )}
    </div>
  );
}
