import { useEffect, useRef, useState, type DragEvent } from "react";
import { AppProvider, createEmptySession, useAppState } from "./state";
import { TopBar } from "./TopBar";
import { Modal } from "../components/Modal";
import { CalibrationDialog } from "../features/calibration/CalibrationDialog";
import { MeasurementPanel } from "../features/measurements/MeasurementPanel";
import { PdfViewer } from "../features/viewer/PdfViewer";
import { ToolBar } from "../features/viewer/ToolBar";
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
        .then(() => setAutosaveWarning(null))
        .catch((error: unknown) => {
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

  async function activatePdf(candidate: PendingPdf) {
    setPendingPdf(null);
    setCalibrationCandidate(null);
    setConfirmRecalibrate(false);
    setAutosaveSuspended(false);
    setLoading(true);
    persistenceGenerationRef.current += 1;
    setAutosaveEnabled(false);
    await saveQueueRef.current.catch(() => undefined);
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
    if (activePdf) await activePdf.loadingTask.destroy().catch(() => undefined);
    setActivePdf(candidate.loaded);
    setPdfBlob(candidate.file);
    dispatch({ type: "LOAD_SESSION", session: candidate.session });
    if (saved) {
      setAutosaveEnabled(true);
      setAutosaveWarning(null);
    } else {
      dispatch({ type: "SET_ERROR", message: "Autosave could not be started." });
    }
    setLoading(false);
  }

  async function chooseFile(file: File) {
    try {
      validatePdfFile(file);
      setLoading(true);
      const loaded = await loadPdf(file);
      const session = createEmptySession(
        { name: file.name, size: file.size, lastModified: file.lastModified },
        loaded.document.numPages,
      );
      const candidate = { file, loaded, session };
      if (state.session) {
        setPendingPdf(candidate);
        setLoading(false);
      } else {
        await activatePdf(candidate);
      }
    } catch (error) {
      const message =
        error instanceof PdfUserError
          ? error.message
          : "The PDF could not be opened. Try another file.";
      dispatch({ type: "SET_ERROR", message });
      setLoading(false);
    }
  }

  async function continueRecovery() {
    if (!recovery) return;
    setLoading(true);
    try {
      const loaded = await loadPdf(recovery.pdfBlob);
      if (loaded.document.numPages !== recovery.session.pageCount) {
        await loaded.loadingTask.destroy();
        throw new Error("The saved PDF does not match its session metadata.");
      }
      setActivePdf(loaded);
      setPdfBlob(recovery.pdfBlob);
      dispatch({ type: "LOAD_SESSION", session: recovery.session });
      setAutosaveEnabled(true);
      setRecovery(null);
    } catch (error) {
      console.error("Saved PDF recovery failed.", error);
      dispatch({
        type: "SET_ERROR",
        message: "The previous session could not be restored. You can discard it and open a PDF.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function discardRecovery() {
    try {
      await discardSavedSession();
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
            void pendingPdf.loaded.loadingTask.destroy();
            setPendingPdf(null);
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
                void pendingPdf.loaded.loadingTask.destroy();
                setPendingPdf(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.danger}
              onClick={() => void activatePdf(pendingPdf)}
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
