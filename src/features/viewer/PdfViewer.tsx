import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
} from "react";
import { Text as KonvaTextNode } from "konva/lib/shapes/Text";
import { Circle, Group, Label, Layer, Line, Rect, Stage, Tag, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useAppState, type AppAction } from "../../app/state";
import type {
  LinearUnit,
  LogicalPageBounds,
  Measurement,
  PageState,
  Point,
  ViewTransform,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { areEffectivelyIdentical, distance } from "../../utils/geometry";
import { formatMeasurement } from "../../utils/format";
import {
  canvasLayout,
  clampPointToPage,
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
import { getDrawingKeyboardAction, shouldIgnoreGlobalKeyboardShortcut } from "../../utils/keyboard";
import {
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelWithinBounds,
  type LabelDimensions,
} from "../../utils/labelLayout";
import styles from "./PdfViewer.module.css";
import { LruRenderCache } from "./renderCache";

const PDF_RENDER_DEBOUNCE_MS = 90;
const LABEL_PADDING_SCREEN_PX = 4;
const MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX = 12;
const CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX = 11;

interface PdfViewerProps {
  document: PDFDocumentProxy;
  page: PageState;
  onPageChange: (pageNumber: number) => void;
  onCalibrationCandidate: (points: [Point, Point]) => void;
  calibrationReferenceLabel?: "X" | "Y";
  onCalibrationCancel: () => void;
  onVertexDragStateChange: (dragging: boolean) => void;
}

function pointsToFlat(points: Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function averagePoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function measureLabelText(text: string, fontSizeScreenPx: number, zoom: number): LabelDimensions {
  const textNode = new KonvaTextNode({
    text,
    fontSize: fontSizeScreenPx / zoom,
    padding: LABEL_PADDING_SCREEN_PX / zoom,
  });
  return { width: textNode.width(), height: textNode.height() };
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
  onCalibrationCandidate,
  calibrationReferenceLabel,
  onCalibrationCancel,
  onVertexDragStateChange,
}: PdfViewerProps) {
  const { state, dispatch } = useAppState();
  const viewerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageGroupRef = useRef<Konva.Group>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const draftPointerFrameRef = useRef<number | null>(null);
  const pendingDraftPointerRef = useRef<{
    draftType: "calibrate" | "line" | "polygon";
    point: Point;
  } | null>(null);
  const wheelZoomFrameRef = useRef<number | null>(null);
  const pendingWheelZoomRef = useRef<{ point: Point; factor: number } | null>(null);
  const renderCacheRef = useRef(new LruRenderCache<HTMLCanvasElement>());
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
  const [isPanning, setIsPanning] = useState(false);
  const panDragRef = useRef<{
    pointer: Point;
    transform: ViewTransform;
  } | null>(null);
  const completePolygon = useCallback(
    (points: Point[]) => {
      dispatch({
        type: "ADD_POLYGON",
        pageNumber: page.pageNumber,
        id: crypto.randomUUID(),
        points,
      });
    },
    [dispatch, page.pageNumber],
  );
  const stateRef = useRef(state);
  const viewerSizeRef = useRef(viewerSize);
  const onCalibrationCancelRef = useRef(onCalibrationCancel);
  const completePolygonRef = useRef(completePolygon);

  useLayoutEffect(() => {
    stateRef.current = state;
    viewerSizeRef.current = viewerSize;
    onCalibrationCancelRef.current = onCalibrationCancel;
    completePolygonRef.current = completePolygon;
  }, [completePolygon, onCalibrationCancel, state, viewerSize]);

  const bounds = pageRenderData?.bounds ?? null;

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
        setPageRenderData({
          document,
          pageNumber: page.pageNumber,
          pdfPage: loadedPage,
          bounds: logicalPageBoundsFromViewport(logicalViewport),
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({ type: "SET_ERROR", message: pdfRenderErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
      renderRequestRef.current += 1;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [dispatch, document, page.pageNumber]);

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
          dispatch({ type: "SET_ERROR", message: "The PDF canvas could not be created." });
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
        dispatch({ type: "SET_ERROR", message: "The PDF canvas could not be created." });
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
            dispatch({ type: "SET_ERROR", message: "The PDF canvas could not be created." });
            return;
          }
          pageReadyRef.current = true;
          setPageReady(true);
        })
        .catch((error: unknown) => {
          if (requestId !== renderRequestRef.current) return;
          renderTaskRef.current = null;
          const message = pdfRenderErrorMessage(error);
          if (message) dispatch({ type: "SET_ERROR", message });
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
  }, [devicePixelRatio, dispatch, pageRenderData, viewTransform.zoom, viewerSize]);

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
    },
    [],
  );

  const zoomAround = useCallback(
    (screenPoint: Point, factor: number) => {
      setFitMode(false);
      const next = zoomViewAtPoint(
        transformRef.current,
        screenPoint,
        transformRef.current.zoom * factor,
      );
      commitTransform(next);
    },
    [commitTransform],
  );

  const fitPage = useCallback(() => {
    if (!bounds) return;
    setFitMode(true);
    commitTransform(fitToScreen(bounds, viewerSize));
  }, [bounds, viewerSize, commitTransform]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (shouldIgnoreGlobalKeyboardShortcut(event.target)) return;
      const currentState = stateRef.current;
      if (event.key === " ") {
        event.preventDefault();
        setSpacePan(true);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        const size = viewerSizeRef.current;
        zoomAround({ x: size.width / 2, y: size.height / 2 }, VIEWER_ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        const size = viewerSizeRef.current;
        zoomAround({ x: size.width / 2, y: size.height / 2 }, 1 / VIEWER_ZOOM_STEP);
      } else {
        const action = getDrawingKeyboardAction(event.key, currentState.tool, currentState.draft);
        if (action === "cancel-calibration") {
          event.preventDefault();
          dispatch({ type: "SET_DRAFT", draft: null });
          onCalibrationCancelRef.current();
        } else if (action === "complete-polygon") {
          event.preventDefault();
          const draft = currentState.draft;
          if (draft?.type === "polygon" && draft.points.length >= 3) {
            completePolygonRef.current(draft.points);
          }
        } else if (action === "cancel-draft") {
          event.preventDefault();
          dispatch({ type: "SET_DRAFT", draft: null });
        } else if (action === "exit-tool") {
          event.preventDefault();
          dispatch({ type: "SET_TOOL", tool: "select" });
        }
      }
    }
    function keyUp(event: KeyboardEvent) {
      if (event.key === " ") {
        if (panDragRef.current) setTransform(transformRef.current);
        setSpacePan(false);
      }
    }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [dispatch, zoomAround]);

  function stagePointer(event: KonvaEventObject<MouseEvent | WheelEvent>): Point | null {
    const pointer = event.target.getStage()?.getPointerPosition();
    return pointer ? { x: pointer.x, y: pointer.y } : null;
  }

  function handleMouseDown(event: KonvaEventObject<MouseEvent>) {
    viewerRef.current?.focus();
    if (state.tool !== "hand" && !spacePan) return;
    const pointer = stagePointer(event);
    if (!pointer) return;
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

  function queueDraftPointerUpdate(draftType: "calibrate" | "line" | "polygon", point: Point) {
    pendingDraftPointerRef.current = { draftType, point };
    if (draftPointerFrameRef.current !== null) return;
    draftPointerFrameRef.current = window.requestAnimationFrame(() => {
      draftPointerFrameRef.current = null;
      const pending = pendingDraftPointerRef.current;
      pendingDraftPointerRef.current = null;
      if (!pending) return;
      dispatch({
        type: "UPDATE_DRAFT_POINTER",
        draftType: pending.draftType,
        pointer: pending.point,
      });
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
    if (!bounds || !state.draft) return;
    const pagePoint = screenToPage(pointer, transformRef.current);
    if (!isPointInPage(pagePoint, bounds)) return;
    queueDraftPointerUpdate(state.draft.type, pagePoint);
  }

  function handleMouseUp() {
    const completedPan = panDragRef.current !== null;
    panDragRef.current = null;
    if (completedPan) setTransform(transformRef.current);
    setIsPanning(false);
  }

  function handleStageClick(event: KonvaEventObject<MouseEvent>) {
    if (!bounds || state.tool === "select" || state.tool === "hand" || spacePan) {
      if (
        (event.target === event.target.getStage() || event.target.name() === "page-background") &&
        state.tool === "select"
      ) {
        dispatch({ type: "SELECT_MEASUREMENT", id: null });
      }
      return;
    }
    const pointer = stagePointer(event);
    if (!pointer) return;
    const point = screenToPage(pointer, transformRef.current);
    if (!isPointInPage(point, bounds)) return;
    const draft = state.draft;

    if (state.tool === "calibrate") {
      if (!draft || draft.type !== "calibrate" || draft.points.length === 0) {
        dispatch({
          type: "SET_DRAFT",
          draft: { type: "calibrate", points: [point], pointer: point },
        });
        return;
      }
      const first = draft.points[0]!;
      if (areEffectivelyIdentical(first, point)) {
        dispatch({ type: "SET_ERROR", message: "Choose two distinct calibration points." });
        return;
      }
      dispatch({ type: "SET_DRAFT", draft: null });
      dispatch({ type: "SET_TOOL", tool: "select" });
      onCalibrationCandidate([first, point]);
      return;
    }

    if (state.tool === "line") {
      if (!draft || draft.type !== "line" || draft.points.length === 0) {
        dispatch({ type: "SET_DRAFT", draft: { type: "line", points: [point], pointer: point } });
        return;
      }
      const first = draft.points[0]!;
      if (areEffectivelyIdentical(first, point)) {
        dispatch({ type: "SET_ERROR", message: "Choose a different second endpoint." });
        return;
      }
      dispatch({
        type: "ADD_LINE",
        pageNumber: page.pageNumber,
        id: crypto.randomUUID(),
        points: [first, point],
      });
      return;
    }

    if (state.tool === "polygon") {
      if (!draft || draft.type !== "polygon") {
        dispatch({
          type: "SET_DRAFT",
          draft: { type: "polygon", points: [point], pointer: point },
        });
        return;
      }
      const first = draft.points[0];
      if (first && distance(first, point) * transformRef.current.zoom <= 10) {
        if (draft.points.length >= 3) completePolygon(draft.points);
        return;
      }
      const last = draft.points.at(-1);
      if (last && areEffectivelyIdentical(last, point)) return;
      dispatch({
        type: "SET_DRAFT",
        draft: { ...draft, points: [...draft.points, point], pointer: point },
      });
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
    : state.tool === "hand" || spacePan
      ? styles.cursorGrab
      : state.tool === "select"
        ? styles.cursorDefault
        : styles.cursorCrosshair;

  const draftPoints = useMemo(() => {
    if (!state.draft) return [];
    return state.draft.pointer ? [...state.draft.points, state.draft.pointer] : state.draft.points;
  }, [state.draft]);

  const showPage = Boolean(
    pageReady &&
    pageRenderData?.document === document &&
    pageRenderData.pageNumber === page.pageNumber &&
    bounds &&
    viewerSize.width > 0 &&
    viewerSize.height > 0,
  );
  const pdfCanvasLayout = bounds ? canvasLayout(bounds, viewTransform, devicePixelRatio) : null;

  return (
    <div className={styles.viewerShell}>
      <div ref={viewerRef} className={`${styles.viewport} ${cursorClass}`} tabIndex={-1}>
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
            onMouseLeave={handleMouseUp}
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
                {state.session?.settings.showCalibration &&
                  page.calibrations.flatMap((calibration) => {
                    const active = calibration.id === page.activeCalibrationId;
                    const stroke = active ? "#d97706" : "#52606d";
                    const references =
                      calibration.mode === "uniform"
                        ? [{ key: "uniform", label: calibration.name, ...calibration }]
                        : [
                            {
                              key: "x",
                              label: `${calibration.name} · X`,
                              ...calibration.xReference,
                            },
                            {
                              key: "y",
                              label: `${calibration.name} · Y`,
                              ...calibration.yReference,
                            },
                          ];
                    return references.map((reference) => {
                      const labelPoint = {
                        x: (reference.start.x + reference.end.x) / 2,
                        y: (reference.start.y + reference.end.y) / 2,
                      };
                      const labelDimensions = measureLabelText(
                        reference.label,
                        CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX,
                        viewTransform.zoom,
                      );
                      const labelPlacement = placeLabelWithinBounds(
                        labelPoint,
                        labelDimensions,
                        bounds,
                        viewTransform.zoom,
                        LABEL_EDGE_MARGIN_SCREEN_PX,
                      );
                      return (
                        <Group
                          key={`${calibration.id}-${reference.key}`}
                          listening={false}
                          opacity={active ? 1 : 0.72}
                        >
                          <Line
                            points={pointsToFlat([reference.start, reference.end])}
                            stroke={stroke}
                            strokeWidth={(active ? 3 : 2) / viewTransform.zoom}
                            dash={[8 / viewTransform.zoom, 5 / viewTransform.zoom]}
                          />
                          {[reference.start, reference.end].map((point, index) => (
                            <Circle
                              key={`${calibration.id}-${index}`}
                              x={point.x}
                              y={point.y}
                              radius={4 / viewTransform.zoom}
                              fill="#fff"
                              stroke={stroke}
                              strokeWidth={(active ? 2 : 1.5) / viewTransform.zoom}
                            />
                          ))}
                          <Label x={labelPlacement.x} y={labelPlacement.y}>
                            <Tag fill="rgba(15,23,42,0.88)" cornerRadius={3 / viewTransform.zoom} />
                            <Text
                              text={reference.label}
                              fill="#fff"
                              fontSize={CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX / viewTransform.zoom}
                              padding={LABEL_PADDING_SCREEN_PX / viewTransform.zoom}
                            />
                          </Label>
                        </Group>
                      );
                    });
                  })}
                {state.session?.settings.showMeasurements &&
                  page.measurements.map((measurement) => (
                    <MeasurementShape
                      key={measurement.id}
                      measurement={measurement}
                      bounds={bounds}
                      zoom={viewTransform.zoom}
                      transform={viewTransform}
                      selected={state.selectedMeasurementId === measurement.id}
                      editable={state.tool === "select" && !spacePan && !isPanning}
                      showLabel={state.session?.settings.showLabels ?? true}
                      page={page}
                      displayUnit={state.session?.settings.displayUnit ?? "m"}
                      pageNumber={page.pageNumber}
                      dispatch={dispatch}
                      onVertexDragStateChange={onVertexDragStateChange}
                    />
                  ))}
                {state.draft && draftPoints.length >= 2 && (
                  <Line
                    points={pointsToFlat(draftPoints)}
                    stroke={state.draft.type === "calibrate" ? "#d97706" : "#2563eb"}
                    strokeWidth={2 / viewTransform.zoom}
                    dash={[7 / viewTransform.zoom, 5 / viewTransform.zoom]}
                    lineJoin="round"
                  />
                )}
                {state.draft?.type === "polygon" && state.draft.points[0] && (
                  <Circle
                    x={state.draft.points[0].x}
                    y={state.draft.points[0].y}
                    radius={7 / viewTransform.zoom}
                    fill="#fff"
                    stroke="#2563eb"
                    strokeWidth={3 / viewTransform.zoom}
                  />
                )}
              </Group>
            </Layer>
          </Stage>
        )}
        {!showPage && <div className={styles.loading}>Rendering page…</div>}
        {state.draft?.type === "polygon" && (
          <div className={styles.drawingStatus}>
            <span>{state.draft.points.length} vertices · Click the first point to finish</span>
            <button type="button" onClick={() => dispatch({ type: "SET_DRAFT", draft: null })}>
              Cancel
            </button>
          </div>
        )}
        {state.tool === "calibrate" && state.draft?.type !== "polygon" && (
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
      <nav className={styles.navigation} aria-label="PDF page and zoom controls">
        <button
          type="button"
          onClick={() => onPageChange(page.pageNumber - 1)}
          disabled={page.pageNumber <= 1}
        >
          Previous
        </button>
        <span>
          Page {page.pageNumber} of {state.session?.pageCount ?? 1}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page.pageNumber + 1)}
          disabled={page.pageNumber >= (state.session?.pageCount ?? 1)}
        >
          Next
        </button>
        <span className={styles.separator} />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() =>
            zoomAround({ x: viewerSize.width / 2, y: viewerSize.height / 2 }, 1 / VIEWER_ZOOM_STEP)
          }
        >
          −
        </button>
        <span className={styles.zoomValue}>{Math.round(viewTransform.zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() =>
            zoomAround({ x: viewerSize.width / 2, y: viewerSize.height / 2 }, VIEWER_ZOOM_STEP)
          }
        >
          +
        </button>
        <button type="button" onClick={fitPage}>
          Fit to screen
        </button>
      </nav>
    </div>
  );
}

interface MeasurementShapeProps {
  measurement: Measurement;
  pageNumber: number;
  page: PageState;
  displayUnit: LinearUnit;
  bounds: LogicalPageBounds;
  zoom: number;
  transform: ViewTransform;
  selected: boolean;
  editable: boolean;
  showLabel: boolean;
  dispatch: Dispatch<AppAction>;
  onVertexDragStateChange: (dragging: boolean) => void;
}

const MeasurementShape = memo(function MeasurementShape({
  measurement,
  pageNumber,
  page,
  displayUnit,
  bounds,
  zoom,
  transform,
  selected,
  editable,
  showLabel,
  dispatch,
  onVertexDragStateChange,
}: MeasurementShapeProps) {
  const vertexFrameRef = useRef<number | null>(null);
  const pendingVertexPointsRef = useRef<Point[] | null>(null);
  const dragPointsRef = useRef<Point[] | null>(null);
  const finalDragPointsRef = useRef<Point[] | null>(null);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);
  const stroke = selected ? "#c2410c" : "#2563eb";
  const visibleMeasurement = useMemo<Measurement>(() => {
    if (!dragPoints) return measurement;
    if (measurement.type === "line") {
      return {
        ...measurement,
        points: [dragPoints[0] ?? measurement.points[0], dragPoints[1] ?? measurement.points[1]],
      };
    }
    return { ...measurement, points: dragPoints };
  }, [dragPoints, measurement]);
  const calibration = getMeasurementCalibration(page, visibleMeasurement);
  const flatPoints = useMemo(
    () => pointsToFlat(visibleMeasurement.points),
    [visibleMeasurement.points],
  );
  const labelPoint = useMemo(
    () =>
      visibleMeasurement.type === "line"
        ? {
            x: (visibleMeasurement.points[0].x + visibleMeasurement.points[1].x) / 2,
            y: (visibleMeasurement.points[0].y + visibleMeasurement.points[1].y) / 2,
          }
        : averagePoint(visibleMeasurement.points),
    [visibleMeasurement],
  );
  const labelText = useMemo(
    () => (calibration ? formatMeasurement(visibleMeasurement, calibration, displayUnit) : null),
    [calibration, displayUnit, visibleMeasurement],
  );
  const labelDimensions = useMemo(
    () =>
      labelText ? measureLabelText(labelText, MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX, zoom) : null,
    [labelText, zoom],
  );
  const labelPlacement = useMemo(
    () =>
      labelDimensions
        ? placeLabelWithinBounds(
            labelPoint,
            labelDimensions,
            bounds,
            zoom,
            LABEL_EDGE_MARGIN_SCREEN_PX,
          )
        : null,
    [bounds, labelDimensions, labelPoint, zoom],
  );

  useEffect(() => {
    const finalPoints = finalDragPointsRef.current;
    if (!finalPoints || measurement.points.length !== finalPoints.length) return;
    if (
      measurement.points.some(
        (point, index) => point.x !== finalPoints[index]?.x || point.y !== finalPoints[index]?.y,
      )
    ) {
      return;
    }
    finalDragPointsRef.current = null;
    dragPointsRef.current = null;
    // Keep the final local frame until the reducer has published those exact points.
    setDragPoints(null);
  }, [measurement.points]);

  useEffect(
    () => () => {
      if (vertexFrameRef.current !== null) {
        window.cancelAnimationFrame(vertexFrameRef.current);
      }
      pendingVertexPointsRef.current = null;
      dragPointsRef.current = null;
      finalDragPointsRef.current = null;
      onVertexDragStateChange(false);
    },
    [onVertexDragStateChange],
  );

  function pointsWithVertex(index: number, point: Point): Point[] {
    const sourcePoints = dragPointsRef.current ?? measurement.points;
    return sourcePoints.map((existing, pointIndex) => (pointIndex === index ? point : existing));
  }

  function updateDragPoints(points: Point[]) {
    dragPointsRef.current = points;
    setDragPoints(points);
  }

  function pointFromDragEvent(event: KonvaEventObject<MouseEvent>): Point {
    const pointer = event.target.getStage()?.getPointerPosition();
    const rawPoint = pointer
      ? screenToPage({ x: pointer.x, y: pointer.y }, transform)
      : { x: event.target.x(), y: event.target.y() };
    return clampPointToPage(rawPoint, bounds);
  }

  function dispatchVertexPoints(points: Point[]) {
    dispatch({
      type: "UPDATE_MEASUREMENT_POINTS",
      pageNumber,
      id: measurement.id,
      points,
    });
  }

  function queueVertexPoints(points: Point[]) {
    pendingVertexPointsRef.current = points;
    if (vertexFrameRef.current !== null) return;
    vertexFrameRef.current = window.requestAnimationFrame(() => {
      vertexFrameRef.current = null;
      const pending = pendingVertexPointsRef.current;
      pendingVertexPointsRef.current = null;
      if (pending) dispatchVertexPoints(pending);
    });
  }

  function select(event: KonvaEventObject<MouseEvent>) {
    if (!editable) return;
    event.cancelBubble = true;
    dispatch({ type: "SELECT_MEASUREMENT", id: measurement.id });
  }

  return (
    <Group>
      {measurement.type === "line" ? (
        <Line
          points={flatPoints}
          stroke={stroke}
          strokeWidth={(selected ? 3 : 2) / zoom}
          hitStrokeWidth={12 / zoom}
          onClick={select}
        />
      ) : (
        <Line
          points={flatPoints}
          closed
          fill={selected ? "rgba(194,65,12,0.13)" : "rgba(37,99,235,0.10)"}
          stroke={stroke}
          strokeWidth={(selected ? 3 : 2) / zoom}
          hitStrokeWidth={12 / zoom}
          lineJoin="round"
          onClick={select}
        />
      )}
      {showLabel && labelText && labelPlacement && (
        <Label x={labelPlacement.x} y={labelPlacement.y} listening={false}>
          <Tag fill="rgba(15,23,42,0.88)" cornerRadius={3 / zoom} />
          <Text
            text={labelText}
            fill="#fff"
            fontSize={MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX / zoom}
            padding={LABEL_PADDING_SCREEN_PX / zoom}
          />
        </Label>
      )}
      {selected &&
        editable &&
        visibleMeasurement.points.map((point, index) => (
          <Circle
            key={index}
            x={point.x}
            y={point.y}
            radius={6 / zoom}
            fill="#fff"
            stroke="#c2410c"
            strokeWidth={2 / zoom}
            hitStrokeWidth={10 / zoom}
            draggable
            onDragStart={(event) => {
              finalDragPointsRef.current = null;
              dragPointsRef.current = null;
              const startPoint = pointFromDragEvent(event);
              event.target.position(startPoint);
              updateDragPoints(pointsWithVertex(index, startPoint));
              onVertexDragStateChange(true);
            }}
            onDragMove={(event) => {
              const nextPoint = pointFromDragEvent(event);
              event.target.position(nextPoint);
              const nextPoints = pointsWithVertex(index, nextPoint);
              updateDragPoints(nextPoints);
              queueVertexPoints(nextPoints);
            }}
            onDragEnd={(event) => {
              const finalPoint = pointFromDragEvent(event);
              event.target.position(finalPoint);
              if (vertexFrameRef.current !== null) {
                window.cancelAnimationFrame(vertexFrameRef.current);
                vertexFrameRef.current = null;
              }
              pendingVertexPointsRef.current = null;
              const finalPoints = pointsWithVertex(index, finalPoint);
              finalDragPointsRef.current = finalPoints;
              updateDragPoints(finalPoints);
              dispatchVertexPoints(finalPoints);
              onVertexDragStateChange(false);
            }}
          />
        ))}
    </Group>
  );
});
