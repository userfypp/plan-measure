import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
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
  fitToScreen,
  isPointInPage,
  logicalPageBoundsFromViewport,
  normalizeRotation,
  pdfRasterLayout,
  screenToPage,
  VIEWER_ZOOM_STEP,
  zoomViewAtPoint,
} from "../../utils/coordinates";
import { pdfRenderErrorMessage } from "../../services/pdf";
import {
  getGlobalViewerKeyboardAction,
  getViewerKeyboardAction,
  shouldIgnoreGlobalKeyboardShortcut,
  type ViewerKeyboardAction,
} from "../../utils/keyboard";
import { buildDraftPreviewPoints } from "./draftPreview";
import {
  createWholeMeasurementDragCancellationRegistry,
  registerWholeMeasurementDragEnvironmentCancellation,
  registerWholeMeasurementDragPointerReleaseCleanup,
} from "./measurementDrag";
import { createMeasurementVertexDragCancellationRegistry } from "./measurementVertexDrag";
import { PdfAnnotationLayer, type CalibrationReferenceEditPreview } from "./PdfAnnotationLayer";
import styles from "./PdfViewer.module.css";
import { LruRenderCache } from "./renderCache";
import { isPrimaryViewerClick, startsViewerPan } from "./navigation";
import {
  extractSnapTargets,
  isScreenPointInPage,
  isSnapPointPlacementActive,
  resolveDrawingPoint,
  resolveDrawingPreview,
} from "./snapping";
import { useViewerNavigationRegistration } from "./ViewerNavigation";

const PDF_RENDER_DEBOUNCE_MS = 90;

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
  calibrationReferenceLabel?: "X" | "Y";
  onCalibrationCancel: () => void;
  calibrationReferenceEdit: CalibrationReferenceEditPreview | null;
  measurementEditingBlocked: boolean;
  onCalibrationReferencePointsChange: (points: [Point, Point]) => void;
  onCalibrationReferenceEditCancel: () => void;
  onCalibrationReferenceEditSave: () => void;
}

