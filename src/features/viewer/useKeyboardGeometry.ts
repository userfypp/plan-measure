import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type {
  DrawingDraft,
  LogicalPageBounds,
  PageState,
  Point,
  Tool,
  ViewTransform,
} from "../../types/domain";
import { clampPointToPage, pageToScreen, screenToPage } from "../../utils/coordinates";
import { hasValidMeasurementPoints, isMeasurementType } from "../../utils/geometry";
import {
  keyboardEditPreview,
  keyboardHitMeasurement,
  moveKeyboardCursor,
  type KeyboardMeasurement,
} from "./keyboardGeometry";
import type { SnapTarget } from "./snapping";
import type { CalibrationReferenceEditPreview } from "./PdfAnnotationLayer";

interface KeyboardEdit {
  sourcePage: PageState["measurements"];
  selected: string;
  transform: ViewTransform;
  bounds: LogicalPageBounds;
  original: KeyboardMeasurement[];
  base: KeyboardMeasurement[];
  vertex: number;
  origin: Point;
  rawPoint: Point;
}

interface KeyboardGeometryOptions {
  document: object;
  page: PageState;
  bounds: LogicalPageBounds | null;
  transform: ViewTransform;
  screenCenter: Point;
  tool: Tool;
  draft: DrawingDraft | null;
  selectedIds: readonly string[];
  disabled: boolean;
  editingBlocked: boolean;
  showMeasurements: boolean;
  snap: boolean;
  orthogonal: boolean;
  targets: readonly SnapTarget[];
  referenceEdit: CalibrationReferenceEditPreview | null;
  onReferenceChange: (points: [Point, Point]) => void;
  onReferenceSave: () => void;
  onReferenceCancel: () => void;
  placePoint: (point: Point) => void;
  previewPoint: (point: Point, transform: ViewTransform) => void;
  revealPoint?: (point: Point) => ViewTransform;
  select: (id: string, additive?: boolean) => void;
  cancelPointerEdit: () => void;
  commit: (commands: { pageNumber: number; id: string; points: Point[] }[]) => boolean;
  reportError: (message: string) => void;
}

