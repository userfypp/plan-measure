import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  FILL_OPACITY_SCALE,
  HANDLE_SIZE_SCALE,
  RASTER_CACHE_LIMITS,
  ZOOM_STEP_FACTOR,
  getAppPreferences,
  wheelAction,
  type DefaultZoom,
  returnsToSelectAfterFinishing,
  useAppPreferences,
} from "../../utils/appPreferences";
import { flushSync } from "react-dom";
import { Circle, Group, Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useAppState } from "../../app/state";
import { useSessionState } from "../../app/sessionState";
import { useWorkspaceState } from "../../app/workspaceState";
import type {
  LogicalPageBounds,
  MeasurementType,
  PageState,
  Point,
  Tool,
  ViewTransform,
  DrawingDraft,
} from "../../types/domain";
import {
  areEffectivelyIdentical,
  isMeasurementType,
  measurementPathSpecs,
} from "../../utils/geometry";
import {
  canvasLayout,
  clampPointToPage,
  fitToScreen,
  initialViewTransform,
  logicalPageBoundsFromViewport,
  normalizeRotation,
  PDF_RASTER_QUALITY_LIMITS,
  effectiveRasterPixels,
  pdfRasterLayout,
  pageToScreen,
  screenToPage,
  zoomViewAtPoint,
} from "../../utils/coordinates";
import { pdfRenderErrorMessage } from "../../services/pdf";
import {
  getDrawingKeyboardAction,
  getViewerKeyboardAction,
  shouldIgnoreGlobalKeyboardShortcut,
  shouldIgnoreViewerKeyboardShortcut,
  viewerShortcuts,
  type ViewerKeyboardAction,
} from "../../utils/keyboard";
import { boxFromCorners } from "../../utils/quickShapesCore";
import { buildDraftPreviewPoints } from "./draftPreview";
import { drawMeasurementOutlineScene } from "./annotationKonva";
import { flushBatchDraw } from "./konvaRuntime";
import { useKeyboardGeometry } from "./useKeyboardGeometry";
import { KeyboardGeometryHelp } from "./KeyboardGeometryHelp";
import {
  registerWholeMeasurementDragEnvironmentCancellation,
  registerWholeMeasurementDragPointerReleaseCleanup,
} from "./measurementDrag";
import { useDragCancellationRegistry } from "./useDragCancellationRegistry";
import { PdfAnnotationLayer, type CalibrationReferenceEditPreview } from "./PdfAnnotationLayer";
import { ScaleCheckLine } from "./ScaleCheckLine";
import type { ScaleCheckStore } from "../calibration/scaleCheckState";
import styles from "./PdfViewer.module.css";
import { LruRenderCache } from "./renderCache";
import { DebugOverlay } from "./DebugOverlay";
import {
  setMainPdfBusy,
  setMainPdfPage,
  setMainPdfRasterSource,
  setMainPdfRenderMs,
} from "./pdfRenderPriority";
import { isPrimaryViewerClick, startsViewerPan } from "./navigation";
import {
  extractSnapTargets,
  isScreenPointInPage,
  isSnapPointPlacementActive,
  resolveDrawingPoint,
  resolveDrawingPreview,
} from "./snapping";
import { useViewerNavigationRegistration } from "./ViewerNavigation";
import { useViewerInteractionCommandRegistration } from "./ViewerInteractionCommands";
import { useAuthoringCapability } from "./AuthoringCapability";
import {
  CANVAS_VISUAL_METRICS,
  useCanvasInteractionTargetScreenPx,
  scaleFillAlpha,
  scaledAlpha,
  scaledHandleRadiusScreenPx,
  useCanvasVisualRoles,
} from "./canvasVisualRoles";
import { safeViewerLayout, useViewerBottomExclusion } from "./viewerLayout";
import { pointsToFlat } from "./geometry";
import { CLOUD_FILL_OPACITY, DEFAULT_CLOUD_COLOR, withHexAlpha } from "../../utils/cloudColors";
import { getActiveCalibration } from "../../utils/calibration";
import { revealElements } from "../../utils/reveal";
import { DraftPointMarkers } from "./DraftPointMarkers";
import { BoxDraftGuides } from "./BoxDraftGuides";
import { SOFTWARE_CURSORS } from "./softwareCursor";
import { PageGridLines } from "./PageGridLines";
import { LiveLengthLabel } from "./LiveLengthLabel";
import { useSoftwareCursor } from "./useSoftwareCursor";
import {
  copyRasterToCanvas,
  panCachePixelRatio,
  type LoadedPageData,
  type ReadyRaster,
  type RecentRaster,
  type StagePage,
} from "./pdfViewerRaster";

// With many measurements, wheel zoom only scales the page group: the annotations keep their last
// settled zoom (and, when the whole page is visible, a cached bitmap) until the wheel has been
// idle this long.
const WHEEL_ZOOM_SETTLE_MS = 120;
const WHEEL_ZOOM_MAX_SETTLE_MS = 600;
const WHEEL_ZOOM_MIN_MEASUREMENTS = 200;
const TOOL_SHORTCUT_KEYS = viewerShortcuts.flatMap(({ key, action }) =>
  typeof action === "object" ? [key.toUpperCase()] : [],
);
// Derived from the shortcut registry so a new tool is announced with the others.
const TOOL_SHORTCUT_HINT = `Use ${TOOL_SHORTCUT_KEYS.slice(0, -1).join(", ")}, or ${TOOL_SHORTCUT_KEYS.at(-1)} to select a tool.`;

interface PdfViewerProps {
  document: PDFDocumentProxy;
  page: PageState;
  onPageChange: (pageNumber: number) => void;
  onPageBoundsChange: (pageNumber: number, bounds: LogicalPageBounds | null) => void;
  onViewZoomChange: (pageNumber: number, zoom: number | null) => void;
  activeMeasurementEditId: string | null;
  onMeasurementEditActiveChange: (measurementId: string, active: boolean) => void;
  onChooseTool: (tool: Tool) => void;
  onCalibrationCandidate: (points: [Point, Point]) => void;
  onCalibrationCancel: () => void;
  scaleCheckStore?: ScaleCheckStore;
  calibrationReferenceEdit: CalibrationReferenceEditPreview | null;
  measurementEditingBlocked: boolean;
  onCalibrationReferencePointsChange: (points: [Point, Point]) => void;
  onCalibrationReferenceEditCancel: () => void;
  onCalibrationReferenceEditSave?: () => void;
  keyboardAuthoringEnabled?: boolean;
}

/** True when `node` is inside a portaled popover whose trigger lives in `viewer`. */
function isInsideViewerPopover(viewer: HTMLElement, node: EventTarget | null): boolean {
  if (!(node instanceof Element) || viewer.contains(node)) return false;
  const portalId = node.closest("[data-focus-portal]")?.getAttribute("data-focus-portal");
  if (!portalId) return false;
  return Array.from(viewer.querySelectorAll<HTMLElement>("[data-focus-owner]")).some(
    (owner) => owner.dataset.focusOwner === portalId,
  );
}

const LIVE_LENGTH_TYPES: ReadonlySet<string> = new Set(["line", "polyline", "polygon"]);

function fitTransformFor(
  mode: "initial" | "page",
  bounds: Pick<LogicalPageBounds, "width" | "height">,
  viewer: { width: number; height: number },
  defaultZoom: DefaultZoom,
): ViewTransform {
  return initialViewTransform(mode === "page" ? "fit-page" : defaultZoom, bounds, viewer);
}