function pointsToFlat(points: Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

interface LoadedPageData {
  document: PDFDocumentProxy;
  pageNumber: number;
  pdfPage: PDFPageProxy;
  bounds: LogicalPageBounds;
}

function copyRasterToCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement): boolean {
  target.width = source.width;
  target.height = source.height;
  const context = target.getContext("2d", { alpha: false });
  if (!context) return false;
  context.drawImage(source, 0, 0);
  return true;
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
  calibrationReferenceLabel,
  onCalibrationCancel,
  calibrationReferenceEdit,
  measurementEditingBlocked,
  onCalibrationReferencePointsChange,
  onCalibrationReferenceEditCancel,
  onCalibrationReferenceEditSave,
}: PdfViewerProps) {
  const { setError } = useAppState();
  const onNavigationChange = useViewerNavigationRegistration();
  const { session, addMeasurement } = useSessionState();
  const {
    activeTool,
    draft: workspaceDraft,
    orthogonal,
    snap,
    toggleOrthogonal,
    toggleSnap,
    chooseTool: chooseWorkspaceTool,
    selectedMeasurementId,
    selectMeasurement: selectWorkspaceMeasurement,
    clearSelection: clearWorkspaceSelection,
    startDraft,
    updateDraft,
    clearDraft,
    completeDraft,
  } = useWorkspaceState();
  const viewerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageGroupRef = useRef<Konva.Group>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const draftPointerFrameRef = useRef<number | null>(null);
  const pendingDraftPointerRef = useRef<{
    draft: DrawingDraft | null;
    measurementType: MeasurementType;
    rawPointerScreen: Point;
  } | null>(null);
  const wheelZoomFrameRef = useRef<number | null>(null);
  const pendingWheelZoomRef = useRef<{ point: Point; factor: number } | null>(null);
  const renderCacheRef = useRef(new LruRenderCache<HTMLCanvasElement>());
  const wholeMeasurementDragCancellationRegistryRef = useRef(
    createWholeMeasurementDragCancellationRegistry(),
  );
  const vertexDragCancellationRegistryRef = useRef(
    createMeasurementVertexDragCancellationRegistry(),
  );
  const activeMeasurementEditIdRef = useRef(activeMeasurementEditId);
  const cachedDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const renderRequestRef = useRef(0);
  const pageReadyRef = useRef(false);
  const [pageRenderData, setPageRenderData] = useState<LoadedPageData | null>(null);
  const [pageReady, setPageReady] = useState(false);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [devicePixelRatio, setDevicePixelRatio] = useState(() => window.devicePixelRatio || 1);
  const [transform, setTransform] = useState<ViewTransform>({ zoom: 1, panX: 0, panY: 0 });
  const transformRef = useRef<ViewTransform>(transform);
  const [fitMode, setFitMode] = useState(true);
  const [spacePan, setSpacePan] = useState(false);
  const [draftPointer, setDraftPointer] = useState<Point | null>(null);
  const [placementPointer, setPlacementPointer] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const suppressPanClickRef = useRef(false);
  const suppressPanClickTimerRef = useRef<number | null>(null);
  const panDragRef = useRef<{
    pointer: Point;
    transform: ViewTransform;
  } | null>(null);

  const clearSnapFeedback = useCallback(() => {
    pendingDraftPointerRef.current = null;
    setPlacementPointer(null);
  }, []);

  const registerWholeMeasurementDragCancellation = useCallback(
    (measurementId: string, cancel: (() => void) | null) => {
      wholeMeasurementDragCancellationRegistryRef.current.set(measurementId, cancel);
    },
    [],
  );

  const cancelActiveWholeMeasurementDrag = useCallback(() => {
    wholeMeasurementDragCancellationRegistryRef.current.cancelActive();
  }, []);

  const registerVertexDragCancellation = useCallback(
    (measurementId: string, owner: object, cancel: (() => void) | null) => {
      vertexDragCancellationRegistryRef.current.set(measurementId, owner, cancel);
    },
    [],
  );

  const cancelActiveVertexDrag = useCallback(() => {
    vertexDragCancellationRegistryRef.current.cancelActive();
  }, []);

  const clearActiveMeasurementEdit = useCallback(() => {
    const measurementId = activeMeasurementEditIdRef.current;
    if (measurementId) onMeasurementEditActiveChange(measurementId, false);
  }, [onMeasurementEditActiveChange]);
  const selectMeasurement = useCallback(
    (id: string) => {
      selectWorkspaceMeasurement(id);
      setError(null);
    },
    [selectWorkspaceMeasurement, setError],
  );
  const clearSelection = useCallback(() => {
    clearWorkspaceSelection();
    setError(null);
  }, [clearWorkspaceSelection, setError]);
  const completePath = useCallback(
    (measurementType: MeasurementType, points: Point[]) => {
      const id = crypto.randomUUID();
      const accepted = addMeasurement({
        pageNumber: page.pageNumber,
        id,
        measurementType,
        points,
      });
      if (!accepted) return;
      setDraftPointer(null);
      completeDraft();
      selectWorkspaceMeasurement(id);
    },
    [addMeasurement, completeDraft, page.pageNumber, selectWorkspaceMeasurement],
  );
  const activeToolRef = useRef(activeTool);
  const workspaceDraftRef = useRef(workspaceDraft);
  const clearDraftRef = useRef(clearDraft);
  const viewerSizeRef = useRef(viewerSize);
  const onCalibrationCancelRef = useRef(onCalibrationCancel);
  const onChooseToolRef = useRef(onChooseTool);
  const completePathRef = useRef(completePath);
  const calibrationReferenceEditRef = useRef(calibrationReferenceEdit);
  const onCalibrationReferenceEditCancelRef = useRef(onCalibrationReferenceEditCancel);

  useLayoutEffect(() => {
    activeToolRef.current = activeTool;
    workspaceDraftRef.current = workspaceDraft;
    clearDraftRef.current = clearDraft;
    viewerSizeRef.current = viewerSize;
    onCalibrationCancelRef.current = onCalibrationCancel;
    onChooseToolRef.current = onChooseTool;
    completePathRef.current = completePath;
    calibrationReferenceEditRef.current = calibrationReferenceEdit;
    onCalibrationReferenceEditCancelRef.current = onCalibrationReferenceEditCancel;
    activeMeasurementEditIdRef.current = activeMeasurementEditId;
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
  ]);

  const bounds = pageRenderData?.bounds ?? null;
  const showMeasurements = session?.settings.showMeasurements ?? false;
  const snapTargets = useMemo(
    () => extractSnapTargets(page.measurements, showMeasurements, bounds ?? undefined),
    [bounds, page.measurements, showMeasurements],
  );

  useLayoutEffect(
    () => () => {
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      clearActiveMeasurementEdit();
    },
    [
      cancelActiveVertexDrag,
      cancelActiveWholeMeasurementDrag,
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
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextSize = { width: entry.contentRect.width, height: entry.contentRect.height };
      setViewerSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
      );
      const nextPixelRatio = window.devicePixelRatio || 1;
      setDevicePixelRatio((current) => (current === nextPixelRatio ? current : nextPixelRatio));
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
    renderRequestRef.current += 1;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    if (cachedDocumentRef.current !== document) {
      renderCacheRef.current.clear();
      cachedDocumentRef.current = document;
    }
    // Keep the old canvas pixels detached from the new page until the new raster is ready.
    pageReadyRef.current = false;
    onPageBoundsChange(page.pageNumber, null);
    // This state transition hides a previous page immediately when the requested page changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageReady(false);
    // The loaded page data is replaced atomically by the async PDF.js result below.
    setPageRenderData(null);
    // A page navigation always returns to the page's fit transform.
    setFitMode(true);
    void document
      .getPage(page.pageNumber)
      .then((loadedPage) => {
        if (cancelled) return;
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
          setError(pdfRenderErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
      onPageBoundsChange(page.pageNumber, null);
      renderRequestRef.current += 1;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [document, onPageBoundsChange, page.pageNumber, setError]);

  useEffect(() => {
    if (!bounds || viewerSize.width <= 0 || viewerSize.height <= 0 || !fitMode) return;
    // The view transform intentionally follows ResizeObserver output while fit mode is active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    commitTransform(fitToScreen(bounds, viewerSize));
  }, [bounds, viewerSize, fitMode, commitTransform]);

  const viewTransform = useMemo(
    () =>
      bounds && viewerSize.width > 0 && viewerSize.height > 0 && fitMode
        ? fitToScreen(bounds, viewerSize)
        : transform,
    [bounds, fitMode, transform, viewerSize],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const loadedPage = pageRenderData;
    if (!canvas || !loadedPage || viewerSize.width <= 0 || viewerSize.height <= 0) return;

    const requestId = ++renderRequestRef.current;
    const layout = pdfRasterLayout(
      loadedPage.bounds,
      { zoom: viewTransform.zoom, panX: 0, panY: 0 },
      devicePixelRatio,
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
      const cachedRaster = renderCacheRef.current.get(cacheKey);
      if (cachedRaster) {
        if (!copyRasterToCanvas(cachedRaster, canvas)) {
          setError("The PDF canvas could not be created.");
          return;
        }
        pageReadyRef.current = true;
        setPageReady(true);
        return;
      }

      const rasterCanvas = window.document.createElement("canvas");
      rasterCanvas.width = layout.backingWidth;
      rasterCanvas.height = layout.backingHeight;
      const context = rasterCanvas.getContext("2d", { alpha: false });
      if (!context) {
        setError("The PDF canvas could not be created.");
        return;
      }
      const renderViewport = loadedPage.pdfPage.getViewport({
        scale: layout.rasterScale,
        rotation: loadedPage.bounds.rotation,
      });
      const renderTask = loadedPage.pdfPage.render({
        canvas: rasterCanvas,
        canvasContext: context,
        viewport: renderViewport,
      });
      renderTaskRef.current = renderTask;
      void renderTask.promise
        .then(() => {
          if (requestId !== renderRequestRef.current) return;
          renderTaskRef.current = null;
          renderCacheRef.current.set(
            cacheKey,
            rasterCanvas,
            layout.backingWidth * layout.backingHeight,
          );
          if (!copyRasterToCanvas(rasterCanvas, canvas)) {
            setError("The PDF canvas could not be created.");
            return;
          }
          pageReadyRef.current = true;
          setPageReady(true);
        })
        .catch((error: unknown) => {
          if (requestId !== renderRequestRef.current) return;
          renderTaskRef.current = null;
          const message = pdfRenderErrorMessage(error);
          if (message) setError(message);
        });
    };

    const timer = pageReadyRef.current ? window.setTimeout(render, PDF_RENDER_DEBOUNCE_MS) : null;
    if (timer === null) render();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (requestId === renderRequestRef.current) {
        renderRequestRef.current += 1;
        renderTaskRef.current?.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [devicePixelRatio, pageRenderData, setError, viewTransform.zoom, viewerSize]);

  useEffect(
    () => () => {
      renderRequestRef.current += 1;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      renderCacheRef.current.clear();
      if (draftPointerFrameRef.current !== null) {
        window.cancelAnimationFrame(draftPointerFrameRef.current);
      }
      if (wheelZoomFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelZoomFrameRef.current);
      }
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
      clearSnapFeedback();
      setFitMode(false);
      const next = zoomViewAtPoint(
        transformRef.current,
        screenPoint,
        transformRef.current.zoom * factor,
      );
      commitTransform(next);
    },
    [cancelActiveVertexDrag, cancelActiveWholeMeasurementDrag, clearSnapFeedback, commitTransform],
  );

  const fitPage = useCallback(() => {
    if (!bounds) return;
    cancelActiveWholeMeasurementDrag();
    cancelActiveVertexDrag();
    clearSnapFeedback();
    setFitMode(true);
    commitTransform(fitToScreen(bounds, viewerSize));
  }, [
    bounds,
    viewerSize,
    cancelActiveWholeMeasurementDrag,
    cancelActiveVertexDrag,
    clearSnapFeedback,
    commitTransform,
  ]);

  const changePage = useCallback(
    (pageNumber: number) => {
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      clearSnapFeedback();
      onPageChange(pageNumber);
    },
    [cancelActiveVertexDrag, cancelActiveWholeMeasurementDrag, clearSnapFeedback, onPageChange],
  );

  useLayoutEffect(() => {
    onViewZoomChange(page.pageNumber, viewTransform.zoom);
    onNavigationChange?.({
      pageNumber: page.pageNumber,
      pageCount: session?.pageCount ?? 1,
      zoom: viewTransform.zoom,
      onPageChange: changePage,
      onZoomOut: () =>
        zoomAround({ x: viewerSize.width / 2, y: viewerSize.height / 2 }, 1 / VIEWER_ZOOM_STEP),
      onZoomIn: () =>
        zoomAround({ x: viewerSize.width / 2, y: viewerSize.height / 2 }, VIEWER_ZOOM_STEP),
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
    viewerSize,
    zoomAround,
  ]);

  const focusViewerSurface = useCallback((target: EventTarget | null) => {
    if (shouldIgnoreGlobalKeyboardShortcut(target)) return;
    viewerRef.current?.focus({ preventScroll: true });
  }, []);

  const handleViewerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // A new pointer ownership attempt invalidates any older prepared/active
      // vertex gesture before Konva can reuse a stale `ready` drag element.
      cancelActiveVertexDrag();
      focusViewerSurface(event.target);
    },
    [cancelActiveVertexDrag, focusViewerSurface],
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
        const size = viewerSizeRef.current;
        zoomAround(
          { x: size.width / 2, y: size.height / 2 },
          action === "zoom-in" ? VIEWER_ZOOM_STEP : 1 / VIEWER_ZOOM_STEP,
        );
      } else if (action === "cancel-calibration") {
        clearDraftRef.current();
        onCalibrationCancelRef.current();
      } else if (action === "complete-path") {
        const draft = workspaceDraftRef.current;
        if (draft?.type === "path") {
          completePathRef.current(draft.measurementType, draft.points);
        }
      } else if (action === "cancel-draft") {
        clearDraftRef.current();
      } else if (action === "exit-tool") {
        onChooseToolRef.current("select");
      } else if (action === "toggle-orthogonal") {
        toggleOrthogonal();
      } else if (action === "toggle-snap") {
        toggleSnap();
      } else {
        onChooseToolRef.current(action.tool);
      }
    },
    [clearSnapFeedback, toggleOrthogonal, toggleSnap, zoomAround],
  );

  const finishPan = useCallback(() => {
    const completedPan = panDragRef.current !== null;
    panDragRef.current = null;
    if (completedPan) {
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

  const releaseSpacePan = useCallback(() => {
    if (panDragRef.current) setTransform(transformRef.current);
    setSpacePan(false);
  }, []);

  const handleViewerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && calibrationReferenceEditRef.current) {
        event.preventDefault();
        onCalibrationReferenceEditCancelRef.current();
        return;
      }
      const action = getViewerKeyboardAction(
        event.nativeEvent,
        activeToolRef.current,
        workspaceDraftRef.current,
      );
      if (!action) return;
      if (
        event.repeat &&
        (action === "toggle-orthogonal" || action === "toggle-snap" || typeof action === "object")
      )
        return;

      event.preventDefault();
      if (typeof action === "object" && action.tool === activeToolRef.current) return;
      executeKeyboardAction(action);
    },
    [executeKeyboardAction],
  );

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      const action = getGlobalViewerKeyboardAction(event);
      if (!action) return;
      if (typeof action === "object" && action.tool === activeToolRef.current) return;
      event.preventDefault();
      executeKeyboardAction(action);
    }
    function handleGlobalKeyUp(event: KeyboardEvent) {
      if (event.key === " ") releaseSpacePan();
    }
    function cancelMeasurementEditForEnvironmentLoss() {
      cancelActiveWholeMeasurementDrag();
      cancelActiveVertexDrag();
      clearActiveMeasurementEdit();
      clearSnapFeedback();
      releaseSpacePan();
      finishPan();
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
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
      },
    });
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
      unregisterEnvironmentCancellation();
      unregisterPointerReleaseCleanup();
    };
  }, [
    cancelActiveWholeMeasurementDrag,
    cancelActiveVertexDrag,
    clearActiveMeasurementEdit,
    clearSnapFeedback,
    executeKeyboardAction,
    finishPan,
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
    clearSnapFeedback();
    const pointer = stagePointer(event);
    if (!pointer) return;
    event.evt.preventDefault();
    suppressPanClickRef.current = true;
    panDragRef.current = { pointer, transform: transformRef.current };
    setFitMode(false);
    setIsPanning(true);
  }

  function applyTransientPan(next: ViewTransform) {
    transformRef.current = next;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.left = `${next.panX}px`;
      canvas.style.top = `${next.panY}px`;
    }
    const group = pageGroupRef.current;
    if (group) {
      group.position({ x: next.panX, y: next.panY });
      group.getLayer()?.batchDraw();
    }
  }

  function queueDraftPointerUpdate(
    draft: DrawingDraft | null,
    measurementType: MeasurementType,
    rawPointerScreen: Point,
  ) {
    pendingDraftPointerRef.current = {
      draft,
      measurementType,
      rawPointerScreen,
    };
    if (draftPointerFrameRef.current !== null) return;
    draftPointerFrameRef.current = window.requestAnimationFrame(() => {
      draftPointerFrameRef.current = null;
      const pending = pendingDraftPointerRef.current;
      pendingDraftPointerRef.current = null;
      if (!pending) return;
      if (workspaceDraftRef.current !== pending.draft) return;
      if (activeToolRef.current !== pending.measurementType) return;
      setPlacementPointer(pending.rawPointerScreen);
    });
  }

  function handleMouseMove(event: KonvaEventObject<MouseEvent>) {
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
    if (activeTool === "calibrate") {
      clearSnapFeedback();
      if (workspaceDraft?.type !== "calibrate") return;
      const pagePoint = screenToPage(pointer, viewTransform);
      if (isPointInPage(pagePoint, bounds)) setDraftPointer(pagePoint);
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
    const draft =
      workspaceDraft?.type === "path" && workspaceDraft.measurementType === activeTool
        ? workspaceDraft
        : null;
    queueDraftPointerUpdate(draft, activeTool, pointer);
  }

  function handleMouseUp() {
    finishPan();
  }

  function handleMouseLeave() {
    clearSnapFeedback();
    finishPan();
  }

  function handleStageClick(event: KonvaEventObject<MouseEvent>) {
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
    const pointer = stagePointer(event);
    if (!pointer) return;
    const draft = workspaceDraft;

    const point = screenToPage(pointer, viewTransform);

    if (activeTool === "calibrate") {
      if (!isPointInPage(point, bounds)) {
        clearSnapFeedback();
        return;
      }
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
      if (resolution.closesPolygon) {
        if (pathDraft.points.length >= spec.minVertices) {
          completePath(measurementType, pathDraft.points);
        }
        return;
      }
      const last = pathDraft.points.at(-1);
      const effectivePoint = resolution.point;
      if (last && areEffectivelyIdentical(last, effectivePoint)) return;
      if (spec.maxVertices === 2) {
        completePath(measurementType, [...pathDraft.points, effectivePoint]);
        return;
      }
      updateDraft({ ...pathDraft, points: [...pathDraft.points, effectivePoint] });
    }
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
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
      if (nextZoom) zoomAround(nextZoom.point, nextZoom.factor);
    });
  }

  const cursorClass = isPanning
    ? styles.cursorGrabbing
    : activeTool === "hand" || spacePan
      ? styles.cursorGrab
      : activeTool === "select"
        ? styles.cursorDefault
        : styles.cursorCrosshair;

  const placementResolution = useMemo(() => {
    return resolveDrawingPreview({
      tool: activeTool,
      draft: workspaceDraft,
      rawPointerScreen: placementPointer,
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
    orthogonal,
    placementPointer,
    snap,
    snapTargets,
    spacePan,
    viewTransform,
    workspaceDraft,
  ]);
  const draftPoints = useMemo(
    () =>
      buildDraftPreviewPoints(
        workspaceDraft,
        workspaceDraft?.type === "path" ? (placementResolution?.point ?? null) : draftPointer,
      ),
    [draftPointer, placementResolution, workspaceDraft],
  );
  const snapMarker = placementResolution?.snapMatch?.point ?? null;

  const showPage = Boolean(
    pageReady &&
    pageRenderData?.document === document &&
    pageRenderData.pageNumber === page.pageNumber &&
    bounds &&
    viewerSize.width > 0 &&
    viewerSize.height > 0,
  );
  const pdfCanvasLayout = bounds ? canvasLayout(bounds, viewTransform, devicePixelRatio) : null;
  const displayUnit = session?.settings.displayUnit ?? "m";
  const showCalibration = session?.settings.showCalibration ?? false;
  const showLabels = session?.settings.showLabels ?? true;

  useLayoutEffect(() => {
    pendingDraftPointerRef.current = null;
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
    workspaceDraft,
  ]);

  return (
    <div className={styles.viewerShell}>
      <div
        ref={viewerRef}
        className={`${styles.viewport} ${cursorClass}`}
        role="region"
        tabIndex={0}
        data-dialog-focus-fallback
        aria-label={`PDF viewer, page ${page.pageNumber}. Use V, H, L, M, or P to select a tool.`}
        onPointerDownCapture={handleViewerPointerDown}
        onWheelCapture={handleViewerWheel}
        onKeyDown={handleViewerKeyDown}
      >
        <canvas
          ref={canvasRef}
          className={styles.pdfCanvas}
          aria-label={`PDF page ${page.pageNumber}`}
          style={
            pdfCanvasLayout
              ? {
                  width: pdfCanvasLayout.cssWidth,
                  height: pdfCanvasLayout.cssHeight,
                  left: pdfCanvasLayout.left,
                  top: pdfCanvasLayout.top,
                  visibility: showPage ? "visible" : "hidden",
                }
              : { visibility: "hidden" }
          }
        />
        {showPage && bounds && viewerSize.width > 0 && viewerSize.height > 0 && (
          <Stage
            width={viewerSize.width}
            height={viewerSize.height}
            className={styles.stage}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleStageClick}
            onWheel={handleWheel}
          >
            <Layer>
              <Group
                ref={pageGroupRef}
                x={viewTransform.panX}
                y={viewTransform.panY}
                scaleX={viewTransform.zoom}
                scaleY={viewTransform.zoom}
                clipX={0}
                clipY={0}
                clipWidth={bounds.width}
                clipHeight={bounds.height}
              >
                <Rect
                  name="page-background"
                  width={bounds.width}
                  height={bounds.height}
                  fill="rgba(255,255,255,0.001)"
                />
                <PdfAnnotationLayer
                  page={page}
                  bounds={bounds}
                  transform={viewTransform}
                  activeTool={activeTool}
                  spacePan={spacePan}
                  isPanning={isPanning}
                  selectedMeasurementId={selectedMeasurementId}
                  activeMeasurementEditId={activeMeasurementEditId}
                  calibrationReferenceEdit={calibrationReferenceEdit}
                  measurementEditingBlocked={measurementEditingBlocked}
                  displayUnit={displayUnit}
                  showCalibration={showCalibration}
                  showMeasurements={showMeasurements}
                  showLabels={showLabels}
                  onSelectMeasurement={selectMeasurement}
                  onCalibrationReferencePointsChange={onCalibrationReferencePointsChange}
                  onMeasurementEditActiveChange={onMeasurementEditActiveChange}
                  onWholeMeasurementDragCancellationChange={
                    registerWholeMeasurementDragCancellation
                  }
                  onVertexDragCancellationChange={registerVertexDragCancellation}
                />
                {workspaceDraft && draftPoints.length >= 2 && (
                  <Line
                    points={pointsToFlat(draftPoints)}
                    stroke={workspaceDraft.type === "calibrate" ? "#d97706" : "#2563eb"}
                    strokeWidth={2 / viewTransform.zoom}
                    dash={[7 / viewTransform.zoom, 5 / viewTransform.zoom]}
                    lineJoin="round"
                  />
                )}
                {workspaceDraft?.type === "path" &&
                  measurementPathSpecs[workspaceDraft.measurementType].closed &&
                  workspaceDraft.points[0] && (
                    <Circle
                      x={workspaceDraft.points[0].x}
                      y={workspaceDraft.points[0].y}
                      radius={7 / viewTransform.zoom}
                      fill="#fff"
                      stroke="#2563eb"
                      strokeWidth={3 / viewTransform.zoom}
                    />
                  )}
                {snapMarker && (
                  <Rect
                    x={snapMarker.x}
                    y={snapMarker.y}
                    width={5 / viewTransform.zoom}
                    height={5 / viewTransform.zoom}
                    offsetX={2.5 / viewTransform.zoom}
                    offsetY={2.5 / viewTransform.zoom}
                    rotation={45}
                    fill="rgba(255,255,255,0.9)"
                    stroke="#2563eb"
                    strokeWidth={1.25 / viewTransform.zoom}
                    listening={false}
                  />
                )}
              </Group>
            </Layer>
          </Stage>
        )}
        {!showPage && <div className={styles.loading}>Rendering page…</div>}
        {calibrationReferenceEdit && (
          <div className={styles.drawingStatus}>
            <span>
              Editing{" "}
              {calibrationReferenceEdit.reference === "uniform"
                ? "scale reference"
                : `${calibrationReferenceEdit.reference.toUpperCase()} reference`}
              {calibrationReferenceEdit.valid
                ? " · Preview updates linked measurements"
                : " · Points must remain a valid reference before saving"}
            </span>
            <button type="button" onClick={onCalibrationReferenceEditCancel}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!calibrationReferenceEdit.valid}
              onClick={onCalibrationReferenceEditSave}
            >
              Save
            </button>
          </div>
        )}
        {workspaceDraft?.type === "path" && workspaceDraft.measurementType !== "line" && (
          <div className={styles.drawingStatus}>
            <span>
              {workspaceDraft.points.length} vertices ·{" "}
              {workspaceDraft.measurementType === "polygon"
                ? "Click the first point or press Enter to finish"
                : "Press Enter to finish"}
            </span>
            <button type="button" onClick={clearDraft}>
              Cancel
            </button>
          </div>
        )}
        {activeTool === "calibrate" && workspaceDraft?.type !== "path" && (
          <div className={styles.drawingStatus}>
            <span>
              Select two points for the{" "}
              {calibrationReferenceLabel
                ? `${calibrationReferenceLabel} reference`
                : "scale reference"}
            </span>
            <button type="button" onClick={onCalibrationCancel}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
