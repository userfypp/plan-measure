import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { Circle, Group, Label, Layer, Line, Rect, Stage, Tag, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useAppState, type AppAction } from "../../app/state";
import type {
  Calibration,
  LinearUnit,
  LogicalPageBounds,
  Measurement,
  PageState,
  Point,
  ViewTransform,
} from "../../types/domain";
import { areEffectivelyIdentical, distance } from "../../utils/geometry";
import { formatMeasurement } from "../../utils/format";
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
import styles from "./PdfViewer.module.css";

const PDF_RENDER_DEBOUNCE_MS = 90;

interface PdfViewerProps {
  document: PDFDocumentProxy;
  page: PageState;
  onPageChange: (pageNumber: number) => void;
  onCalibrationCandidate: (points: [Point, Point]) => void;
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

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches("input, textarea, select, [contenteditable='true']") ||
    Boolean(target.closest("dialog"))
  );
}

export function PdfViewer({
  document,
  page,
  onPageChange,
  onCalibrationCandidate,
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
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const [bounds, setBounds] = useState<LogicalPageBounds | null>(null);
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
    void document
      .getPage(page.pageNumber)
      .then((loadedPage) => {
        if (cancelled) return;
        const rotation = normalizeRotation(loadedPage.rotate);
        const logicalViewport = loadedPage.getViewport({ scale: 1, rotation });
        setPdfPage(loadedPage);
        setBounds(logicalPageBoundsFromViewport(logicalViewport));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({ type: "SET_ERROR", message: pdfRenderErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, document, page.pageNumber]);

  useEffect(() => {
    if (!bounds || viewerSize.width <= 0 || viewerSize.height <= 0 || !fitMode) return;
    // The view transform intentionally follows ResizeObserver output while fit mode is active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    commitTransform(fitToScreen(bounds, viewerSize));
  }, [bounds, viewerSize, fitMode, commitTransform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfPage || !bounds) return;
    const requestedTransform = { zoom: transform.zoom, panX: 0, panY: 0 };
    const timer = window.setTimeout(() => {
      renderTaskRef.current?.cancel();
      const layout = pdfRasterLayout(bounds, requestedTransform, devicePixelRatio);
      const renderViewport = pdfPage.getViewport({
        scale: layout.rasterScale,
        rotation: bounds.rotation,
      });
      canvas.width = layout.backingWidth;
      canvas.height = layout.backingHeight;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        dispatch({ type: "SET_ERROR", message: "The PDF canvas could not be created." });
        return;
      }
      const renderTask = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport: renderViewport,
      });
      renderTaskRef.current = renderTask;
      void renderTask.promise.catch((error: unknown) => {
        const message = pdfRenderErrorMessage(error);
        if (message) dispatch({ type: "SET_ERROR", message });
      });
    }, PDF_RENDER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [bounds, devicePixelRatio, dispatch, pdfPage, transform.zoom]);

  useEffect(
    () => () => {
      renderTaskRef.current?.cancel();
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
      if (editableTarget(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        setSpacePan(true);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomAround({ x: viewerSize.width / 2, y: viewerSize.height / 2 }, VIEWER_ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomAround({ x: viewerSize.width / 2, y: viewerSize.height / 2 }, 1 / VIEWER_ZOOM_STEP);
      } else if (event.key === "Escape" && state.draft) {
        event.preventDefault();
        dispatch({ type: "SET_DRAFT", draft: null });
        dispatch({ type: "SET_TOOL", tool: "select" });
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
  }, [dispatch, state.draft, viewerSize, zoomAround]);

  function stagePointer(event: KonvaEventObject<MouseEvent | WheelEvent>): Point | null {
    const pointer = event.target.getStage()?.getPointerPosition();
    return pointer ? { x: pointer.x, y: pointer.y } : null;
  }

  function handleMouseDown(event: KonvaEventObject<MouseEvent>) {
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

  function completePolygon(points: Point[]) {
    dispatch({
      type: "ADD_POLYGON",
      pageNumber: page.pageNumber,
      id: crypto.randomUUID(),
      points,
    });
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

  const pdfCanvasLayout = bounds ? canvasLayout(bounds, transform, devicePixelRatio) : null;

  return (
    <div className={styles.viewerShell}>
      <div ref={viewerRef} className={`${styles.viewport} ${cursorClass}`}>
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
                }
              : undefined
          }
        />
        {bounds && viewerSize.width > 0 && viewerSize.height > 0 && (
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
                x={transform.panX}
                y={transform.panY}
                scaleX={transform.zoom}
                scaleY={transform.zoom}
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
                {state.session?.settings.showCalibration && page.calibration && (
                  <>
                    <Line
                      points={pointsToFlat([page.calibration.start, page.calibration.end])}
                      stroke="#d97706"
                      strokeWidth={2 / transform.zoom}
                      dash={[8 / transform.zoom, 5 / transform.zoom]}
                    />
                    {[page.calibration.start, page.calibration.end].map((point, index) => (
                      <Circle
                        key={index}
                        x={point.x}
                        y={point.y}
                        radius={4 / transform.zoom}
                        fill="#fff"
                        stroke="#d97706"
                        strokeWidth={2 / transform.zoom}
                      />
                    ))}
                  </>
                )}
                {state.session?.settings.showMeasurements &&
                  page.measurements.map((measurement) => (
                    <MeasurementShape
                      key={measurement.id}
                      measurement={measurement}
                      bounds={bounds}
                      zoom={transform.zoom}
                      selected={state.selectedMeasurementId === measurement.id}
                      editable={state.tool === "select" && !spacePan && !isPanning}
                      showLabel={state.session?.settings.showLabels ?? true}
                      calibration={page.calibration}
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
                    strokeWidth={2 / transform.zoom}
                    dash={[7 / transform.zoom, 5 / transform.zoom]}
                    lineJoin="round"
                  />
                )}
                {state.draft?.type === "polygon" && state.draft.points[0] && (
                  <Circle
                    x={state.draft.points[0].x}
                    y={state.draft.points[0].y}
                    radius={7 / transform.zoom}
                    fill="#fff"
                    stroke="#2563eb"
                    strokeWidth={3 / transform.zoom}
                  />
                )}
              </Group>
            </Layer>
          </Stage>
        )}
        {!pdfPage && <div className={styles.loading}>Rendering page…</div>}
        {state.draft?.type === "polygon" && (
          <div className={styles.drawingStatus}>
            <span>{state.draft.points.length} vertices · Click the first point to finish</span>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "SET_DRAFT", draft: null });
                dispatch({ type: "SET_TOOL", tool: "select" });
              }}
            >
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
        <span className={styles.zoomValue}>{Math.round(transform.zoom * 100)}%</span>
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
  calibration: Calibration | null;
  displayUnit: LinearUnit;
  bounds: LogicalPageBounds;
  zoom: number;
  selected: boolean;
  editable: boolean;
  showLabel: boolean;
  dispatch: Dispatch<AppAction>;
  onVertexDragStateChange: (dragging: boolean) => void;
}

const MeasurementShape = memo(function MeasurementShape({
  measurement,
  pageNumber,
  calibration,
  displayUnit,
  bounds,
  zoom,
  selected,
  editable,
  showLabel,
  dispatch,
  onVertexDragStateChange,
}: MeasurementShapeProps) {
  const vertexFrameRef = useRef<number | null>(null);
  const pendingVertexPointsRef = useRef<Point[] | null>(null);
  const stroke = selected ? "#c2410c" : "#2563eb";
  const flatPoints = useMemo(() => pointsToFlat(measurement.points), [measurement.points]);
  const labelPoint = useMemo(
    () =>
      measurement.type === "line"
        ? {
            x: (measurement.points[0].x + measurement.points[1].x) / 2,
            y: (measurement.points[0].y + measurement.points[1].y) / 2,
          }
        : averagePoint(measurement.points),
    [measurement],
  );
  const labelText = useMemo(
    () => (calibration ? formatMeasurement(measurement, calibration, displayUnit) : null),
    [calibration, displayUnit, measurement],
  );

  useEffect(
    () => () => {
      if (vertexFrameRef.current !== null) {
        window.cancelAnimationFrame(vertexFrameRef.current);
      }
    },
    [],
  );

  function pointsWithVertex(index: number, point: Point): Point[] {
    return measurement.points.map((existing, pointIndex) =>
      pointIndex === index ? point : existing,
    );
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
      {showLabel && labelText && (
        <Label x={labelPoint.x} y={labelPoint.y} listening={false} offsetY={20 / zoom}>
          <Tag fill="rgba(15,23,42,0.88)" cornerRadius={3 / zoom} />
          <Text text={labelText} fill="#fff" fontSize={12 / zoom} padding={4 / zoom} />
        </Label>
      )}
      {selected &&
        editable &&
        measurement.points.map((point, index) => (
          <Circle
            key={index}
            x={point.x}
            y={point.y}
            radius={6 / zoom}
            fill="#fff"
            stroke="#c2410c"
            strokeWidth={2 / zoom}
            draggable
            onDragStart={() => onVertexDragStateChange(true)}
            onDragMove={(event) => {
              const nextPoint = {
                x: Math.min(bounds.width, Math.max(0, event.target.x())),
                y: Math.min(bounds.height, Math.max(0, event.target.y())),
              };
              event.target.position(nextPoint);
              queueVertexPoints(pointsWithVertex(index, nextPoint));
            }}
            onDragEnd={(event) => {
              const finalPoint = {
                x: Math.min(bounds.width, Math.max(0, event.target.x())),
                y: Math.min(bounds.height, Math.max(0, event.target.y())),
              };
              if (vertexFrameRef.current !== null) {
                window.cancelAnimationFrame(vertexFrameRef.current);
                vertexFrameRef.current = null;
              }
              pendingVertexPointsRef.current = null;
              dispatchVertexPoints(pointsWithVertex(index, finalPoint));
              onVertexDragStateChange(false);
            }}
          />
        ))}
    </Group>
  );
});