export function useKeyboardGeometry(options: KeyboardGeometryOptions) {
  const {
    document,
    page,
    bounds,
    transform,
    tool,
    selectedIds,
    disabled,
    editingBlocked,
    snap,
    orthogonal,
    targets,
  } = options;
  const [cursor, setCursor] = useState<Point | null>(null);
  const cursorRef = useRef<Point | null>(null);
  const [edit, setEdit] = useState<KeyboardEdit | null>(null);
  const editRef = useRef<KeyboardEdit | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const referenceVertexRef = useRef(0);
  const [referenceTarget, setReferenceTarget] = useState(0);
  const movementRef = useRef({ key: "", fast: false, repeats: 0 });
  const selectedKey = selectedIds.join("\u0000");

  const updateCursor = (point: Point) => {
    cursorRef.current = point;
    setCursor(point);
    setAnnouncement(`Cursor X ${point.x.toFixed(2)}, Y ${point.y.toFixed(2)}.`);
  };
  const updateEdit = (next: KeyboardEdit | null) => {
    editRef.current = next;
    setEdit(next);
  };
  const cancel = useCallback(() => {
    movementRef.current = { key: "", fast: false, repeats: 0 };
    cursorRef.current = null;
    editRef.current = null;
    setCursor(null);
    setEdit(null);
  }, []);

  useLayoutEffect(() => {
    // Keyboard previews have the same navigation/environment ownership boundary as pointer drags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cancel();
  }, [cancel, document, page.pageNumber, tool, disabled]);

  useLayoutEffect(() => {
    const current = editRef.current;
    if (
      current &&
      (current.sourcePage !== page.measurements ||
        current.selected !== selectedKey ||
        current.transform.zoom !== transform.zoom ||
        current.transform.panX !== transform.panX ||
        current.transform.panY !== transform.panY ||
        current.bounds.width !== bounds?.width ||
        current.bounds.height !== bounds?.height ||
        editingBlocked ||
        options.referenceEdit ||
        !options.showMeasurements)
    ) {
      cancel();
    }
  }, [
    bounds,
    cancel,
    editingBlocked,
    options.referenceEdit,
    options.showMeasurements,
    page.measurements,
    selectedKey,
    transform,
  ]);

  const preview =
    edit && bounds
      ? keyboardEditPreview({
          measurements: edit.base,
          vertex: edit.vertex,
          origin: edit.origin,
          rawPoint: edit.rawPoint,
          bounds,
          zoom: transform.zoom,
          snap,
          orthogonal,
          targets,
        })
      : null;
  const previewPage = preview
    ? {
        ...page,
        measurements: page.measurements.map(
          (measurement) => preview.find(({ id }) => id === measurement.id) ?? measurement,
        ),
      }
    : page;

  function startEditing() {
    if (editingBlocked || !options.showMeasurements || tool !== "select" || !bounds) return false;
    const measurements = page.measurements.filter(
      ({ id, visible }) => selectedIds.includes(id) && visible,
    );
    if (measurements.length === 0 || measurements.length !== selectedIds.length) {
      options.reportError(
        "Select visible measurements on this page before editing with the keyboard.",
      );
      return false;
    }
    const origin = measurements[0]!.points[0]!;
    options.cancelPointerEdit();
    const visibleTransform = options.revealPoint?.(origin) ?? transform;
    updateEdit({
      sourcePage: page.measurements,
      selected: selectedKey,
      transform: visibleTransform,
      bounds,
      original: measurements,
      base: measurements,
      vertex: -1,
      origin,
      rawPoint: origin,
    });
    updateCursor(origin);
    setAnnouncement(
      "Moving selection. Arrows preview the move; Enter saves; Escape cancels. Brackets choose a vertex for a single measurement.",
    );
    return true;
  }

  function chooseEditTarget(vertex: number) {
    const currentEdit = editRef.current;
    if (!currentEdit || currentEdit.base.length !== 1 || !bounds || disabled) return;
    movementRef.current = { key: "", fast: false, repeats: 0 };
    const working = keyboardEditPreview({
      measurements: currentEdit.base,
      vertex: currentEdit.vertex,
      origin: currentEdit.origin,
      rawPoint: currentEdit.rawPoint,
      bounds,
      zoom: transform.zoom,
      snap,
      orthogonal,
      targets,
    });
    const count = working[0]!.points.length;
    if (!Number.isInteger(vertex) || vertex < -1 || vertex >= count) return;
    const origin = working[0]!.points[vertex < 0 ? 0 : vertex]!;
    const visibleTransform = options.revealPoint?.(origin) ?? transform;
    updateEdit({
      ...currentEdit,
      transform: visibleTransform,
      base: working,
      vertex,
      origin,
      rawPoint: origin,
    });
    updateCursor(origin);
    setAnnouncement(
      vertex < 0 ? "Moving whole measurement." : `Editing vertex ${vertex + 1} of ${count}.`,
    );
  }

  function chooseReferenceTarget(vertex: number) {
    if (disabled || !options.referenceEdit || (vertex !== 0 && vertex !== 1)) return;
    referenceVertexRef.current = vertex;
    setReferenceTarget(vertex);
    const point = options.referenceEdit.points[vertex]!;
    updateCursor(point);
    options.revealPoint?.(point);
  }

  function movementPoint(point: Point, event: KeyboardEvent) {
    const previous = movementRef.current;
    const repeats =
      event.repeat && previous.key === event.key && previous.fast === event.shiftKey
        ? previous.repeats + 1
        : 0;
    movementRef.current = { key: event.key, fast: event.shiftKey, repeats };
    return moveKeyboardCursor(point, event.key, transform.zoom, event.shiftKey, bounds!, repeats);
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.key.startsWith("Arrow") || event.key === "Shift") {
      movementRef.current = { key: "", fast: false, repeats: 0 };
    }
  }

  function ensureCursorVisible() {
    const current = editRef.current;
    const point = current && preview
      ? preview[0]!.points[current.vertex < 0 ? 0 : current.vertex]!
      : cursorRef.current;
    if (!point || disabled) return;
    const next = options.revealPoint?.(point) ?? transform;
    if (current && (next.panX !== current.transform.panX || next.panY !== current.transform.panY)) {
      updateEdit({ ...current, transform: next });
    }
  }

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (!bounds || disabled) return false;
    const arrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key);
    const currentEdit = editRef.current;
    if (options.referenceEdit) {
      if (event.key === "[" || event.key === "]" || event.key.toLowerCase() === "n") {
        chooseReferenceTarget(1 - referenceVertexRef.current);
        return true;
      }
      if (arrow) {
        options.cancelPointerEdit();
        const points: [Point, Point] = [...options.referenceEdit.points];
        const next = movementPoint(points[referenceVertexRef.current]!, event);
        points[referenceVertexRef.current] = next;
        options.onReferenceChange(points);
        options.revealPoint?.(next);
        updateCursor(next);
        return true;
      }
      if (event.key === "Enter") {
        if (!event.repeat) options.onReferenceSave();
        return true;
      }
      if (event.key === "Escape") {
        options.onReferenceCancel();
        cancel();
        return true;
      }
      return false;
    }
    if (event.key.toLowerCase() === "e" && tool === "select" && !event.repeat) {
      if (!currentEdit) startEditing();
      return true;
    }
    if (
      currentEdit &&
      (event.key === "[" || event.key === "]" || event.key.toLowerCase() === "n")
    ) {
      if (currentEdit.base.length !== 1) return true;
      const count = currentEdit.base[0]!.points.length;
      const forward = event.key === "]" || (event.key.toLowerCase() === "n" && !event.shiftKey);
      chooseEditTarget(((currentEdit.vertex + 1 + (forward ? 1 : count)) % (count + 1)) - 1);
      return true;
    }
    if (currentEdit && event.key === "Escape") {
      cancel();
      setAnnouncement("Edit cancelled.");
      return true;
    }
    if (currentEdit && event.key === "Enter") {
      if (event.repeat) return true;
      const next = keyboardEditPreview({
        measurements: currentEdit.base,
        vertex: currentEdit.vertex,
        origin: currentEdit.origin,
        rawPoint: currentEdit.rawPoint,
        bounds,
        zoom: transform.zoom,
        snap,
        orthogonal,
        targets,
      });
      if (
        next.some((measurement) => !hasValidMeasurementPoints(measurement.type, measurement.points))
      ) {
        options.reportError(
          "This edit creates invalid geometry. Adjust the points or press Escape to cancel.",
        );
        return true;
      }
      const changed = next.some((measurement, index) =>
        measurement.points.some((point, i) => {
          const old = currentEdit.original[index]!.points[i]!;
          return point.x !== old.x || point.y !== old.y;
        }),
      );
      if (
        !changed ||
        options.commit(next.map(({ id, points }) => ({ pageNumber: page.pageNumber, id, points })))
      ) {
        cancel();
        setAnnouncement(changed ? "Edit saved." : "Geometry unchanged.");
      }
      return true;
    }
    if (arrow && (tool === "select" || tool === "calibrate" || isMeasurementType(tool))) {
      const origin =
        currentEdit?.rawPoint ??
        cursorRef.current ??
        clampPointToPage(screenToPage(options.screenCenter, transform), bounds);
      const next = movementPoint(origin, event);
      const effectivePoint = currentEdit
        ? keyboardEditPreview({
            measurements: currentEdit.base,
            vertex: currentEdit.vertex,
            origin: currentEdit.origin,
            rawPoint: next,
            bounds,
            zoom: transform.zoom,
            snap,
            orthogonal,
            targets,
          })[0]!.points[currentEdit.vertex < 0 ? 0 : currentEdit.vertex]!
        : next;
      const visibleTransform = options.revealPoint?.(effectivePoint) ?? transform;
      updateCursor(next);
      if (currentEdit) updateEdit({ ...currentEdit, transform: visibleTransform, rawPoint: next });
      else options.previewPoint(pageToScreen(next, visibleTransform), visibleTransform);
      return true;
    }
    if (event.key === " " && cursorRef.current) {
      if (event.repeat || currentEdit) return true;
      if (tool === "select") {
        const hit = options.showMeasurements
          ? keyboardHitMeasurement(page.measurements, cursorRef.current, transform.zoom)
          : null;
        if (hit) {
          options.select(hit.id, event.shiftKey);
          setAnnouncement(`Selected ${hit.name}. Press E to edit.`);
        } else setAnnouncement("No measurement at the cursor.");
      } else if (tool === "calibrate" || isMeasurementType(tool)) {
        options.placePoint(pageToScreen(cursorRef.current, transform));
        setAnnouncement(
          "Point placed. Arrows move the cursor; Space places the next point; Enter completes a path.",
        );
      }
      return true;
    }
    if (event.key === "Escape" && cursorRef.current && !options.draft) {
      cancel();
      return true;
    }
    return false;
  }

  const effectiveCursor =
    edit && preview ? (preview[0]?.points[edit.vertex < 0 ? 0 : edit.vertex] ?? cursor) : cursor;
  const editAnnouncement =
    edit && effectiveCursor
      ? `${edit.vertex < 0 ? "Moving selection" : `Editing vertex ${edit.vertex + 1}`}, X ${effectiveCursor.x.toFixed(2)}, Y ${effectiveCursor.y.toFixed(2)}. Enter saves; Escape cancels.`
      : announcement;
  return {
    cursor: effectiveCursor,
    editing: Boolean(edit),
    previewPage,
    announcement: editAnnouncement,
    handleKeyDown,
    handleKeyUp,
    ensureCursorVisible,
    chooseEditTarget,
    chooseReferenceTarget,
    referenceTarget,
    editTarget: edit?.vertex ?? -1,
    editableMeasurement: edit?.base.length === 1 ? edit.base[0]! : null,
    cancel,
  };
}
