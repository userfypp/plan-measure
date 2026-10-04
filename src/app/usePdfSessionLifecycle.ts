import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueAutosave, isAutosaveReady, isSessionPersistable } from "./autosave";
import {
  canActivatePdf,
  PdfLoadLifecycle,
  scheduleRetiredPdfRelease,
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
  activateSavedProject,
  beginSessionMetadataSaveOnPageExit,
  copyPdfBlob,
  discardSavedProject,
  discardSavedSession,
  listSavedProjects,
  loadSavedProject,
  loadSavedSession,
  PersistenceLoadError,
  replaceSavedSession,
  saveSessionMetadata,
  type SavedProjectSummary,
  type SavedSession,
} from "../services/persistence";
import type { LoadedPdf } from "../services/pdf";
import { PdfUserError, validatePdfFile } from "../services/pdfValidation";
import { createProjectFile, projectFileName, readProjectFile } from "../services/projectFile";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import type { WorkspaceModule } from "./workspaceState";

async function loadPdfRuntime(blob: Blob): Promise<LoadedPdf> {
  const { loadPdf } = await import("../services/pdf");
  return loadPdf(blob);
}

interface PendingPdf {
  pdfId: string;
  projectId: string;
  file: Blob;
  loaded: LoadedPdf;
  session: CurrentSession;
  loadGeneration: number;
}

interface PdfSessionLifecycleOptions {
  session: CurrentSession | null;

  loadSession: (session: CurrentSession) => void;
  clearSession: () => void;