export function PdfViewer({
  document,
  page,
  onPageChange,
  onPageBoundsChange,
  onViewZoomChange,
  activeMeasurementEditId,
  onMeasurementEditActiveChange,
  onChooseTool,
  onCalibrationCandidate,
  onCalibrationCancel,
  calibrationReferenceEdit,
  scaleCheckStore,
  measurementEditingBlocked,
  onCalibrationReferencePointsChange,
  onCalibrationReferenceEditCancel,
  onCalibrationReferenceEditSave = () => undefined,
  keyboardAuthoringEnabled = false,
}: PdfViewerProps) {
  const { setError } = useAppState();
  const onNavigationChange = useViewerNavigationRegistration();
  const registerInteractionCommands = useViewerInteractionCommandRegistration();
  const viewerBottomExclusion = useViewerBottomExclusion();
  const authoringCapability = useAuthoringCapability();
  const canvasVisualRoles = useCanvasVisualRoles();
  const {
    fillOpacity,
    handleSize,
    defaultZoom,
    wheelBehavior,
    crosshairCursor,
    liveLength,
    finishOnDoubleClick,
    pageGrid,
    renderQuality,
    rasterCache,
    debugOverlay,
  } = useAppPreferences();
  const fillScale = FILL_OPACITY_SCALE[fillOpacity];
  const handleRadiusScreenPx = scaledHandleRadiusScreenPx(HANDLE_SIZE_SCALE[handleSize]);
  const canvasInteractionTarget = useCanvasInteractionTargetScreenPx();
  const precisionAuthoringBlocked = !authoringCapability.available;
  const { session, addMeasurement, updateMeasurement, updateMeasurements } = useSessionState();
  const keyboardHelpId = useId();
  const keyboardHelpRef = useRef<HTMLDivElement | null>(null);
  const {
    activeTool,
    draft: workspaceDraft,
    orthogonal,
    snap,
    toggleOrthogonal,
    toggleSnap,
    chooseTool: chooseWorkspaceTool,
    selectedMeasurementId,
    selectedMeasurementIds,
    selectMeasurement: selectWorkspaceMeasurement,
    clearSelection: clearWorkspaceSelection,
    startDraft,
    updateDraft,
    clearDraft,
    completeDraft,
  } = useWorkspaceState();
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const candidateStageRef = useRef<Konva.Stage>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageGroupRef = useRef<Konva.Group>(null);
  const candidatePageGroupRef = useRef<Konva.Group>(null);
  const annotationLayerRef = useRef<Konva.Layer>(null);
  const candidateAnnotationLayerRef = useRef<Konva.Layer>(null);
  const cachedPanGroupRef = useRef<Konva.Group | null>(null);
  const draftPreviewGroupRef = useRef<Konva.Group>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const mainRenderOwnerRef = useRef({});
  const panOwnerRef = useRef({});
  const activePageRequestRef = useRef({ document, pageNumber: page.pageNumber });
  const viewerMountedRef = useRef(false);
  const pageRenderTasksRef = useRef(new WeakMap<PDFPageProxy, Set<RenderTask>>());
  const recentRasterRef = useRef<RecentRaster | null>(null);
  const wheelZoomFrameRef = useRef<number | null>(null);
  const pendingWheelZoomRef = useRef<{ point: Point; factor: number } | null>(null);
  const wheelSettleTimerRef = useRef<number | null>(null);
  const wheelGestureActiveRef = useRef(false);
  const wheelFrameStartRef = useRef<number | null>(null);
  const [wheelGesture, setWheelGesture] = useState<{
    transform: ViewTransform;
    cached: boolean;
    pageNumber: number;
  } | null>(null);
  const renderCacheRef = useRef(new LruRenderCache<HTMLCanvasElement>());
  const lastRenderMsRef = useRef<number | null>(null);
  const getDebugStats = useCallback(
    () => ({
      cacheEntries: renderCacheRef.current.size,
      cachePixels: renderCacheRef.current.pixels,
      lastRenderMs: lastRenderMsRef.current,
    }),
    [],
  );
  useEffect(() => {
    const limits = RASTER_CACHE_LIMITS[rasterCache];
    renderCacheRef.current.setLimits(limits.maxEntries, limits.maxPixels);
  }, [rasterCache]);
  const activeMeasurementEditIdRef = useRef(activeMeasurementEditId);
  const cachedDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const renderRequestRef = useRef(0);
  const pageReadyRef = useRef(false);
  const [pageRenderData, setPageRenderData] = useState<LoadedPageData | null>(null);
  const [annotationPreparationPage, setAnnotationPreparationPage] = useState<LoadedPageData | null>(
    null,
  );
  const [readyRaster, setReadyRaster] = useState<ReadyRaster | null>(null);
  const [displayedRaster, setDisplayedRaster] = useState<ReadyRaster | null>(null);
  const [failedPageRequest, setFailedPageRequest] = useState<{
    document: PDFDocumentProxy;
    pageNumber: number;
  } | null>(null);
  const [displayedStageSlot, setDisplayedStageSlot] = useState<0 | 1>(0);
  const [preparedCandidate, setPreparedCandidate] = useState<object | null>(null);
  const drawnCandidateKeyRef = useRef<object | null>(null);
  const [pageReady, setPageReady] = useState(false);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [devicePixelRatio, setDevicePixelRatio] = useState(() => window.devicePixelRatio || 1);
  const [transform, setTransform] = useState<ViewTransform>({ zoom: 1, panX: 0, panY: 0 });
  const transformRef = useRef<ViewTransform>(transform);
  const [presentedState, setPresentedState] = useState({ page, transform });
  // "initial" follows the default-zoom preference; "page" is the manual Fit button.
  const [fitMode, setFitModeState] = useState<false | "initial" | "page">("initial");
  const [spacePan, setSpacePan] = useState(false);
  const [draftPointer, setDraftPointer] = useState<Point | null>(null);
  const [placementPointer, setPlacementPointer] = useState<Point | null>(null);
  // Shift while drawing a box shape (rectangle, ellipse) constrains it to a square or circle.
  const [shapeConstrain, setShapeConstrain] = useState(false);
  const shapeConstrainRef = useRef(false);
  const updateShapeConstrain = useCallback((value: boolean) => {
    shapeConstrainRef.current = value;
    setShapeConstrain((current) => (current === value ? current : value));
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Shift") updateShapeConstrain(event.type === "keydown");
    };
    const onBlur = () => updateShapeConstrain(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [updateShapeConstrain]);
  const [isPanning, setIsPanning] = useState(false);
  const suppressPanClickRef = useRef(false);
  const suppressPanClickTimerRef = useRef<number | null>(null);
  const panDragRef = useRef<{
    pointer: Point;
    transform: ViewTransform;
  } | null>(null);
  const completedPanRef = useRef(false);
  const safeViewer = useMemo(
    () => safeViewerLayout(viewerSize, viewerBottomExclusion),
    [viewerBottomExclusion, viewerSize],
  );
  const safeViewerCenterRef = useRef<Point | null>(safeViewer.center);

  useLayoutEffect(() => {
    viewerMountedRef.current = true;
    return () => {
      viewerMountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    activePageRequestRef.current = { document, pageNumber: page.pageNumber };
  }, [document, page.pageNumber]);

  const trackPageRenderTask = useCallback((pdfPage: PDFPageProxy, renderTask: RenderTask) => {
    let tasks = pageRenderTasksRef.current.get(pdfPage);
    if (!tasks) {
      tasks = new Set();
      pageRenderTasksRef.current.set(pdfPage, tasks);
    }
    tasks.add(renderTask);
    const forgetTask = () => {
      tasks.delete(renderTask);
    };
    void renderTask.promise.then(forgetTask, forgetTask);
  }, []);

  const cleanupInactivePage = useCallback(
    (pageDocument: PDFDocumentProxy, pageNumber: number, pdfPage: PDFPageProxy) => {
      const cleanup = () => {
        if (!viewerMountedRef.current) return;
        const activePage = activePageRequestRef.current;
        if (activePage.document !== pageDocument || activePage.pageNumber === pageNumber) return;
        pdfPage.cleanup();
      };
      const renderTasks = pageRenderTasksRef.current.get(pdfPage);
      if (!renderTasks?.size) {
        cleanup();
        return;
      }
      void Promise.allSettled(Array.from(renderTasks, (renderTask) => renderTask.promise)).then(
        cleanup,
      );
    },
    [],
  );

  const clearSnapFeedback = useCallback(() => {
    setPlacementPointer(null);
  }, []);

  const {
    wholeMeasurementDragCancellationRegistryRef,
    vertexDragCancellationRegistryRef,
    registerWholeMeasurementDragCancellation,
    cancelActiveWholeMeasurementDrag,
    registerVertexDragCancellation,
    cancelActiveVertexDrag,
    registerCalibrationReferenceDragCancellation,
    cancelActiveCalibrationReferenceDrag,
  } = useDragCancellationRegistry();

  const clearActiveMeasurementEdit = useCallback(() => {
    const measurementId = activeMeasurementEditIdRef.current;
    if (measurementId) onMeasurementEditActiveChange(measurementId, false);
  }, [onMeasurementEditActiveChange]);
  const selectMeasurement = useCallback(
    (id: string, additive = false) => {
      selectWorkspaceMeasurement(id, additive);
      setError(null);
    },
    [selectWorkspaceMeasurement, setError],
  );
  const clearSelection = useCallback(() => {
    clearWorkspaceSelection();
    setError(null);
  }, [clearWorkspaceSelection, setError]);
  const completedDraftCommandRef = useRef<DrawingDraft | null>(null);
  const completePath = useCallback(
    (
      measurementType: MeasurementType,
      points: Point[],
      sourceDraft: DrawingDraft | null = null,
    ) => {
      if (sourceDraft && completedDraftCommandRef.current === sourceDraft) return false;
      if (sourceDraft) completedDraftCommandRef.current = sourceDraft;
      const id = crypto.randomUUID();
      const accepted = addMeasurement({
        pageNumber: page.pageNumber,
        id,
        measurementType,
        points,
      });
      if (!accepted) {
        if (completedDraftCommandRef.current === sourceDraft)
          completedDraftCommandRef.current = null;
        return false;
      }
      setDraftPointer(null);
      completeDraft();
      selectWorkspaceMeasurement(id);
      if (returnsToSelectAfterFinishing(getAppPreferences().afterFinishing, measurementType)) {
        chooseWorkspaceTool("select", { keepSelection: true });
      }
      return true;
    },
    [
      addMeasurement,
      chooseWorkspaceTool,
      completeDraft,
      page.pageNumber,
      selectWorkspaceMeasurement,
    ],
  );
  const activeToolRef = useRef(activeTool);
  const workspaceDraftRef = useRef(workspaceDraft);
  const clearDraftRef = useRef(clearDraft);
  const onCalibrationCancelRef = useRef(onCalibrationCancel);
  const onChooseToolRef = useRef(onChooseTool);
  const completePathRef = useRef(completePath);
  const calibrationReferenceEditRef = useRef(calibrationReferenceEdit);
  const onCalibrationReferenceEditCancelRef = useRef(onCalibrationReferenceEditCancel);

  const completeCurrentDraft = useCallback(() => {
    const draft = workspaceDraftRef.current;
    if (
      !draft ||
      draft.type !== "path" ||
      getDrawingKeyboardAction("Enter", activeToolRef.current, draft) !== "complete-path" ||
      completedDraftCommandRef.current === draft
    ) {
      return;
    }
    completePathRef.current(draft.measurementType, draft.points, draft);
  }, []);

  useLayoutEffect(() => {
    activeToolRef.current = activeTool;
    workspaceDraftRef.current = workspaceDraft;
    clearDraftRef.current = clearDraft;
    safeViewerCenterRef.current = safeViewer.center;
    onCalibrationCancelRef.current = onCalibrationCancel;
    onChooseToolRef.current = onChooseTool;
    completePathRef.current = completePath;
    calibrationReferenceEditRef.current = calibrationReferenceEdit;
    onCalibrationReferenceEditCancelRef.current = onCalibrationReferenceEditCancel;
    activeMeasurementEditIdRef.current = activeMeasurementEditId;
    if (completedDraftCommandRef.current !== workspaceDraft) {
      completedDraftCommandRef.current = null;
    }
  }, [
    activeMeasurementEditId,
    calibrationReferenceEdit,
    clearDraft,
    completePath,
    onCalibrationCancel,
    onCalibrationReferenceEditCancel,
    onChooseTool,
    activeTool,
    workspaceDraft,
    viewerSize,
    safeViewer.center,
  ]);

  useLayoutEffect(() => {
    if (!registerInteractionCommands) return;
    return registerInteractionCommands({ completeCurrentDraft });
  }, [completeCurrentDraft, registerInteractionCommands]);

  const bounds = pageRenderData?.bounds ?? null;
  const showMeasurements = session?.settings.showMeasurements ?? false;
  const snapTargets = useMemo(
    () => extractSnapTargets(page.measurements, showMeasurements, bounds ?? undefined, snap),
    [bounds, page.measurements, showMeasurements, snap],
  );

  useLayoutEffect(
    () => () => {
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      cancelActiveCalibrationReferenceDrag();
      clearActiveMeasurementEdit();
    },
    [
      cancelActiveVertexDrag,
      cancelActiveWholeMeasurementDrag,
      cancelActiveCalibrationReferenceDrag,
      clearActiveMeasurementEdit,
      page.pageNumber,
    ],
  );

  useEffect(
    () => () => {
      onViewZoomChange(page.pageNumber, null);
    },
    [onViewZoomChange, page.pageNumber],
  );

  const commitTransform = useCallback((next: ViewTransform) => {
    transformRef.current = next;
    setTransform(next);
  }, []);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const updateViewerMetrics = (width: number, height: number) => {
      const nextSize = { width, height };
      setViewerSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
      );
      const nextPixelRatio = window.devicePixelRatio || 1;
      setDevicePixelRatio((current) => (current === nextPixelRatio ? current : nextPixelRatio));
    };
    const initialRect = element.getBoundingClientRect();
    // Do not depend on the first ResizeObserver delivery to make the initial
    // raster eligible. A mounted viewer can already have a valid layout here.
    updateViewerMetrics(initialRect.width, initialRect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateViewerMetrics(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    const updatePixelRatio = () => {
      const nextPixelRatio = window.devicePixelRatio || 1;
      setDevicePixelRatio((current) => (current === nextPixelRatio ? current : nextPixelRatio));
    };
    window.addEventListener("resize", updatePixelRatio);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePixelRatio);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedPageForCleanup: PDFPageProxy | null = null;
    renderRequestRef.current += 1;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    if (cachedDocumentRef.current !== document) {
      renderCacheRef.current.clear();
      recentRasterRef.current = null;
      cachedDocumentRef.current = document;
      // A replacement document must release the previous PDF raster as well as hide it.
      setAnnotationPreparationPage(null);
      setReadyRaster(null);
      setDisplayedRaster(null);
    }
    // Keep the old canvas pixels detached from the new page until the new raster is ready.
    pageReadyRef.current = false;
    onPageBoundsChange(page.pageNumber, null);
    // This state transition hides a previous page immediately when the requested page changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageReady(false);
    setFailedPageRequest(null);
    // The loaded page data is replaced atomically by the async PDF.js result below.
    setPageRenderData(null);
    // A page navigation always returns to the page's fit transform.
    setFitModeState("initial");
    void document
      .getPage(page.pageNumber)
      .then((loadedPage) => {
        loadedPageForCleanup = loadedPage;
        if (cancelled) {
          cleanupInactivePage(document, page.pageNumber, loadedPage);
          return;
        }
        const rotation = normalizeRotation(loadedPage.rotate);
        const logicalViewport = loadedPage.getViewport({ scale: 1, rotation });
        const nextBounds = logicalPageBoundsFromViewport(logicalViewport);
        onPageBoundsChange(page.pageNumber, nextBounds);
        setPageRenderData({
          document,
          pageNumber: page.pageNumber,
          pdfPage: loadedPage,
          bounds: nextBounds,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMainPdfBusy(document, mainRenderOwnerRef.current, false);
          setFailedPageRequest({ document, pageNumber: page.pageNumber });
          setDisplayedRaster(null);
          setError(pdfRenderErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
      onPageBoundsChange(page.pageNumber, null);
      renderRequestRef.current += 1;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      if (loadedPageForCleanup) {
        cleanupInactivePage(document, page.pageNumber, loadedPageForCleanup);
      }
    };
  }, [cleanupInactivePage, document, onPageBoundsChange, page.pageNumber, setError]);

  useEffect(() => {
    if (!bounds || safeViewer.size.width <= 0 || safeViewer.size.height <= 0 || !fitMode) return;
    // The view transform intentionally follows ResizeObserver output while fit mode is active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    commitTransform(fitTransformFor(fitMode, bounds, safeViewer.size, defaultZoom));
  }, [bounds, safeViewer.size, fitMode, defaultZoom, commitTransform]);

  const viewTransform = useMemo(
    () =>
      bounds && safeViewer.size.width > 0 && safeViewer.size.height > 0 && fitMode
        ? fitTransformFor(fitMode, bounds, safeViewer.size, defaultZoom)
        : transform,
    [bounds, defaultZoom, fitMode, safeViewer.size, transform],
  );

  useLayoutEffect(() => {
    const owner = mainRenderOwnerRef.current;
    setMainPdfPage(document, page.pageNumber);
    setMainPdfBusy(document, owner, true);
    return () => setMainPdfBusy(document, owner, false);
  }, [document, page.pageNumber, viewTransform.zoom]);

  // Thumbnails copy a completed background from the existing caches instead of decoding again.
  useEffect(
    () =>
      setMainPdfRasterSource(document, (pageNumber) => {
        if (cachedDocumentRef.current !== document) return undefined;
        const prefix = `${pageNumber}:`;
        const recent = recentRasterRef.current;
        if (recent?.document === document && recent.cacheKey.startsWith(prefix))
          return recent.canvas;
        return renderCacheRef.current.find((key) => key.startsWith(prefix));
      }),
    [document],
  );

  useLayoutEffect(() => {
    const owner = panOwnerRef.current;
    setMainPdfBusy(document, owner, isPanning);
    return () => setMainPdfBusy(document, owner, false);
  }, [document, isPanning]);

  const showPage = Boolean(
    pageReady &&
    readyRaster?.page === pageRenderData &&
    pageRenderData?.document === document &&
    pageRenderData.pageNumber === page.pageNumber &&
    bounds &&
    viewerSize.width > 0 &&
    viewerSize.height > 0,
  );
  const pageLoadFailed =
    failedPageRequest?.document === document && failedPageRequest.pageNumber === page.pageNumber;
  const canvasPageData =
    !pageLoadFailed && displayedRaster?.page.document === document ? displayedRaster.page : null;
  const isPresentedTarget = showPage && canvasPageData === pageRenderData;

  const keyboardGeometry = useKeyboardGeometry({
    document,
    page,
    bounds,
    transform: viewTransform,
    screenCenter: safeViewer.center ?? { x: 0, y: 0 },
    visibleSize: {
      width: safeViewer.size.width - authoringCapability.rightObstruction,
      height: safeViewer.size.height,
    },
    tool: activeTool,
    draft: workspaceDraft,
    selectedIds: selectedMeasurementIds,
    disabled:
      !keyboardAuthoringEnabled ||
      precisionAuthoringBlocked ||
      !pageReady ||
      pageRenderData?.document !== document ||
      pageRenderData?.pageNumber !== page.pageNumber,
    editingBlocked: measurementEditingBlocked || Boolean(activeMeasurementEditId),
    showMeasurements,
    snap,
    orthogonal,
    targets: snapTargets,
    referenceEdit: calibrationReferenceEdit,
    onReferenceChange: onCalibrationReferencePointsChange,
    onReferenceSave: onCalibrationReferenceEditSave,
    onReferenceCancel: onCalibrationReferenceEditCancel,
    placePoint: placeDrawingPoint,
    previewPoint: (pointer, previewTransform) => {
      setPlacementPointer(pointer);
      if (activeTool === "calibrate" && bounds)
        setDraftPointer(screenToPage(pointer, previewTransform));
    },
    revealPoint: (point) => {
      const effectivePoint =
        resolveDrawingPreview({
          tool: activeTool,
          draft: workspaceDraft,
          rawPointerScreen: pageToScreen(point, viewTransform),
          transform: viewTransform,
          bounds,
          snapEnabled: snap,
          orthogonal,
          targets: snapTargets,
          spacePan,
          isPanning,
          calibrationReferenceEditActive: Boolean(calibrationReferenceEdit),
          measurementEditActive: Boolean(activeMeasurementEditId),
        })?.point ?? point;
      const screen = pageToScreen(effectivePoint, viewTransform);
      const usableWidth = safeViewer.size.width - authoringCapability.rightObstruction;
      const x = Math.max(64, Math.min(usableWidth - 16, screen.x));
      let y = Math.max(64, Math.min(safeViewer.size.height - 16, screen.y));
      const help = keyboardHelpRef.current;
      if (
        help &&
        x >= help.offsetLeft - 16 &&
        x <= help.offsetLeft + help.offsetWidth + 16 &&
        y >= help.offsetTop - 16 &&
        y <= help.offsetTop + help.offsetHeight + 16
      ) {
        y = Math.min(safeViewer.size.height - 16, help.offsetTop + help.offsetHeight + 16);
      }
      if (x === screen.x && y === screen.y) return viewTransform;
      const next = {
        ...viewTransform,
        panX: viewTransform.panX + x - screen.x,
        panY: viewTransform.panY + y - screen.y,
      };
      setFitModeState(false);
      commitTransform(next);
      return next;
    },
    select: selectWorkspaceMeasurement,
    cancelPointerEdit: () => {
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      cancelActiveCalibrationReferenceDrag();
    },
    commit: updateMeasurements,
    reportError: setError,
  });
  const { cancel: cancelKeyboardGeometry, editing: keyboardEditing } = keyboardGeometry;

  const revealKeyboardCursorAfterHelpChange = useEffectEvent(() =>
    keyboardGeometry.ensureCursorVisible(),
  );
  useLayoutEffect(() => {
    // The help changes height when an edit starts; measure the committed card before revealing its cursor.
    revealKeyboardCursorAfterHelpChange();
  }, [
    keyboardEditing,
    keyboardGeometry.editTarget,
    keyboardGeometry.editableMeasurement?.name,
    calibrationReferenceEdit,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const loadedPage = pageRenderData;
    if (!canvas || !loadedPage || viewerSize.width <= 0 || viewerSize.height <= 0) return;

    setMainPdfBusy(loadedPage.document, mainRenderOwnerRef.current, true);
    const requestId = ++renderRequestRef.current;
    const quality = PDF_RASTER_QUALITY_LIMITS[renderQuality];
    const layout = pdfRasterLayout(
      loadedPage.bounds,
      { zoom: viewTransform.zoom, panX: 0, panY: 0 },
      Math.min(devicePixelRatio, quality.maxDpr),
      effectiveRasterPixels(quality.maxPixels),
      quality.maxDimension,
    );
    const cacheKey = [
      loadedPage.pageNumber,
      loadedPage.bounds.rotation,
      layout.backingWidth,
      layout.backingHeight,
      layout.rasterScale,
    ].join(":");

    const render = () => {
      if (requestId !== renderRequestRef.current) return;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      // Start the raster request before mounting and planning the target annotations.
      setAnnotationPreparationPage(loadedPage);
      const cachedRaster = renderCacheRef.current.get(cacheKey);
      const recentRaster = recentRasterRef.current;
      const reusableRaster =
        cachedRaster ??
        (recentRaster?.document === loadedPage.document && recentRaster.cacheKey === cacheKey
          ? recentRaster.canvas
          : undefined);
      if (reusableRaster) {
        setMainPdfBusy(loadedPage.document, mainRenderOwnerRef.current, false);
        recentRasterRef.current = {
          document: loadedPage.document,
          cacheKey,
          canvas: reusableRaster,
        };
        pageReadyRef.current = true;
        setReadyRaster({ page: loadedPage, canvas: reusableRaster });
        setPageReady(true);
        return;
      }

      const rasterCanvas = window.document.createElement("canvas");
      rasterCanvas.width = layout.backingWidth;
      rasterCanvas.height = layout.backingHeight;
      const context = rasterCanvas.getContext("2d", { alpha: false });
      if (!context) {
        setMainPdfBusy(loadedPage.document, mainRenderOwnerRef.current, false);
        setAnnotationPreparationPage(null);
        setError("The PDF canvas could not be created.");
        return;
      }
      const renderViewport = loadedPage.pdfPage.getViewport({
        scale: layout.rasterScale,
        rotation: loadedPage.bounds.rotation,
      });
      const startedAt = performance.now();
      const renderTask = loadedPage.pdfPage.render({
        canvas: rasterCanvas,
        canvasContext: context,
        viewport: renderViewport,
      });
      trackPageRenderTask(loadedPage.pdfPage, renderTask);
      renderTaskRef.current = renderTask;
      void renderTask.promise
        .then(() => {
          if (requestId !== renderRequestRef.current) return;
          renderTaskRef.current = null;
          const renderMs = performance.now() - startedAt;
          lastRenderMsRef.current = renderMs;
          setMainPdfRenderMs(loadedPage.document, loadedPage.pageNumber, renderMs);
          setMainPdfBusy(loadedPage.document, mainRenderOwnerRef.current, false);
          renderCacheRef.current.set(
            cacheKey,
            rasterCanvas,
            layout.backingWidth * layout.backingHeight,
          );
          recentRasterRef.current = {
            document: loadedPage.document,
            cacheKey,
            canvas: rasterCanvas,
          };
          pageReadyRef.current = true;
          setReadyRaster({ page: loadedPage, canvas: rasterCanvas });
          setPageReady(true);
        })
        .catch((error: unknown) => {
          if (requestId !== renderRequestRef.current) return;
          renderTaskRef.current = null;
          setMainPdfBusy(loadedPage.document, mainRenderOwnerRef.current, false);
          const message = pdfRenderErrorMessage(error);
          if (message) {
            setAnnotationPreparationPage(null);
            setError(message);
          }
        });
    };

    const timer = pageReadyRef.current
      ? window.setTimeout(render, getAppPreferences().renderDelayMs)
      : null;
    if (timer === null) render();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (requestId === renderRequestRef.current) {
        renderRequestRef.current += 1;
        renderTaskRef.current?.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [
    devicePixelRatio,
    pageRenderData,
    renderQuality,
    setError,
    trackPageRenderTask,
    viewTransform.zoom,
    viewerSize,
  ]);

  useEffect(
    () => () => {
      renderRequestRef.current += 1;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      renderCacheRef.current.clear();
      recentRasterRef.current = null;
      if (wheelZoomFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelZoomFrameRef.current);
      }
      if (wheelSettleTimerRef.current !== null) window.clearTimeout(wheelSettleTimerRef.current);
      if (suppressPanClickTimerRef.current !== null) {
        window.clearTimeout(suppressPanClickTimerRef.current);
      }
    },
    [],
  );

  const zoomAround = useCallback(
    (screenPoint: Point, factor: number) => {
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      cancelKeyboardGeometry();
      cancelActiveCalibrationReferenceDrag();
      clearSnapFeedback();
      setFitModeState(false);
      const current = transformRef.current;
      const next = zoomViewAtPoint(current, screenPoint, current.zoom * factor);
      const panDrag = panDragRef.current;
      if (panDrag) {
        panDrag.transform = {
          ...next,
          panX: panDrag.transform.panX + next.panX - current.panX,
          panY: panDrag.transform.panY + next.panY - current.panY,
        };
      }
      commitTransform(next);
    },
    [
      cancelActiveCalibrationReferenceDrag,
      cancelActiveVertexDrag,
      cancelActiveWholeMeasurementDrag,
      cancelKeyboardGeometry,
      clearSnapFeedback,
      commitTransform,
    ],
  );

  const fitPage = useCallback(() => {
    if (!bounds || safeViewer.size.width <= 0 || safeViewer.size.height <= 0) return;
    cancelActiveWholeMeasurementDrag();
    cancelActiveVertexDrag();
    cancelActiveCalibrationReferenceDrag();
    clearSnapFeedback();
    setFitModeState("page");
    commitTransform(fitToScreen(bounds, safeViewer.size));
  }, [
    bounds,
    safeViewer.size,
    cancelActiveWholeMeasurementDrag,
    cancelActiveVertexDrag,
    cancelActiveCalibrationReferenceDrag,
    clearSnapFeedback,
    commitTransform,
  ]);

  const changePage = useCallback(
    (pageNumber: number) => {
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      cancelActiveCalibrationReferenceDrag();
      clearSnapFeedback();
      onPageChange(pageNumber);
    },
    [
      cancelActiveCalibrationReferenceDrag,
      cancelActiveVertexDrag,
      cancelActiveWholeMeasurementDrag,
      clearSnapFeedback,
      onPageChange,
    ],
  );

  // Before a document's first page is measured the zoom is a placeholder, not the fit zoom.
  const zoomPending = !bounds && !canvasPageData;
  useLayoutEffect(() => {
    onViewZoomChange(page.pageNumber, viewTransform.zoom);
    onNavigationChange?.({
      pageNumber: page.pageNumber,
      pageCount: session?.pageCount ?? 1,
      zoom: viewTransform.zoom,
      zoomPending,
      onPageChange: changePage,
      onZoomOut: () => {
        if (safeViewer.center)
          zoomAround(safeViewer.center, 1 / ZOOM_STEP_FACTOR[getAppPreferences().zoomStep]);
      },
      onZoomIn: () => {
        if (safeViewer.center)
          zoomAround(safeViewer.center, ZOOM_STEP_FACTOR[getAppPreferences().zoomStep]);
      },
      onFit: fitPage,
    });
  }, [
    fitPage,
    onNavigationChange,
    changePage,
    onViewZoomChange,
    page.pageNumber,
    session?.pageCount,
    viewTransform.zoom,
    zoomPending,
    safeViewer.center,
    zoomAround,
  ]);

  const focusViewerSurface = useCallback((target: EventTarget | null) => {
    if (shouldIgnoreGlobalKeyboardShortcut(target)) return;
    viewerRef.current?.focus({ preventScroll: true });
  }, []);

  const { softwareCursor, softwareCursorRef, updateSoftwareCursor, leaveSoftwareCursor } =
    useSoftwareCursor({ viewerRef });

  const settleWheelZoom = useCallback(() => {
    if (wheelSettleTimerRef.current !== null) window.clearTimeout(wheelSettleTimerRef.current);
    wheelSettleTimerRef.current = null;
    wheelGestureActiveRef.current = false;
    setWheelGesture(null);
  }, []);

  const handleViewerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Pointer gestures must start from annotations planned for the current zoom.
      if (wheelGestureActiveRef.current) {
        flushSync(settleWheelZoom);
        // The hit graph still holds the last gesture frame; redraw it before Konva hit-tests.
        annotationLayerRef.current?.draw();
      }
      if (event.target instanceof Element && event.target.closest("[data-keyboard-controls]"))
        return;
      // Portaled popovers opened from viewer controls bubble synthetic events through React.
      if (isInsideViewerPopover(event.currentTarget, event.target)) return;
      // A new pointer ownership attempt invalidates any older prepared/active
      // vertex gesture before Konva can reuse a stale `ready` drag element.
      cancelActiveVertexDrag();
      if (keyboardEditing) {
        event.preventDefault();
        event.stopPropagation();
        cancelKeyboardGeometry();
        return;
      }
      cancelKeyboardGeometry();
      clearSnapFeedback();
      focusViewerSurface(event.target);
      updateSoftwareCursor(event);
    },
    [
      cancelActiveVertexDrag,
      cancelKeyboardGeometry,
      clearSnapFeedback,
      focusViewerSurface,
      keyboardEditing,
      settleWheelZoom,
      updateSoftwareCursor,
    ],
  );

  const handleViewerWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => focusViewerSurface(event.target),
    [focusViewerSurface],
  );

  const executeKeyboardAction = useCallback(
    (action: ViewerKeyboardAction) => {
      if (action === "start-pan") {
        clearSnapFeedback();
        setSpacePan(true);
      } else if (action === "zoom-in" || action === "zoom-out") {
        const safeCenter = safeViewerCenterRef.current;
        if (!safeCenter) return;
        const zoomStep = ZOOM_STEP_FACTOR[getAppPreferences().zoomStep];
        zoomAround(safeCenter, action === "zoom-in" ? zoomStep : 1 / zoomStep);
      } else if (action === "cancel-calibration") {
        clearDraftRef.current();
        onCalibrationCancelRef.current();
      } else if (action === "complete-path") {
        completeCurrentDraft();
      } else if (action === "cancel-draft") {
        clearDraftRef.current();
      } else if (action === "exit-tool") {
        onChooseToolRef.current("select");
      } else if (action === "toggle-orthogonal") {
        toggleOrthogonal();
      } else if (action === "toggle-snap") {
        toggleSnap();
      } else {
        if (precisionAuthoringBlocked && isMeasurementType(action.tool)) return;
        onChooseToolRef.current(action.tool);
      }
    },
    [
      clearSnapFeedback,
      completeCurrentDraft,
      precisionAuthoringBlocked,
      toggleOrthogonal,
      toggleSnap,
      zoomAround,
    ],
  );

  const finishPan = useCallback(() => {
    const completedPan = panDragRef.current !== null;
    panDragRef.current = null;
    if (completedPan) {
      completedPanRef.current = true;
      setTransform(transformRef.current);
      if (suppressPanClickTimerRef.current !== null) {
        window.clearTimeout(suppressPanClickTimerRef.current);
      }
      suppressPanClickTimerRef.current = window.setTimeout(() => {
        suppressPanClickRef.current = false;
        suppressPanClickTimerRef.current = null;
      }, 0);
    }
    setIsPanning(false);
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.transform = "";
  }, [transform]);

  const releaseSpacePan = useCallback(() => {
    if (panDragRef.current) setTransform(transformRef.current);
    setSpacePan(false);
  }, []);

  const handleViewerKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (shouldIgnoreViewerKeyboardShortcut(event)) return;
    if (
      window.document.querySelector(
        "dialog[open], [role='dialog'][aria-modal='true'], [data-layout-slot='viewer-interaction-shield']",
      )
    )
      return;
    if (viewerRef.current === event.target && !isPresentedTarget) return;
    if (
      event.key === "Escape" &&
      (wholeMeasurementDragCancellationRegistryRef.current.activeMeasurementId() !== null ||
        vertexDragCancellationRegistryRef.current.activeOwner() !== null)
    ) {
      event.preventDefault();
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      clearSnapFeedback();
      return;
    }
    if (
      keyboardAuthoringEnabled &&
      viewerRef.current === event.target &&
      activeTool === "hand" &&
      event.key.startsWith("Arrow")
    ) {
      const step = event.shiftKey ? 100 : 20;
      event.preventDefault();
      cancelKeyboardGeometry();
      setFitModeState(false);
      commitTransform({
        ...viewTransform,
        panX:
          viewTransform.panX +
          (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
        panY:
          viewTransform.panY +
          (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
      });
      return;
    }
    if (viewerRef.current === event.target && keyboardGeometry.handleKeyDown(event)) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && calibrationReferenceEditRef.current) {
      event.preventDefault();
      onCalibrationReferenceEditCancelRef.current();
      return;
    }
    const action = getViewerKeyboardAction(event, activeToolRef.current, workspaceDraftRef.current);
    if (!action) return;
    if (
      event.repeat &&
      (action === "toggle-orthogonal" || action === "toggle-snap" || typeof action === "object")
    )
      return;

    event.preventDefault();
    if (typeof action === "object" && action.tool === activeToolRef.current) return;
    executeKeyboardAction(action);
  });

  const handleKeyboardGeometryKeyUp = useEffectEvent((event: KeyboardEvent) =>
    keyboardGeometry.handleKeyUp(event),
  );

  useEffect(() => {
    window.addEventListener("keydown", handleViewerKeyDown);
    window.addEventListener("keyup", handleKeyboardGeometryKeyUp);
    return () => {
      window.removeEventListener("keydown", handleViewerKeyDown);
      window.removeEventListener("keyup", handleKeyboardGeometryKeyUp);
    };
  }, []);

  useEffect(() => {
    function handleGlobalKeyUp(event: KeyboardEvent) {
      if (event.key === " ") releaseSpacePan();
    }
    function cancelMeasurementEditForEnvironmentLoss() {
      cancelKeyboardGeometry();
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      cancelActiveCalibrationReferenceDrag();
      clearActiveMeasurementEdit();
      clearSnapFeedback();
      releaseSpacePan();
      finishPan();
    }
    window.addEventListener("keyup", handleGlobalKeyUp);
    const unregisterEnvironmentCancellation = registerWholeMeasurementDragEnvironmentCancellation({
      windowTarget: window,
      documentTarget: window.document,
      cancel: cancelMeasurementEditForEnvironmentLoss,
    });
    const unregisterPointerReleaseCleanup = registerWholeMeasurementDragPointerReleaseCleanup({
      windowTarget: window,
      cancelPreparedDrag: () => {
        cancelActiveWholeMeasurementDrag();
        cancelActiveVertexDrag();
        cancelActiveCalibrationReferenceDrag();
      },
    });
    return () => {
      window.removeEventListener("keyup", handleGlobalKeyUp);
      unregisterEnvironmentCancellation();
      unregisterPointerReleaseCleanup();
    };
  }, [
    cancelActiveWholeMeasurementDrag,
    cancelActiveVertexDrag,
    cancelActiveCalibrationReferenceDrag,
    clearActiveMeasurementEdit,
    clearSnapFeedback,
    executeKeyboardAction,
    finishPan,
    cancelKeyboardGeometry,
    releaseSpacePan,
  ]);

  function stagePointer(event: KonvaEventObject<MouseEvent | WheelEvent>): Point | null {
    const pointer = event.target.getStage()?.getPointerPosition();
    return pointer ? { x: pointer.x, y: pointer.y } : null;
  }

  function handleMouseDown(event: KonvaEventObject<MouseEvent>) {
    if (!startsViewerPan(activeTool, spacePan, event.evt.button)) return;
    cancelActiveWholeMeasurementDrag();
    cancelActiveVertexDrag();
    cancelActiveCalibrationReferenceDrag();
    clearSnapFeedback();
    const pointer = stagePointer(event);
    if (!pointer) return;
    event.evt.preventDefault();
    suppressPanClickRef.current = true;
    panDragRef.current = { pointer, transform: transformRef.current };
    setFitModeState(false);
    setIsPanning(true);
  }

  function applyTransientPan(next: ViewTransform) {
    transformRef.current = next;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.transform = `translate3d(${next.panX - transform.panX}px, ${next.panY - transform.panY}px, 0)`;
    }
    const group = pageGroupRef.current;
    if (group) {
      group.position({ x: next.panX, y: next.panY });
    }
    const draftPreviewGroup = draftPreviewGroupRef.current;
    if (draftPreviewGroup) {
      draftPreviewGroup.position({ x: next.panX, y: next.panY });
    }
  }

  function handleMouseMove(event: KonvaEventObject<MouseEvent>) {
    updateShapeConstrain(Boolean(event.evt?.shiftKey));
    if (keyboardGeometry.cursor) return;
    const pointer = stagePointer(event);
    if (!pointer) return;
    const panDrag = panDragRef.current;
    if (panDrag) {
      applyTransientPan({
        ...panDrag.transform,
        panX: panDrag.transform.panX + pointer.x - panDrag.pointer.x,
        panY: panDrag.transform.panY + pointer.y - panDrag.pointer.y,
      });
      return;
    }
    if (!bounds) {
      clearSnapFeedback();
      return;
    }
    if (
      precisionAuthoringBlocked &&
      (activeTool === "calibrate" || isMeasurementType(activeTool))
    ) {
      setDraftPointer(null);
      clearSnapFeedback();
      return;
    }
    if (activeTool === "calibrate") {
      clearSnapFeedback();
      if (workspaceDraft?.type !== "calibrate") return;
      if (isScreenPointInPage(pointer, viewTransform, bounds)) {
        setDraftPointer(clampPointToPage(screenToPage(pointer, viewTransform), bounds));
      }
      return;
    }
    if (
      !isSnapPointPlacementActive(
        activeTool,
        spacePan,
        isPanning,
        Boolean(calibrationReferenceEdit),
        Boolean(activeMeasurementEditId),
      )
    ) {
      clearSnapFeedback();
      return;
    }
    if (!isScreenPointInPage(pointer, viewTransform, bounds)) {
      clearSnapFeedback();
      return;
    }
    setPlacementPointer((current) =>
      current?.x === pointer.x && current.y === pointer.y ? current : pointer,
    );
  }

  function handleMouseUp() {
    finishPan();
  }

  function handleMouseLeave() {
    clearSnapFeedback();
    finishPan();
  }

  function handleStageClick(event: KonvaEventObject<MouseEvent>) {
    if (!authoringCapability.finePointer) return;
    if (!isPrimaryViewerClick(event.evt.button)) return;
    if (suppressPanClickRef.current) {
      suppressPanClickRef.current = false;
      if (suppressPanClickTimerRef.current !== null) {
        window.clearTimeout(suppressPanClickTimerRef.current);
        suppressPanClickTimerRef.current = null;
      }
      return;
    }
    if (calibrationReferenceEdit) return;
    if (!bounds || activeTool === "select" || activeTool === "hand" || spacePan) {
      if (
        (event.target === event.target.getStage() || event.target.name() === "page-background") &&
        activeTool === "select"
      ) {
        clearSelection();
      }
      return;
    }
    if (
      finishOnDoubleClick &&
      event.evt.detail >= 2 &&
      workspaceDraft?.type === "path" &&
      workspaceDraft.points.length > 0 &&
      measurementPathSpecs[workspaceDraft.measurementType].authoring !== "box"
    ) {
      // The first click of a double click already placed the last vertex; this one only finishes.
      completeCurrentDraft();
      return;
    }
    const pointer = stagePointer(event);
    if (!pointer) return;
    updateShapeConstrain(event.evt.shiftKey);
    placeDrawingPoint(pointer);
  }

  function placeDrawingPoint(pointer: Point) {
    if (!bounds || calibrationReferenceEdit) return;
    const draft = workspaceDraft;

    if (
      precisionAuthoringBlocked &&
      (activeTool === "calibrate" || isMeasurementType(activeTool))
    ) {
      clearSnapFeedback();
      return;
    }

    if (activeTool === "calibrate") {
      if (!isScreenPointInPage(pointer, viewTransform, bounds)) {
        clearSnapFeedback();
        return;
      }
      const point = clampPointToPage(screenToPage(pointer, viewTransform), bounds);
      if (!draft || draft.type !== "calibrate" || draft.points.length === 0) {
        setDraftPointer(point);
        startDraft({ type: "calibrate", points: [point] });
        return;
      }
      const first = draft.points[0]!;
      if (areEffectivelyIdentical(first, point)) {
        setError("Choose two distinct calibration points.");
        return;
      }
      setDraftPointer(null);
      clearDraft();
      chooseWorkspaceTool("select");
      setError(null);
      onCalibrationCandidate([first, point]);
      return;
    }

    if (isMeasurementType(activeTool)) {
      if (!isScreenPointInPage(pointer, viewTransform, bounds)) {
        clearSnapFeedback();
        return;
      }
      if (activeTool === "count") {
        const point = clampPointToPage(screenToPage(pointer, viewTransform), bounds);
        const count =
          selectedMeasurementIds.length === 1
            ? session?.pages[page.pageNumber]?.measurements.find(
                (measurement) =>
                  measurement.id === selectedMeasurementId &&
                  measurement.type === "count" &&
                  measurement.visible,
              )
            : undefined;
        if (count) {
          updateMeasurement({
            pageNumber: page.pageNumber,
            id: count.id,
            points: [...count.points, point],
          });
        } else {
          completePath("count", [point]);
        }
        return;
      }
      const measurementType = activeTool;
      if (
        !isSnapPointPlacementActive(
          measurementType,
          spacePan,
          isPanning,
          Boolean(calibrationReferenceEdit),
          Boolean(activeMeasurementEditId),
        )
      )
        return;
      const pathDraft =
        draft?.type === "path" && draft.measurementType === measurementType ? draft : null;
      const resolution = resolveDrawingPoint({
        measurementType,
        confirmedPoints: pathDraft?.points ?? [],
        rawPointerScreen: pointer,
        transform: viewTransform,
        bounds,
        snapEnabled: snap,
        orthogonal,
        targets: snapTargets,
      });
      if (!resolution) return;
      clearSnapFeedback();
      if (!pathDraft) {
        startDraft({ type: "path", measurementType, points: [resolution.point] });
        return;
      }
      const spec = measurementPathSpecs[measurementType];
      if (spec.authoring === "box") {
        const first = pathDraft.points[0];
        if (!first) return;
        const ring = boxFromCorners(first, resolution.point, shapeConstrainRef.current, bounds);
        if (!ring) return;
        completePath(measurementType, ring, pathDraft);
        return;
      }
      if (resolution.closesPolygon) {
        if (pathDraft.points.length >= spec.minVertices) {
          completePath(measurementType, pathDraft.points, pathDraft);
        }
        return;
      }
      const last = pathDraft.points.at(-1);
      const effectivePoint = resolution.point;
      if (last && areEffectivelyIdentical(last, effectivePoint)) return;
      if (
        spec.closed &&
        pathDraft.points.some((point) => areEffectivelyIdentical(point, effectivePoint))
      )
        return;
      if (spec.maxVertices === 2) {
        completePath(measurementType, [...pathDraft.points, effectivePoint], pathDraft);
        return;
      }
      // Keep the current pointer so the next draft segment remains live after
      // confirming a vertex, even if the pointer does not move again.
      setPlacementPointer(pointer);
      updateDraft({ ...pathDraft, points: [...pathDraft.points, effectivePoint] });
    }
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    if (wheelAction(wheelBehavior, event.evt) === "pan") {
      const unit = event.evt.deltaMode === 1 ? 16 : 1;
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      cancelActiveCalibrationReferenceDrag();
      clearSnapFeedback();
      setFitModeState(false);
      const current = transformRef.current;
      commitTransform({
        ...current,
        panX: current.panX - event.evt.deltaX * unit,
        panY: current.panY - event.evt.deltaY * unit,
      });
      return;
    }
    const pointer = stagePointer(event);
    if (!pointer) return;
    const factor = Math.exp(-event.evt.deltaY * 0.001);
    const pending = pendingWheelZoomRef.current;
    pendingWheelZoomRef.current = {
      point: pointer,
      factor: (pending?.factor ?? 1) * factor,
    };
    if (wheelZoomFrameRef.current !== null) return;
    wheelZoomFrameRef.current = window.requestAnimationFrame(() => {
      wheelZoomFrameRef.current = null;
      const nextZoom = pendingWheelZoomRef.current;
      pendingWheelZoomRef.current = null;
      if (!nextZoom) return;
      if (page.measurements.length >= WHEEL_ZOOM_MIN_MEASUREMENTS) {
        const settled = transformRef.current;
        // Every measurement is mounted while the whole page is visible, so a bitmap of the
        // page group stays complete however far the gesture zooms.
        const pageVisible =
          bounds !== null &&
          settled.panX >= -1 &&
          settled.panY >= -1 &&
          settled.panX + bounds.width * settled.zoom <= viewerSize.width + 1 &&
          settled.panY + bounds.height * settled.zoom <= viewerSize.height + 1;
        wheelGestureActiveRef.current = true;
        setWheelGesture(
          (current) =>
            current ?? { transform: settled, cached: pageVisible, pageNumber: page.pageNumber },
        );
      }
      wheelFrameStartRef.current = performance.now();
      zoomAround(nextZoom.point, nextZoom.factor);
    });
  }

  const activeWheelGesture = wheelGesture?.pageNumber === page.pageNumber ? wheelGesture : null;
  const wheelBitmapCached = activeWheelGesture?.cached ?? false;
  const annotationsStatic = isPanning || wheelBitmapCached;
  const layerZoom = (activeWheelGesture?.transform ?? viewTransform).zoom;
  const cursor = isPanning
    ? "grabbing"
    : activeTool === "hand" || spacePan
      ? "grab"
      : activeTool === "select"
        ? "default"
        : crosshairCursor
          ? "crosshair"
          : "default";

  useLayoutEffect(() => {
    // Konva owns the actual native pointer boundary inside React's Stage wrapper.
    // Reapply after every commit so state changes that retain the cursor value
    // also update that boundary.
    stageRef.current?.getContent().style.setProperty("cursor", softwareCursor ? "none" : cursor);
  });

  const placementResolution = useMemo(() => {
    if (precisionAuthoringBlocked) return null;
    return resolveDrawingPreview({
      tool: activeTool,
      draft: workspaceDraft,
      rawPointerScreen: keyboardGeometry.cursor
        ? pageToScreen(keyboardGeometry.cursor, viewTransform)
        : placementPointer,
      transform: viewTransform,
      bounds,
      snapEnabled: snap,
      orthogonal,
      targets: snapTargets,
      spacePan,
      isPanning,
      calibrationReferenceEditActive: Boolean(calibrationReferenceEdit),
      measurementEditActive: Boolean(activeMeasurementEditId),
    });
  }, [
    activeMeasurementEditId,
    activeTool,
    bounds,
    calibrationReferenceEdit,
    isPanning,
    keyboardGeometry.cursor,
    orthogonal,
    placementPointer,
    precisionAuthoringBlocked,
    snap,
    snapTargets,
    spacePan,
    viewTransform,
    workspaceDraft,
  ]);
  const draftPreviewPointer =
    workspaceDraft?.type === "path" ? (placementResolution?.point ?? null) : draftPointer;
  const keyboardCursorPoint =
    keyboardGeometry.cursor && placementResolution
      ? placementResolution.point
      : keyboardGeometry.cursor;
  const closedDraftPreviewPoints = useMemo(
    () =>
      workspaceDraft?.type === "path" && measurementPathSpecs[workspaceDraft.measurementType].closed
        ? buildDraftPreviewPoints(workspaceDraft, draftPreviewPointer)
        : [],
    [draftPreviewPointer, workspaceDraft],
  );
  const boxDraftPreview = useMemo(() => {
    if (workspaceDraft?.type !== "path") return null;
    const type = workspaceDraft.measurementType;
    if (measurementPathSpecs[type].authoring !== "box") return null;
    const first = workspaceDraft.points[0];
    if (!first || !draftPreviewPointer) return null;
    const ring = boxFromCorners(first, draftPreviewPointer, shapeConstrain, bounds ?? undefined);
    return ring ? { type, ring, flat: pointsToFlat(ring) } : null;
  }, [bounds, draftPreviewPointer, shapeConstrain, workspaceDraft]);
  const cloudDraftPreviewFlat = useMemo(
    () =>
      workspaceDraft?.type === "path" &&
      workspaceDraft.measurementType === "cloud" &&
      closedDraftPreviewPoints.length >= 3
        ? pointsToFlat(closedDraftPreviewPoints)
        : null,
    [closedDraftPreviewPoints, workspaceDraft],
  );
  const confirmedDraftFlatPoints = useMemo(
    () => (workspaceDraft ? pointsToFlat(workspaceDraft.points) : []),
    [workspaceDraft],
  );
  const snapMarker = placementResolution?.snapMatch?.point ?? null;

  const candidatePageData =
    pageRenderData?.document === document &&
    pageRenderData.pageNumber === page.pageNumber &&
    annotationPreparationPage === pageRenderData &&
    pageRenderData !== canvasPageData
      ? pageRenderData
      : null;
  const candidateStageSlot = canvasPageData
    ? displayedStageSlot === 0
      ? 1
      : 0
    : displayedStageSlot;
  const canvasLayoutPageData = canvasPageData ?? pageRenderData;
  const canvasTransform = isPresentedTarget ? viewTransform : presentedState.transform;
  const pdfCanvasLayout = canvasLayoutPageData
    ? canvasLayout(canvasLayoutPageData.bounds, canvasTransform, devicePixelRatio)
    : null;
  const displayUnit = session?.settings.displayUnit ?? "m";
  const measurementDecimalPlaces = session?.settings.measurementDecimalPlaces ?? 2;
  const areaDisplay = session?.settings.areaDisplay ?? "auto";
  const showCalibration = session?.settings.showCalibration ?? false;
  const showLabels = session?.settings.showLabels ?? true;
  const labelClassificationDimensionId = session?.settings.labelClassificationDimensionId ?? null;
  const labelDimension =
    labelClassificationDimensionId === null
      ? null
      : (session?.classificationCatalog.dimensions.find(
          (dimension) => dimension.id === labelClassificationDimensionId,
        ) ?? null);

  const candidateVisualKey = useMemo(
    () => ({
      activeMeasurementEditId,
      activeTool,
      areaDisplay,
      calibrationReferenceEdit,
      candidatePageData,
      canvasInteractionTarget,
      canvasVisualRoles,
      displayUnit,
      isPanning,
      measurementDecimalPlaces,
      measurementEditingBlocked,
      page,
      precisionAuthoringBlocked,
      selectedMeasurementId,
      selectedMeasurementIds,
      showCalibration,
      showLabels,
      labelDimension,
      showMeasurements,
      spacePan,
      viewTransform,
      viewerWidth: viewerSize.width,
      viewerHeight: viewerSize.height,
    }),
    [
      activeMeasurementEditId,
      activeTool,
      areaDisplay,
      calibrationReferenceEdit,
      candidatePageData,
      canvasInteractionTarget,
      canvasVisualRoles,
      displayUnit,
      isPanning,
      measurementDecimalPlaces,
      measurementEditingBlocked,
      page,
      precisionAuthoringBlocked,
      selectedMeasurementId,
      selectedMeasurementIds,
      showCalibration,
      showLabels,
      labelDimension,
      showMeasurements,
      spacePan,
      viewTransform,
      viewerSize.width,
      viewerSize.height,
    ],
  );

  const stagePages: StagePage[] = [];
  if (canvasPageData) {
    stagePages.push({
      slot: displayedStageSlot,
      data: canvasPageData,
      page: isPresentedTarget ? page : presentedState.page,
      transform: isPresentedTarget ? viewTransform : presentedState.transform,
      presented: true,
    });
  }
  if (candidatePageData) {
    stagePages.push({
      slot: candidateStageSlot,
      data: candidatePageData,
      page,
      transform: viewTransform,
      presented: false,
    });
  }

  useLayoutEffect(() => {
    if (!isPresentedTarget) return;
    // Keep the annotations and transform paired with the retained PDF raster.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresentedState((current) =>
      current.page === page && current.transform === viewTransform
        ? current
        : { page, transform: viewTransform },
    );
  }, [isPresentedTarget, page, viewTransform]);

  useLayoutEffect(() => {
    if (!candidatePageData) return;
    const layer = candidateAnnotationLayerRef.current;
    if (!layer) return;
    // Lightweight Layer adapters used by non-browser renderers may not expose
    // Konva's draw lifecycle; keep those adapters on the synchronous fallback.
    if (typeof layer.on !== "function" || typeof layer.batchDraw !== "function") {
      layer.draw();
      setPreparedCandidate(candidateVisualKey);
      return;
    }
    // Stage.add draws its new Layer synchronously. Its onDraw prop is installed
    // before that draw, so a cached raster need not wait for another frame.
    if (drawnCandidateKeyRef.current !== candidateVisualKey) layer.batchDraw();
  }, [candidatePageData, candidateVisualKey]);

  const candidateDrawEvents = {
    onDraw: () => {
      drawnCandidateKeyRef.current = candidateVisualKey;
      // Konva emits draw after the scene and then draws the hit graph in the
      // same stack. The microtask cannot run until both canvases are complete.
      queueMicrotask(() => setPreparedCandidate(candidateVisualKey));
    },
  };

  useLayoutEffect(() => {
    if (!showPage || !readyRaster || displayedRaster === readyRaster) return;
    if (candidatePageData && preparedCandidate !== candidateVisualKey) return;
    const activePage = activePageRequestRef.current;
    if (activePage.document !== document || activePage.pageNumber !== page.pageNumber) return;
    // Annotations still waiting for their batched draw swap in with the raster.
    if (!candidatePageData && annotationLayerRef.current) flushBatchDraw(annotationLayerRef.current);
    const canvas = canvasRef.current;
    if (!canvas || !copyRasterToCanvas(readyRaster.canvas, canvas)) {
      setPageReady(false);
      setReadyRaster(null);
      setAnnotationPreparationPage(null);
      setError("The PDF canvas could not be created.");
      return;
    }
    setDisplayedRaster(readyRaster);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (candidatePageData) setDisplayedStageSlot(candidateStageSlot);
    setPresentedState({ page, transform: viewTransform });
  }, [
    candidatePageData,
    candidateStageSlot,
    candidateVisualKey,
    displayedRaster,
    document,
    page,
    preparedCandidate,
    readyRaster,
    setError,
    showPage,
    viewTransform,
  ]);

  const hasCanvasPage = canvasPageData !== null;
  useLayoutEffect(() => {
    // Fade a document's first raster and its annotations in together instead of popping them in.
    if (!hasCanvasPage) return;
    revealElements([canvasRef.current, stageRef.current?.getContent()]);
  }, [hasCanvasPage]);

  useLayoutEffect(() => {
    if (isPresentedTarget || !canvasPageData) return;
    // The retained page has no pointer input during navigation. Release its
    // stage-sized hit bitmap before mounting the next page's candidate Stage.
    annotationLayerRef.current?.drawHit?.();
  }, [canvasPageData, isPresentedTarget]);

  useLayoutEffect(() => {
    const previousCache = cachedPanGroupRef.current;
    if (previousCache) {
      previousCache.clearCache();
      cachedPanGroupRef.current = null;
    }

    const group = pageGroupRef.current;
    if (annotationsStatic && isPresentedTarget && bounds && group) {
      const pixelRatio = panCachePixelRatio(bounds, layerZoom, devicePixelRatio);
      if (pixelRatio !== null) {
        try {
          // Capture after React has updated the pan-specific handles and hit state.
          group.cache({
            x: 0,
            y: 0,
            width: bounds.width,
            height: bounds.height,
            pixelRatio,
          });
          cachedPanGroupRef.current = group;
        } catch {
          // A browser may reject a canvas even within the pixel budget.
          group.clearCache();
        }
      }
    }

    if (previousCache || completedPanRef.current) {
      // Restore the scene and hit graph before the next pointer interaction.
      annotationLayerRef.current?.draw();
    }
    completedPanRef.current = false;
  }, [
    activeMeasurementEditId,
    activeTool,
    areaDisplay,
    bounds,
    calibrationReferenceEdit,
    canvasInteractionTarget,
    canvasVisualRoles,
    devicePixelRatio,
    displayUnit,
    document,
    annotationsStatic,
    layerZoom,
    measurementDecimalPlaces,
    measurementEditingBlocked,
    page,
    precisionAuthoringBlocked,
    selectedMeasurementId,
    selectedMeasurementIds,
    showCalibration,
    showLabels,
    labelDimension,
    showMeasurements,
    isPresentedTarget,
    spacePan,
    viewerSize.width,
    viewerSize.height,
  ]);

  // The idle window starts after each zoom step has been rendered (this effect must stay after the
  // bitmap effect above), so a slow step (for example
  // building the bitmap on a slow CPU) cannot end the gesture before the next wheel event.
  useLayoutEffect(() => {
    if (!wheelGesture) return;
    if (wheelSettleTimerRef.current !== null) window.clearTimeout(wheelSettleTimerRef.current);
    // Slow steps (a busy or throttled CPU) delay the next wheel event by about as much.
    const started = wheelFrameStartRef.current;
    wheelFrameStartRef.current = null;
    const stepMs = started === null ? 0 : performance.now() - started;
    wheelSettleTimerRef.current = window.setTimeout(
      settleWheelZoom,
      Math.min(WHEEL_ZOOM_MAX_SETTLE_MS, Math.max(WHEEL_ZOOM_SETTLE_MS, stepMs * 2)),
    );
  }, [wheelGesture, viewTransform, settleWheelZoom]);

  useLayoutEffect(
    () => () => {
      cachedPanGroupRef.current?.clearCache();
      cachedPanGroupRef.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    // Snap feedback is viewer-local and must not survive interaction context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlacementPointer(null);
  }, [
    activeTool,
    activeMeasurementEditId,
    calibrationReferenceEdit,
    isPanning,
    page.pageNumber,
    spacePan,
    viewTransform.panX,
    viewTransform.panY,
    viewTransform.zoom,
    precisionAuthoringBlocked,
  ]);

  return (
    <div className={styles.viewerShell}>
      <div
        ref={viewerRef}
        className={styles.viewport}
        style={{ cursor: softwareCursor ? "none" : cursor }}
        role="region"
        tabIndex={0}
        data-dialog-focus-fallback
        aria-label={`PDF viewer, page ${page.pageNumber}. ${TOOL_SHORTCUT_HINT}`}
        aria-describedby={keyboardAuthoringEnabled ? keyboardHelpId : undefined}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          if (isInsideViewerPopover(event.currentTarget, event.relatedTarget)) return;
          cancelKeyboardGeometry();
        }}
        onPointerDownCapture={handleViewerPointerDown}
        onPointerEnter={softwareCursor ? updateSoftwareCursor : undefined}
        onPointerMoveCapture={softwareCursor ? updateSoftwareCursor : undefined}
        onPointerLeave={softwareCursor ? leaveSoftwareCursor : undefined}
        onPointerCancelCapture={softwareCursor ? leaveSoftwareCursor : undefined}
        onWheelCapture={handleViewerWheel}
      >
        <span id={keyboardHelpId} className={styles.keyboardHelp}>
          Enable keyboard drawing and editing in Settings. Arrow keys move the keyboard cursor;
          Shift moves faster and holding arrows accelerates. Space places a point or selects a
          measurement; Shift Space adds to the selection. Enter completes a path. E edits the
          selection; N or the edit selector chooses a vertex, arrows preview changes, Enter saves,
          and Escape cancels.
        </span>
        <span role="status" aria-live="polite" className={styles.keyboardHelp}>
          {keyboardGeometry.announcement}
          {keyboardGeometry.cursor && placementResolution?.snapMatch
            ? ` Snapped to X ${placementResolution.point.x.toFixed(2)}, Y ${placementResolution.point.y.toFixed(2)}.`
            : ""}
        </span>
        {keyboardCursorPoint && (
          <div
            className={styles.keyboardCursor}
            data-keyboard-cursor="true"
            aria-hidden="true"
            style={{
              left: pageToScreen(keyboardCursorPoint, viewTransform).x,
              top: pageToScreen(keyboardCursorPoint, viewTransform).y,
            }}
          />
        )}
        {keyboardAuthoringEnabled && (
          <KeyboardGeometryHelp
            helpRef={keyboardHelpRef}
            hidden={precisionAuthoringBlocked}
            referenceEditing={Boolean(calibrationReferenceEdit)}
            shapeTool={activeTool === "rectangle" || activeTool === "ellipse" ? activeTool : null}
            editing={keyboardGeometry.editing}
            measurement={keyboardGeometry.editableMeasurement}
            target={
              calibrationReferenceEdit
                ? keyboardGeometry.referenceTarget
                : keyboardGeometry.editTarget
            }
            onTargetChange={
              calibrationReferenceEdit
                ? keyboardGeometry.chooseReferenceTarget
                : keyboardGeometry.chooseEditTarget
            }
            onReturnToViewer={() => viewerRef.current?.focus({ preventScroll: true })}
          />
        )}
        {softwareCursor && (
          <div
            ref={softwareCursorRef}
            className={styles.softwareCursor}
            data-cursor={cursor}
            aria-hidden="true"
          >
            <img
              src={SOFTWARE_CURSORS[cursor].src}
              width={SOFTWARE_CURSORS[cursor].width}
              height={SOFTWARE_CURSORS[cursor].height}
              style={{
                marginLeft: -SOFTWARE_CURSORS[cursor].x,
                marginTop: -SOFTWARE_CURSORS[cursor].y,
              }}
              alt=""
              draggable={false}
            />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={styles.pdfCanvas}
          aria-label={`PDF page ${canvasPageData?.pageNumber ?? page.pageNumber}`}
          style={
            pdfCanvasLayout
              ? {
                  width: pdfCanvasLayout.cssWidth,
                  height: pdfCanvasLayout.cssHeight,
                  left: pdfCanvasLayout.left,
                  top: pdfCanvasLayout.top,
                  visibility: canvasPageData ? "visible" : "hidden",
                }
              : { visibility: "hidden" }
          }
        />
        {stagePages.map((stage) => (
          <Stage
            key={stage.slot}
            ref={stage.presented ? stageRef : candidateStageRef}
            width={viewerSize.width}
            height={viewerSize.height}
            className={styles.stage}
            style={{
              visibility: stage.presented ? "visible" : "hidden",
              pointerEvents: stage.presented && isPresentedTarget ? "auto" : "none",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleStageClick}
            onWheel={handleWheel}
          >
            <Layer
              ref={stage.presented ? annotationLayerRef : candidateAnnotationLayerRef}
              listening={stage.presented ? !annotationsStatic && isPresentedTarget : true}
              {...(stage.presented ? {} : candidateDrawEvents)}
            >
              <Group
                ref={stage.presented ? pageGroupRef : candidatePageGroupRef}
                x={stage.transform.panX}
                y={stage.transform.panY}
                scaleX={stage.transform.zoom}
                scaleY={stage.transform.zoom}
                clipX={0}
                clipY={0}
                clipWidth={stage.data.bounds.width}
                clipHeight={stage.data.bounds.height}
              >
                <Rect
                  name="page-background"
                  width={stage.data.bounds.width}
                  height={stage.data.bounds.height}
                  fill={canvasVisualRoles.pageHitRegionFill}
                />
                <PdfAnnotationLayer
                  page={
                    stage.presented && isPresentedTarget && keyboardGeometry.editing
                      ? keyboardGeometry.previewPage
                      : stage.page
                  }
                  bounds={stage.data.bounds}
                  transform={
                    stage.presented && activeWheelGesture
                      ? activeWheelGesture.transform
                      : stage.transform
                  }
                  cullTransform={
                    stage.presented && activeWheelGesture?.cached
                      ? activeWheelGesture.transform
                      : stage.transform
                  }
                  viewport={viewerSize}
                  activeTool={activeTool}
                  spacePan={spacePan}
                  isPanning={isPanning || (stage.presented && wheelBitmapCached)}
                  selectedMeasurementId={selectedMeasurementId}
                  selectedMeasurementIds={selectedMeasurementIds}
                  activeMeasurementEditId={activeMeasurementEditId}
                  calibrationReferenceEdit={calibrationReferenceEdit}
                  measurementEditingBlocked={measurementEditingBlocked || keyboardGeometry.editing}
                  precisionAuthoringAvailable={
                    !precisionAuthoringBlocked && authoringCapability.finePointer
                  }
                  visualRoles={canvasVisualRoles}
                  interactionTargetScreenPx={canvasInteractionTarget}
                  displayUnit={displayUnit}
                  areaDisplay={areaDisplay}
                  measurementDecimalPlaces={measurementDecimalPlaces}
                  showCalibration={showCalibration}
                  showMeasurements={showMeasurements}
                  showLabels={showLabels}
                  labelDimension={labelDimension}
                  onSelectMeasurement={selectMeasurement}
                  onCalibrationReferencePointsChange={onCalibrationReferencePointsChange}
                  onCalibrationReferenceDragCancellationChange={
                    registerCalibrationReferenceDragCancellation
                  }
                  onMeasurementEditActiveChange={onMeasurementEditActiveChange}
                  onWholeMeasurementDragCancellationChange={
                    registerWholeMeasurementDragCancellation
                  }
                  onVertexDragCancellationChange={registerVertexDragCancellation}
                />
              </Group>
            </Layer>
            {stage.presented && isPresentedTarget && (
              <Layer listening={false} visible={isPresentedTarget}>
                <Group
                  ref={draftPreviewGroupRef}
                  x={stage.transform.panX}
                  y={stage.transform.panY}
                  scaleX={stage.transform.zoom}
                  scaleY={stage.transform.zoom}
                  clipX={0}
                  clipY={0}
                  clipWidth={stage.data.bounds.width}
                  clipHeight={stage.data.bounds.height}
                >
                  {pageGrid !== "off" && (
                    <PageGridLines
                      grid={pageGrid}
                      zoom={viewTransform.zoom}
                      width={stage.data.bounds.width}
                      height={stage.data.bounds.height}
                    />
                  )}
                  {scaleCheckStore && (
                    <ScaleCheckLine
                      store={scaleCheckStore}
                      pageNumber={stage.data.pageNumber}
                      zoom={viewTransform.zoom}
                      stroke={canvasVisualRoles.calibrationStroke}
                    />
                  )}
                  {workspaceDraft?.type === "path" &&
                    measurementPathSpecs[workspaceDraft.measurementType].closed &&
                    closedDraftPreviewPoints.length >= 3 &&
                    !cloudDraftPreviewFlat && (
                      <Line
                        points={pointsToFlat(closedDraftPreviewPoints)}
                        closed
                        fill={scaleFillAlpha(canvasVisualRoles.drawingDraftFill, fillScale)}
                        strokeEnabled={false}
                        listening={false}
                      />
                    )}
                  {cloudDraftPreviewFlat && (
                    <Line
                      points={cloudDraftPreviewFlat}
                      closed
                      measurementType="cloud"
                      sceneFunc={drawMeasurementOutlineScene}
                      fill={withHexAlpha(
                        DEFAULT_CLOUD_COLOR,
                        scaledAlpha(CLOUD_FILL_OPACITY, fillScale),
                      )}
                      stroke={DEFAULT_CLOUD_COLOR}
                      strokeWidth={CANVAS_VISUAL_METRICS.draftStrokeScreenPx / viewTransform.zoom}
                      dash={CANVAS_VISUAL_METRICS.draftPreviewDashScreenPx.map(
                        (value) => value / viewTransform.zoom,
                      )}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                  )}
                  {boxDraftPreview && (
                    <Line
                      points={boxDraftPreview.flat}
                      closed
                      {...(boxDraftPreview.type === "ellipse"
                        ? { measurementType: "ellipse", sceneFunc: drawMeasurementOutlineScene }
                        : {})}
                      fill={scaleFillAlpha(canvasVisualRoles.drawingDraftFill, fillScale)}
                      stroke={canvasVisualRoles.drawingDraftStroke}
                      strokeWidth={CANVAS_VISUAL_METRICS.draftStrokeScreenPx / viewTransform.zoom}
                      dash={CANVAS_VISUAL_METRICS.draftPreviewDashScreenPx.map(
                        (value) => value / viewTransform.zoom,
                      )}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                  )}
                  {boxDraftPreview &&
                    (boxDraftPreview.type === "rectangle" ||
                      boxDraftPreview.type === "ellipse") && (
                      <BoxDraftGuides
                        ring={boxDraftPreview.ring}
                        type={boxDraftPreview.type}
                        zoom={viewTransform.zoom}
                        roles={canvasVisualRoles}
                        calibration={getActiveCalibration(page)}
                        displayUnit={displayUnit}
                        decimalPlaces={measurementDecimalPlaces}
                      />
                    )}
                  {workspaceDraft &&
                    workspaceDraft.points.length >= 2 &&
                    !cloudDraftPreviewFlat && (
                      <Line
                        points={confirmedDraftFlatPoints}
                        stroke={
                          workspaceDraft.type === "calibrate"
                            ? canvasVisualRoles.calibrationStroke
                            : canvasVisualRoles.drawingDraftStroke
                        }
                        strokeWidth={CANVAS_VISUAL_METRICS.draftStrokeScreenPx / viewTransform.zoom}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                      />
                    )}
                  {workspaceDraft &&
                    workspaceDraft.points.length >= 1 &&
                    !cloudDraftPreviewFlat &&
                    !boxDraftPreview &&
                    !(
                      workspaceDraft.type === "path" &&
                      measurementPathSpecs[workspaceDraft.measurementType].authoring === "box"
                    ) &&
                    draftPreviewPointer && (
                      <Line
                        points={pointsToFlat([workspaceDraft.points.at(-1)!, draftPreviewPointer])}
                        stroke={
                          workspaceDraft.type === "calibrate"
                            ? canvasVisualRoles.calibrationStroke
                            : canvasVisualRoles.drawingDraftStroke
                        }
                        strokeWidth={
                          CANVAS_VISUAL_METRICS.draftPreviewStrokeScreenPx / viewTransform.zoom
                        }
                        dash={CANVAS_VISUAL_METRICS.draftPreviewDashScreenPx.map(
                          (value) => value / viewTransform.zoom,
                        )}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                      />
                    )}
                  {liveLength &&
                    workspaceDraft?.type === "path" &&
                    LIVE_LENGTH_TYPES.has(workspaceDraft.measurementType) &&
                    draftPreviewPointer &&
                    workspaceDraft.points.length >= 1 && (
                      <LiveLengthLabel
                        from={workspaceDraft.points.at(-1)!}
                        to={draftPreviewPointer}
                        bounds={bounds}
                        zoom={viewTransform.zoom}
                        roles={canvasVisualRoles}
                        calibration={getActiveCalibration(page)}
                        displayUnit={displayUnit}
                        decimalPlaces={measurementDecimalPlaces}
                      />
                    )}
                  {workspaceDraft?.type === "path" &&
                    measurementPathSpecs[workspaceDraft.measurementType].closed &&
                    workspaceDraft.points.length >= 2 &&
                    !cloudDraftPreviewFlat &&
                    draftPreviewPointer &&
                    workspaceDraft.points[0] && (
                      <Line
                        points={pointsToFlat([draftPreviewPointer, workspaceDraft.points[0]])}
                        stroke={canvasVisualRoles.drawingDraftStroke}
                        strokeWidth={
                          CANVAS_VISUAL_METRICS.draftPreviewStrokeScreenPx / viewTransform.zoom
                        }
                        dash={CANVAS_VISUAL_METRICS.draftPreviewDashScreenPx.map(
                          (value) => value / viewTransform.zoom,
                        )}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                      />
                    )}
                  {workspaceDraft?.type === "path" &&
                    measurementPathSpecs[workspaceDraft.measurementType].closed &&
                    workspaceDraft.points[0] && (
                      <Circle
                        x={workspaceDraft.points[0].x}
                        y={workspaceDraft.points[0].y}
                        radius={handleRadiusScreenPx / viewTransform.zoom}
                        fill={canvasVisualRoles.handleFill}
                        stroke={canvasVisualRoles.handleStroke}
                        strokeWidth={
                          CANVAS_VISUAL_METRICS.handleStrokeScreenPx / viewTransform.zoom
                        }
                      />
                    )}
                  {workspaceDraft?.type === "path" && (
                    <DraftPointMarkers
                      points={workspaceDraft.points}
                      zoom={viewTransform.zoom}
                      fill={canvasVisualRoles.handleFill}
                      stroke={canvasVisualRoles.handleStroke}
                    />
                  )}
                  {snapMarker && (
                    <Rect
                      x={snapMarker.x}
                      y={snapMarker.y}
                      width={CANVAS_VISUAL_METRICS.snapMarkerSizeScreenPx / viewTransform.zoom}
                      height={CANVAS_VISUAL_METRICS.snapMarkerSizeScreenPx / viewTransform.zoom}
                      offsetX={
                        CANVAS_VISUAL_METRICS.snapMarkerSizeScreenPx / 2 / viewTransform.zoom
                      }
                      offsetY={
                        CANVAS_VISUAL_METRICS.snapMarkerSizeScreenPx / 2 / viewTransform.zoom
                      }
                      rotation={45}
                      fill={canvasVisualRoles.handleFill}
                      stroke={canvasVisualRoles.snapTarget}
                      strokeWidth={
                        CANVAS_VISUAL_METRICS.snapMarkerStrokeScreenPx / viewTransform.zoom
                      }
                      listening={false}
                    />
                  )}
                </Group>
              </Layer>
            )}
          </Stage>
        ))}
        {!canvasPageData && (
          <div className={styles.loading} role={pageLoadFailed ? "alert" : "status"}>
            {pageLoadFailed ? "Could not load this page." : "Rendering page…"}
          </div>
        )}
        {debugOverlay && <DebugOverlay getStats={getDebugStats} />}
      </div>
    </div>
  );
}