  resetWorkspace: (module?: WorkspaceModule) => void;
  recoveredStartupWorkspace: RecoveredPlanStartupWorkspace;
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
const CLASSIFICATION_REPAIR_WARNING =
  "Autosave is paused because classification names from an older version conflict. Rename each duplicate dimension or value to resume autosave automatically.";
const SNAPSHOT_REPAIR_WARNING =
  "Autosave is paused because this project contains invalid measurements or conflicting classification names. Repair them to resume autosave automatically.";
const COMBINED_REPAIR_WARNING =
  "Autosave is paused because classification names conflict and one or more measurements need repair. Repair both to resume autosave automatically.";

export function usePdfSessionLifecycle({
  session,
  loadSession,
  clearSession,
  resetWorkspace,
  recoveredStartupWorkspace,
  cancelWorkspaceCalibration,
  cancelReferenceEdit,
  requestReplacePdf,
  closeDialog,
  closeConfirmation,
  closeAllOverlays,
  setError,
}: PdfSessionLifecycleOptions) {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeProjectOperationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const activeProjectOperationCountRef = useRef(0);
  const persistenceGenerationRef = useRef(0);
  const persistenceRevisionRef = useRef<string | null | undefined>(undefined);
  const activeProjectIdRef = useRef<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const persistedSessionRef = useRef<CurrentSession | null>(null);
  const pdfLoadLifecycleRef = useRef(new PdfLoadLifecycle());
  const activePdfRef = useRef<LoadedPdf | null>(null);
  const retiredPdfsRef = useRef<LoadedPdf[]>([]);
  const pendingPdfRef = useRef<PendingPdf | null>(null);
  const activatingPdfRef = useRef<LoadedPdf | null>(null);
  const disposedRef = useRef(false);
  const latestPdfLoadRef = useRef<number | null>(null);
  const activationCountRef = useRef(0);
  const [activePdf, setActivePdf] = useState<LoadedPdf | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [recovery, setRecovery] = useState<SavedSession | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryIssue, setRecoveryIssue] = useState<string | null>(null);
  const [recoveryProtected, setRecoveryProtected] = useState(false);
  const [confirmDiscardRecovery, setConfirmDiscardRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("inactive");
  const autosaveStatusRef = useRef(autosaveStatus);
  const currentSessionRef = useRef(session);
  const [projectOperationPending, setProjectOperationPending] = useState(false);
  const [autosaveWarning, setAutosaveWarning] = useState<string | null>(null);

  function updateAutosaveStatus(status: AutosaveStatus) {
    autosaveStatusRef.current = status;
    setAutosaveStatus(status);
  }

  useEffect(() => {
    currentSessionRef.current = session;
  }, [session]);

  function enqueueActiveProjectOperation<T>(operation: () => Promise<T>): Promise<T> {
    activeProjectOperationCountRef.current += 1;
    setProjectOperationPending(true);
    const result = activeProjectOperationQueueRef.current.then(operation, operation);
    activeProjectOperationQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      activeProjectOperationCountRef.current = Math.max(
        0,
        activeProjectOperationCountRef.current - 1,
      );
      if (!disposedRef.current) {
        setProjectOperationPending(activeProjectOperationCountRef.current > 0);
      }
    });
  }

  const destroyPdf = useCallback(
    (loaded: LoadedPdf | null | undefined) => pdfLoadLifecycleRef.current.destroy(loaded),
    [],
  );

  const releaseRetiredPdfs = useCallback(async () => {
    const retiredPdfs = retiredPdfsRef.current.splice(0);
    await Promise.all(retiredPdfs.map((loaded) => destroyPdf(loaded)));
  }, [destroyPdf]);

  useEffect(() => {
    scheduleRetiredPdfRelease(retiredPdfsRef.current, queueMicrotask, destroyPdf);
  }, [activePdf, destroyPdf]);

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

  function publishPendingPdf(candidate: PendingPdf, recoveryProtected: boolean) {
    const previous = pendingPdfRef.current;
    pendingPdfRef.current = candidate;
    requestReplacePdf({
      pdfId: candidate.pdfId,
      fileName: candidate.session.pdf.name,
      recoveryProtected,
    });
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
    (loaded: LoadedPdf): boolean => {
      if (disposedRef.current) {
        void destroyPdf(loaded);
        return false;
      }
      const previous = activePdfRef.current;
      activePdfRef.current = loaded;
      if (previous && previous !== loaded) retiredPdfsRef.current.push(previous);
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
        releaseRetiredPdfs(),
      ]);
    };
  }, [destroyPdf, releaseRetiredPdfs]);

  useEffect(() => {
    let cancelled = false;
    void loadSavedSession()
      .then(async (saved) => {
        if (cancelled) return;
        try {
          setSavedProjects(await listSavedProjects());
        } catch (error) {
          console.error("Could not list saved projects.", error);
        }
        if (cancelled) return;
        persistenceRevisionRef.current = saved?.revision ?? null;
        activeProjectIdRef.current = saved?.projectId ?? null;
        setActiveProjectId(activeProjectIdRef.current);
        setRecovery(saved);
        setRecoveryProtected(false);
        setRecoveryChecked(true);
      })
      .catch((error: unknown) => {
        console.error("IndexedDB recovery failed.", error);
        if (cancelled) return;
        void listSavedProjects().then(setSavedProjects).catch(() => undefined);
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
    const canAutosave = autosaveStatus === "available" || autosaveStatus === "repair-required";
    if (canAutosave && session !== null && !isSessionPersistable(session)) {
      if (autosaveStatus === "available") {
        let cancelled = false;
        queueMicrotask(() => {
          if (cancelled || autosaveStatusRef.current !== "available") return;
          updateAutosaveStatus("repair-required");
          setAutosaveWarning(SNAPSHOT_REPAIR_WARNING);
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }
    const repairedHistoricalSession = autosaveStatus === "repair-required" && session !== null;
    const autosaveInputs = {
      snapshot: session,
      pdfRuntimeReady: activePdf !== null,
      pdfBlob,
      enabled: autosaveStatus === "available" || repairedHistoricalSession,
    };
    if (!isAutosaveReady(autosaveInputs)) return;
    const snapshot = autosaveInputs.snapshot;
    const preparedPdfBlob = autosaveInputs.pdfBlob;
    const generation = persistenceGenerationRef.current;
    let queued = false;
    let beforeUnloadRegistered = false;
    const removeBeforeUnload = () => {
      if (!beforeUnloadRegistered) return;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      beforeUnloadRegistered = false;
    };
    const queueAutosave = () => {
      if (queued) return;
      queued = true;
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
            preparedPdfBlob,
          );
        },
      )
        .then(() => {
          if (generation === persistenceGenerationRef.current) {
            persistedSessionRef.current = snapshot;
            if (currentSessionRef.current === snapshot) {
              if (repairedHistoricalSession) updateAutosaveStatus("available");
              setAutosaveWarning(null);
            }
          }
        })
        .catch((error: unknown) => {
          if (generation !== persistenceGenerationRef.current) return;
          persistenceGenerationRef.current += 1;
          console.error("IndexedDB autosave failed.", error);
          setAutosaveWarning(
            "Autosave is unavailable. Keep this tab open or export your measurements before leaving.",
          );
          updateAutosaveStatus("unavailable");
        })
        .finally(removeBeforeUnload);
    };
    const timer = window.setTimeout(queueAutosave, 300);
    const handleBeforeUnload = () => {
      if (generation !== persistenceGenerationRef.current) return;
      window.clearTimeout(timer);
      if (
        persistenceRevisionRef.current === null ||
        persistenceRevisionRef.current === undefined
      ) {
        return;
      }
      const exitSave = beginSessionMetadataSaveOnPageExit(
        snapshot,
        () => {
          const expectedRevision = persistenceRevisionRef.current;
          if (expectedRevision === null || expectedRevision === undefined) {
            throw new Error("Cannot autosave without a persisted session revision.");
          }
          return expectedRevision;
        },
        preparedPdfBlob,
      );
      if (!exitSave) {
        queueAutosave();
        return;
      }
      queued = true;
      saveQueueRef.current = exitSave
        .then((revision) => {
          if (generation === persistenceGenerationRef.current) {
            persistenceRevisionRef.current = revision;
            persistedSessionRef.current = snapshot;
          }
        })
        .catch(() => undefined)
        .finally(removeBeforeUnload);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      window.clearTimeout(timer);
      queueAutosave();
    };
    if (snapshot !== persistedSessionRef.current) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      beforeUnloadRegistered = true;
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      removeBeforeUnload();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activePdf, autosaveStatus, pdfBlob, session]);

  async function activatePdf(candidate: PendingPdf, requiresPendingConfirmation = false) {
    await enqueueActiveProjectOperation(async () => {
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
      activatingPdfRef.current = candidate.loaded;
      beginPdfActivation(candidate.loadGeneration);
      const previousAutosaveStatus = autosaveStatusRef.current;
      const previousSession = currentSessionRef.current;
      const previousPdf = activePdfRef.current;
      const recoveryWasProtected = recoveryProtected;
      persistenceGenerationRef.current += 1;
      updateAutosaveStatus("inactive");
      try {
        await saveQueueRef.current.catch(() => undefined);
        if (
          disposedRef.current ||
          !pdfLoadLifecycleRef.current.isCurrent(candidate.loadGeneration)
        ) {
          if (autosaveStatusRef.current !== "unavailable") {
            updateAutosaveStatus(previousAutosaveStatus);
          }
          await destroyPdf(candidate.loaded);
          return;
        }

        let saved = false;
        let preparedPdfBlob: Blob = candidate.file;
        try {
          preparedPdfBlob = await copyPdfBlob(candidate.file);
          const expectedRevision = persistenceRevisionRef.current;
          if (expectedRevision === undefined) {
            throw new Error("Cannot replace a saved session whose revision is unknown.");
          }
          const revision = await replaceSavedSession(
            candidate.session,
            preparedPdfBlob,
            expectedRevision,
            candidate.projectId,
            previousSession && isSessionPersistable(previousSession)
              ? previousSession
              : undefined,
          );
          persistenceRevisionRef.current = revision;
          persistedSessionRef.current = candidate.session;
          saved = true;
        } catch (error) {
          console.error("Could not save the new PDF session.", error);
          if (previousSession || previousPdf || recovery || recoveryWasProtected) {
            if (autosaveStatusRef.current !== "unavailable") {
              updateAutosaveStatus(previousAutosaveStatus);
            }
            if (pdfLoadLifecycleRef.current.isCurrent(candidate.loadGeneration)) {
              setError("The new PDF could not be saved. The current project remains open.");
            }
            await destroyPdf(candidate.loaded);
            return;
          }
          updateAutosaveStatus("unavailable");
          setAutosaveWarning(
            "Autosave is unavailable. Keep this tab open or export your measurements before leaving.",
          );
        }
        if (disposedRef.current) {
          await destroyPdf(candidate.loaded);
          return;
        }

        cancelWorkspaceCalibration();
        closeConfirmation();
        cancelReferenceEdit();
        const installed = installActivePdf(candidate.loaded);
        if (!installed) return;
        activeProjectIdRef.current = candidate.projectId;
        setActiveProjectId(candidate.projectId);
        setPdfBlob(preparedPdfBlob);
        currentSessionRef.current = candidate.session;
        loadSession(candidate.session);
        if (pdfLoadLifecycleRef.current.isCurrent(candidate.loadGeneration)) setError(null);
        resetWorkspace();
        if (pdfLoadLifecycleRef.current.isCurrent(candidate.loadGeneration)) closeAllOverlays();
        setRecovery(null);
        setRecoveryProtected(false);
        if (saved) {
          updateAutosaveStatus("available");
          setAutosaveWarning(null);
          try {
            setSavedProjects(await listSavedProjects());
          } catch (error) {
            console.error("Could not refresh saved projects.", error);
          }
        } else {
          if (pdfLoadLifecycleRef.current.isCurrent(candidate.loadGeneration)) {
            setError("Autosave could not be started.");
          }
        }
      } finally {
        if (activatingPdfRef.current === candidate.loaded) activatingPdfRef.current = null;
        finishPdfActivation();
      }
    });
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
        projectId: crypto.randomUUID(),
        file,
        loaded,
        session: newSession,
        loadGeneration,
      };
      if (
        shouldConfirmPdfReplacement({
          pdfActivating: Boolean(activatingPdfRef.current),
          recoveryProtected,
        })
      ) {
        handedOff = true;
        publishPendingPdf(candidate, recoveryProtected);
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

  async function importProject(file: File) {
    const loadGeneration = pdfLoadLifecycleRef.current.begin();
    clearPendingPdf();
    beginPdfLoad(loadGeneration);
    let loaded: LoadedPdf | null = null;
    let handedOff = false;
    try {
      const imported = await readProjectFile(file);
      loaded = await loadPdfRuntime(imported.pdfBlob);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
        await destroyPdf(loaded);
        return;
      }
      if (loaded.document.numPages !== imported.session.pageCount) {
        throw new Error("The project PDF does not match its saved page count.");
      }
      const candidate: PendingPdf = {
        pdfId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        file: imported.pdfBlob,
        loaded,
        session: imported.session,
        loadGeneration,
      };
      if (
        shouldConfirmPdfReplacement({
          pdfActivating: Boolean(activatingPdfRef.current),
          recoveryProtected,
        })
      ) {
        handedOff = true;
        publishPendingPdf(candidate, recoveryProtected);
        finishPdfLoad(loadGeneration);
      } else {
        handedOff = true;
        await activatePdf(candidate);
      }
    } catch (error) {
      if (loaded && !handedOff) await destroyPdf(loaded);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
      setError(error instanceof Error ? error.message : "The project could not be imported.");
      finishPdfLoad(loadGeneration);
    }
  }

  function downloadProject(sessionToExport: CurrentSession, projectPdf: Blob) {
    if (!isSessionPersistable(sessionToExport)) {
      throw new Error("Repair this project's measurements or classification names before exporting it.");
    }
    const file = createProjectFile(sessionToExport, projectPdf);
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = projectFileName(sessionToExport.pdf.name);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function exportProject(projectId?: string) {
    try {
      if ((!projectId || projectId === activeProjectIdRef.current) && currentSessionRef.current && pdfBlob) {
        downloadProject(currentSessionRef.current, pdfBlob);
      } else if (projectId) {
        const saved = await loadSavedProject(projectId);
        downloadProject(saved.session, saved.pdfBlob);
      } else {
        throw new Error("No project is open to export.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "The project could not be exported.");
    }
  }

  async function openProject(projectId: string) {
    const loadGeneration = pdfLoadLifecycleRef.current.begin();
    beginPdfLoad(loadGeneration);
    let loaded: LoadedPdf | null = null;
    let previousAutosaveStatus: AutosaveStatus | null = null;
    try {
      const recoveryCandidate =
        !currentSessionRef.current &&
        recovery?.projectId === projectId &&
        recovery.revision === persistenceRevisionRef.current
          ? recovery
          : null;
      const savedProject = recoveryCandidate ?? (await loadSavedProject(projectId));
      if (!savedProject) throw new Error("The selected project is no longer available.");
      const preparedPdfBlob = await copyPdfBlob(savedProject.pdfBlob);
      loaded = await loadPdfRuntime(preparedPdfBlob);
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
        await destroyPdf(loaded);
        loaded = null;
        return;
      }
      if (loaded.document.numPages !== savedProject.session.pageCount) {
        await destroyPdf(loaded);
        loaded = null;
        throw new Error("The saved PDF does not match this project's page count.");
      }
      const installed = await enqueueActiveProjectOperation(async () => {
        if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
          await destroyPdf(loaded);
          loaded = null;
          return false;
        }

        previousAutosaveStatus = autosaveStatusRef.current;
        const currentSession = currentSessionRef.current;
        const openingCurrentRecovery =
          recoveryCandidate !== null &&
          !currentSession &&
          recoveryCandidate.revision === persistenceRevisionRef.current;
        let activatedRevision: string | null | undefined = openingCurrentRecovery
          ? recoveryCandidate.revision
          : persistenceRevisionRef.current;
        if (!openingCurrentRecovery) {
          persistenceGenerationRef.current += 1;
          updateAutosaveStatus("inactive");
          await saveQueueRef.current.catch(() => undefined);
          if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) {
            if (autosaveStatusRef.current !== "unavailable") {
              updateAutosaveStatus(previousAutosaveStatus);
            }
            await destroyPdf(loaded);
            loaded = null;
            return false;
          }
          const expectedRevision = persistenceRevisionRef.current;
          if (expectedRevision === undefined) {
            throw new Error("Cannot switch projects without a saved session revision.");
          }
          const activated = await activateSavedProject(
            projectId,
            expectedRevision,
            currentSession && isSessionPersistable(currentSession) ? currentSession : undefined,
          );
          activatedRevision = activated.revision;
          persistenceRevisionRef.current = activated.revision;
        }

        if (!activatedRevision) throw new Error("The selected project has no active revision.");
        const installedPdf = loaded;
        if (!installedPdf) return false;
        const didInstall = installActivePdf(installedPdf);
        if (!didInstall) return false;
        loaded = null;
        persistenceRevisionRef.current = activatedRevision;
        activeProjectIdRef.current = projectId;
        setActiveProjectId(projectId);
        setPdfBlob(preparedPdfBlob);
        currentSessionRef.current = savedProject.session;
        persistedSessionRef.current = savedProject.session;
        loadSession(savedProject.session);
        if (pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) setError(null);
        resetWorkspace(recoveredStartupWorkspace);
        if (pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) closeAllOverlays();
        if (savedProject.compatibility !== "current") {
          updateAutosaveStatus("repair-required");
          setAutosaveWarning(
            savedProject.compatibility === "classification-repair-required"
              ? savedProject.incompatibleMeasurementIds.length > 0
                ? COMBINED_REPAIR_WARNING
                : CLASSIFICATION_REPAIR_WARNING
              : HISTORICAL_REPAIR_WARNING,
          );
        } else {
          updateAutosaveStatus("available");
          setAutosaveWarning(null);
        }
        setRecovery(null);
        setRecoveryProtected(false);
        setConfirmDiscardRecovery(false);
        setRecoveryIssue(null);
        return true;
      });
      if (installed) {
        try {
          setSavedProjects(await listSavedProjects());
        } catch (error) {
          console.error("Could not refresh saved projects.", error);
        }
      }
    } catch (error) {
      if (loaded) await destroyPdf(loaded);
      if (
        previousAutosaveStatus &&
        autosaveStatusRef.current !== "unavailable" &&
        currentSessionRef.current &&
        activePdfRef.current
      ) {
        updateAutosaveStatus(previousAutosaveStatus);
      }
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
      console.error("Saved PDF recovery failed.", error);
      setError("This project could not be opened. Its saved copy has been kept on this device.");
    } finally {
      finishPdfLoad(loadGeneration);
    }
  }

  async function continueRecovery() {
    if (!recovery) return;
    await openProject(recovery.projectId);
  }

  async function refreshSavedProjects() {
    const projects = await listSavedProjects();
    setSavedProjects(projects);
    return projects;
  }

  async function discardRecovery() {
    const expectedRevision = recovery?.revision ?? persistenceRevisionRef.current;
    const loadGeneration = pdfLoadLifecycleRef.current.begin();
    latestPdfLoadRef.current = null;
    updateLoadingState();
    let previousAutosaveStatus: AutosaveStatus | null = null;
    try {
      await enqueueActiveProjectOperation(async () => {
        if (expectedRevision === null || expectedRevision === undefined) {
          throw new Error("Cannot discard a saved session whose revision is unknown.");
        }
        if (
          disposedRef.current ||
          !pdfLoadLifecycleRef.current.isCurrent(loadGeneration) ||
          persistenceRevisionRef.current !== expectedRevision
        ) {
          throw new Error("The saved session changed before it could be discarded.");
        }
        previousAutosaveStatus = autosaveStatusRef.current;
        persistenceGenerationRef.current += 1;
        updateAutosaveStatus("inactive");
        cancelWorkspaceCalibration();
        closeConfirmation();
        cancelReferenceEdit();
        await saveQueueRef.current.catch(() => undefined);
        if (
          disposedRef.current ||
          !pdfLoadLifecycleRef.current.isCurrent(loadGeneration) ||
          persistenceRevisionRef.current !== expectedRevision
        ) {
          throw new Error("The saved session changed before it could be discarded.");
        }
        await discardSavedSession(expectedRevision);
        persistenceRevisionRef.current = null;
        activeProjectIdRef.current = null;
        setActiveProjectId(null);
        persistedSessionRef.current = null;
        currentSessionRef.current = null;
        if (disposedRef.current) return;
        setRecovery(null);
        setRecoveryIssue(null);
        setRecoveryProtected(false);
        setConfirmDiscardRecovery(false);
        clearSession();
        resetWorkspace();
        closeAllOverlays();
        try {
          setSavedProjects(await listSavedProjects());
        } catch (error) {
          console.error("Could not refresh saved projects.", error);
        }
      });
    } catch (error) {
      if (
        previousAutosaveStatus &&
        autosaveStatusRef.current !== "unavailable" &&
        currentSessionRef.current &&
        activePdfRef.current
      ) {
        updateAutosaveStatus(previousAutosaveStatus);
      }
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
      console.error("Could not discard the saved session.", error);
      setError("The saved session could not be discarded.");
    }
  }

  async function discardProject(projectId: string) {
    const loadGeneration = pdfLoadLifecycleRef.current.begin();
    latestPdfLoadRef.current = null;
    updateLoadingState();
    let previousAutosaveStatus: AutosaveStatus | null = null;
    try {
      await enqueueActiveProjectOperation(async () => {
        if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
        const project = (await listSavedProjects()).find((candidate) => candidate.id === projectId);
        if (!project) throw new Error("The selected project is no longer available.");
        const discardingCurrent = project.isCurrent;
        previousAutosaveStatus = autosaveStatusRef.current;
        persistenceGenerationRef.current += 1;
        updateAutosaveStatus("inactive");
        if (discardingCurrent) {
          cancelWorkspaceCalibration();
          closeConfirmation();
          cancelReferenceEdit();
        }
        await saveQueueRef.current.catch(() => undefined);
        const expectedRevision = persistenceRevisionRef.current;
        if (expectedRevision === undefined) {
          throw new Error("Cannot discard a project whose active session revision is unknown.");
        }
        const discardedCurrent = await discardSavedProject(projectId, expectedRevision);
        if (discardedCurrent) {
          const previousPdf = activePdfRef.current;
          activePdfRef.current = null;
          if (previousPdf) retiredPdfsRef.current.push(previousPdf);
          persistenceRevisionRef.current = null;
          activeProjectIdRef.current = null;
          setActiveProjectId(null);
          persistedSessionRef.current = null;
          currentSessionRef.current = null;
          if (disposedRef.current) return;
          setActivePdf(null);
          setPdfBlob(null);
          setAutosaveWarning(null);
          setRecovery(null);
          setRecoveryIssue(null);
          setRecoveryProtected(false);
          setConfirmDiscardRecovery(false);
          clearSession();
          resetWorkspace();
          closeAllOverlays();
        } else if (
          previousAutosaveStatus &&
          autosaveStatusRef.current !== "unavailable"
        ) {
          updateAutosaveStatus(previousAutosaveStatus);
        }
        try {
          setSavedProjects(await listSavedProjects());
        } catch (error) {
          console.error("Could not refresh saved projects.", error);
        }
      });
    } catch (error) {
      if (
        previousAutosaveStatus &&
        autosaveStatusRef.current !== "unavailable" &&
        currentSessionRef.current &&
        activePdfRef.current
      ) {
        updateAutosaveStatus(previousAutosaveStatus);
      }
      if (disposedRef.current || !pdfLoadLifecycleRef.current.isCurrent(loadGeneration)) return;
      console.error("Could not discard the saved project.", error);
      setError("The project could not be discarded.");
    }
  }

  function continueWithoutRecovery() {
    setRecoveryIssue(null);
    updateAutosaveStatus("inactive");
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
    savedProjects,
    activeProjectId,
    recoveryChecked,
    recoveryIssue,
    confirmDiscardRecovery,
    loading,
    projectOperationPending,
    autosaveWarning,
    autosaveUnavailable: autosaveStatus === "unavailable" || autosaveStatus === "repair-required",
    chooseFile,
    importProject,
    exportProject,
    openProject,
    refreshSavedProjects,
    continueRecovery,
    discardRecovery,
    discardProject,
    continueWithoutRecovery,
    showDiscardRecoveryConfirmation,
    hideDiscardRecoveryConfirmation,
    dismissAutosaveWarning,
    confirmPdfReplacement,
    cancelPdfReplacement,
  };
}
